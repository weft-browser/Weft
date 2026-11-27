// `npm run dev`: the real shell and the real controller in an ordinary browser tab, against a fake
// engine. chrome.send is installed before the fork's entry is imported, because engine.ts and the
// controller start talking the moment they load.
import { FakeEngine } from './fake-engine';

type Hooks = { resolve(id: string, reply: unknown): void; event(e: unknown): void };
const w = window as unknown as { chrome?: { send?: unknown }; __weft: Hooks; weftDev: FakeEngine };
const fake = new FakeEngine(() => w.__weft, window.localStorage);
w.chrome = Object.assign(w.chrome ?? {}, { send: fake.send });
w.weftDev = fake;   // in the console: weftDev.log

// A real page cannot be painted here. Hide the embeds so the shell's own backdrop (title, address,
// what the site would see) shows where the page would be.
const style = document.createElement('style');
style.textContent = '.page-embed{display:none!important}.dev-flag{position:fixed;right:10px;bottom:8px;z-index:2000;padding:4px 9px;border-radius:6px;background:#e5c07b;color:#14171c;font:600 11px/1.4 ui-monospace,Menlo,monospace;pointer-events:none}';
document.head.appendChild(style);
const flag = document.createElement('div');
flag.className = 'dev-flag';
flag.textContent = 'fake engine: no page is loaded, nothing is enforced';
document.body.appendChild(flag);

void import('../../chromium/shell/main');
