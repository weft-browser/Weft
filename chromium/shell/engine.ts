// The shell's side of the engine protocol: what Electron's WebContents/session gave browser.ts,
// over chrome.send. Replies come back through window.__weft.resolve(requestId, reply), events
// through window.__weft.event(event). The browser side is chrome/browser/ui/webui/weft/weft_ui.cc.
import type { HistEntry } from '../../shell/src/shared/model';

declare const chrome: { send(message: string, args?: unknown[]): void };

export type PageEvent =
  /** `navigated`: a new document just committed (reloads included). */
  | { type: 'page'; id: string; url: string; title: string; loading: boolean; canBack: boolean; canFwd: boolean; favicon: string; history: HistEntry[]; histPos: number; navigated: boolean }
  | { type: 'crashed'; id: string; status: number }
  | { type: 'hover'; id: string; url: string }
  /** A link the page wants in a new tab (target=_blank, window.open, modifier-clicks). */
  | { type: 'openLink'; id: string; url: string; activate: boolean }
  /** A key the page did not get to see: the prefix key, or what followed it (the engine mirrors the leader state). */
  | { type: 'key'; id: string; key: string; code: string; ctrl: boolean; meta: boolean; alt: boolean; inInput: boolean }
  /** A third-party request to a tracker was cancelled. */
  | { type: 'blocked'; id: string }
  /** Something the engine could not do, for a toast (an extension that did not load). */
  | { type: 'warn'; text: string };

/** Where a page's storage lives: the workspace's profile, a disposable workspace's in-memory one, or a private tab's own. */
export type PageMode = 'persist' | 'disposable' | 'private';

/** What the engine applies of an environment: proxy rules (empty = direct), Accept-Language locale, timezone + locale
 *  emulation, and which unpacked extensions (by folder name) are on. */
export interface EngineEnv { rules: string; locale: string; tz: string; ext: Record<string, boolean>; }

let seq = 0;
const pending = new Map<string, (reply: unknown) => void>();
const listeners = new Set<(e: PageEvent) => void>();

(window as unknown as { __weft: unknown }).__weft = {
  resolve(id: string, reply: unknown): void { pending.get(id)?.(reply); pending.delete(id); },
  event(e: PageEvent): void { listeners.forEach((cb) => cb(e)); }
};

const ask = <T>(message: string, args: unknown[] = []): Promise<T> =>
  new Promise<T>((res) => { const id = 'r' + (++seq); pending.set(id, res as (reply: unknown) => void); chrome.send(message, [id, ...args]); });

export type PageAction = 'navigate' | 'back' | 'forward' | 'reload' | 'stop' | 'goToIndex' | 'zoom' | 'focus' | 'destroy';

export const engine = {
  boot: () => ask<{ version: string; dataDir: string }>('getBoot'),
  /** The shell's leader state, mirrored so the engine can swallow the keys that follow the prefix inside pages. */
  setLeader: (on: boolean): void => chrome.send('setLeader', [on]),
  /** Weft's own files under the data dir (state.json, workspaces/<slug>.env.toml); names are relative, no '..'. */
  readFile: (name: string) => ask<{ text: string | null }>('readFile', [name]),
  writeFile: (name: string, text: string): void => chrome.send('writeFile', [name, text]),
  removeFile: (name: string): void => chrome.send('removeFile', [name]),
  listDir: (name: string) => ask<{ names: string[] }>('listDir', [name]),
  /** Unpacked extensions: the folders under <data dir>/extensions with a manifest.json. */
  listExtensions: () => ask<{ names: string[] }>('listExtensions'),
  /** A page (a WebContents) with the shell's id for it, in the workspace's profile; the reply names the surface-embed content id to paint it with. */
  createPage: (id: string, url: string, ws: string, mode: PageMode) => ask<{ contentId?: string; error?: string }>('createPage', [id, url, ws, mode]),
  page: (id: string, action: PageAction, arg: string | number | null = null): void => chrome.send('page', [id, action, arg]),
  /** Applied to the workspace's profile now, or when it loads; creates the profile if it does not exist yet. */
  setEnv: (ws: string, disposable: boolean, env: EngineEnv): void => chrome.send('setEnv', [ws, disposable, env]),
  /** Forget a workspace; a disposable one's storage goes with it. */
  wipe: (ws: string): void => chrome.send('wipe', [ws]),
  /** The tracker blocklist, and the "<wsId>|<host>" pairs where blocking is off; the engine cancels the rest. */
  setTrackers: (hosts: string[]): void => chrome.send('setTrackers', [hosts]),
  setAllow: (keys: string[]): void => chrome.send('setAllow', [keys]),
  /** Cookies, storage and cache of one site in one workspace; resolves once they are gone. */
  clearSite: (ws: string, host: string) => ask<Record<string, never>>('clearSite', [ws, host]),
  onPage: (cb: (e: PageEvent) => void): void => { listeners.add(cb); }
};
