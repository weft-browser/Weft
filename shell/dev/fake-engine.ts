// A stand-in for the browser process, for working on the shell without a Chromium build.
// It answers the engine protocol (chromium/shell/engine.ts) the way weft_ui.cc does, but pages are
// only bookkeeping: a URL, a title, a history. Nothing is fetched and nothing is enforced, so this
// shows what the interface does, never what the browser does. Files go to the storage it is given.
type Send = (message: string, args?: unknown[]) => void;
interface Hooks { resolve(id: string, reply: unknown): void; event(e: unknown): void; }
export interface KV { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void; key(i: number): string | null; readonly length: number; }

interface FakePage { history: { url: string; title: string }[]; pos: number; }

export const FAKE_EXTENSIONS = ['uBlock Origin Lite', 'Dark Reader'];
const PREFIX = 'weft-dev:';

export function titleOf(url: string): string {
  try { const u = new URL(url); const q = u.searchParams.get('q'); return q ? q + ' — search' : u.hostname.replace(/^www\./, '') + (u.pathname.length > 1 ? u.pathname : ''); } catch { return url; }
}

export class FakeEngine {
  private pages = new Map<string, FakePage>();
  /** Every message received, newest last: what a test or a curious developer reads. */
  readonly log: { message: string; args: unknown[] }[] = [];

  constructor(private hooks: () => Hooks, private store: KV, private later: (fn: () => void) => void = (fn) => { setTimeout(fn, 60); }) {}

  readonly send: Send = (message, args = []) => {
    this.log.push({ message, args });
    switch (message) {
      case 'getBoot': return this.reply(args[0], { version: 'dev (fake engine)', dataDir: 'this browser tab’s storage' });
      case 'listExtensions': return this.reply(args[0], { names: FAKE_EXTENSIONS });
      case 'readFile': return this.reply(args[0], { text: this.store.getItem(PREFIX + String(args[1])) });
      case 'listDir': return this.reply(args[0], { names: this.names(String(args[1])) });
      case 'writeFile': this.store.setItem(PREFIX + String(args[0]), String(args[1])); return;
      case 'removeFile': this.store.removeItem(PREFIX + String(args[0])); return;
      case 'clearSite': return this.reply(args[0], {});
      case 'createPage': {
        const [rid, id, url] = args as [string, string, string];
        this.pages.set(id, { history: [{ url, title: titleOf(url) }], pos: 0 });
        this.reply(rid, { contentId: 'fake-' + id });
        this.emit(id, true, true);
        this.later(() => this.emit(id, false, false));
        return;
      }
      case 'page': this.act(String(args[0]), String(args[1]), args[2] as string | number | null); return;
      default: return;   // setEnv, wipe, setTrackers, setAllow, setLeader: accepted, not enforced
    }
  };

  private names(dir: string): string[] {
    const at = PREFIX + dir.replace(/\/?$/, '/');
    const out: string[] = [];
    for (let i = 0; i < this.store.length; i++) { const k = this.store.key(i); if (k && k.startsWith(at)) out.push(k.slice(at.length)); }
    return out.sort();
  }

  private act(id: string, action: string, arg: string | number | null): void {
    const p = this.pages.get(id);
    if (!p) return;
    if (action === 'destroy') { this.pages.delete(id); return; }
    if (action === 'navigate' && typeof arg === 'string') { p.history = p.history.slice(0, p.pos + 1).concat([{ url: arg, title: titleOf(arg) }]); p.pos = p.history.length - 1; }
    else if (action === 'back' && p.pos > 0) p.pos -= 1;
    else if (action === 'forward' && p.pos < p.history.length - 1) p.pos += 1;
    else if (action === 'goToIndex' && typeof arg === 'number' && arg >= 0 && arg < p.history.length) p.pos = arg;
    else if (action !== 'reload') return;   // zoom, focus, stop: nothing to show
    this.emit(id, true, true);
    this.later(() => this.emit(id, false, false));
  }

  private emit(id: string, loading: boolean, navigated: boolean): void {
    const p = this.pages.get(id);
    if (!p) return;
    const cur = p.history[p.pos]!;
    this.hooks().event({ type: 'page', id, url: cur.url, title: cur.title, loading, canBack: p.pos > 0, canFwd: p.pos < p.history.length - 1, favicon: '', history: p.history.slice(), histPos: p.pos, navigated });
  }

  private reply(id: unknown, value: unknown): void { this.later(() => this.hooks().resolve(String(id), value)); }
}
