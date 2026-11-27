// Commands flow renderer → main; events flow main → renderer. Both sides import this.
import type { BrowserState, Env, Group, Icon } from './model';
import type { UiAction } from './keys';

export interface Rect { x: number; y: number; w: number; h: number; }

export type Command =
  | { type: 'selectWs'; i: number }
  | { type: 'cycleWs'; d: 1 | -1 }
  | { type: 'addWs' }
  | { type: 'addDisposable' }
  | { type: 'renameWs'; i: number; name: string }
  | { type: 'closeWs'; i?: number }
  | { type: 'setWsColor'; hex: string }
  | { type: 'setWsIcon'; icon: Icon | null }
  | { type: 'updateEnv'; patch: Partial<Env>; ws?: number }
  | { type: 'toggleExt'; name: string }
  | { type: 'applyCfg'; text: string }
  | { type: 'newWsFromCfg'; text: string }
  | { type: 'selectTab'; ws?: number; j: number }
  | { type: 'cycleTab'; d: 1 | -1 }
  | { type: 'newTab'; url?: string; private?: boolean; ws?: number }
  /** Open a link in a new tab next to the current one, without leaving it (or in another workspace). */
  | { type: 'openLink'; url: string; private?: boolean; ws?: number }
  | { type: 'jumpTo'; p: number }
  | { type: 'copyLink'; url: string }
  | { type: 'closeTab'; j?: number; ws?: number }
  /** Close several tabs by id (indices shift as they go), e.g. the accepted close suggestions. */
  | { type: 'closeTabs'; ids: string[]; ws?: number }
  /** Reorder the current workspace's strip by importance (triage.ts); pins keep their order. */
  | { type: 'sortTabs' }
  /** Save the current page's readable text as a Markdown file the user places. */
  | { type: 'savePage' }
  | { type: 'reopen' }
  | { type: 'togglePin'; j?: number }
  | { type: 'setTabIcon'; j?: number; icon: Icon | null }
  | { type: 'newGroup'; j?: number }
  | { type: 'renameGroup'; gid: string; name: string }
  | { type: 'setTabGroup'; j: number; gid: string | null }
  | { type: 'updateGroup'; gid: string; patch: Partial<Group> }
  | { type: 'ungroup'; gid: string }
  | { type: 'closeGroup'; gid: string }
  | { type: 'toggleActiveGroup' }
  | { type: 'navigate'; raw: string }
  | { type: 'back' }
  | { type: 'forward' }
  | { type: 'reload' }
  | { type: 'zoom'; d: 1 | -1 | 0 }
  | { type: 'toggleProtection' }
  | { type: 'clearSiteData' }
  | { type: 'hints' }
  | { type: 'layout'; rect: Rect }
  | { type: 'overlay'; on: boolean }
  | { type: 'focusPage' }
  | { type: 'uiScale'; v: number }
  | { type: 'key'; key: string; ctrl: boolean; meta: boolean; alt: boolean; code: string; inInput: boolean }
  | { type: 'toast'; text: string }
  | { type: 'openExtensionsDir' }
  | { type: 'openVpnDir' }
  | { type: 'checkUpdates' }
  /** Quit and relaunch on the downloaded version; ignored unless one is ready. */
  | { type: 'installUpdate' }
  /** A Web Store link or id: download, unpack into the extensions folder, switch it on here. */
  | { type: 'installExt'; ref: string }
  /** A still of the live page, so the shell can show it under something that must float over the page. */
  | { type: 'pageShot' };

export interface HudState { leader: boolean; toast: string; hover: string; hinting: boolean; }

export type Event =
  | { type: 'state'; state: BrowserState }
  | { type: 'ui'; action: UiAction }
  | { type: 'cfg'; ok: boolean; text: string }
  | { type: 'ext'; ok: boolean; text: string }
  | { type: 'shot'; jpeg: Uint8Array | null }
  | { type: 'hud'; hud: HudState };

export const CH = { command: 'weft:command', event: 'weft:event', state: 'weft:state', hud: 'weft:hud' } as const;

export interface WeftApi {
  getState(): Promise<BrowserState>;
  send(cmd: Command): void;
  on(cb: (e: Event) => void): () => void;
}
