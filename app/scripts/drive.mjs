#!/usr/bin/env node
// Drive the built app (out/) through Playwright's Electron support, from a script of one command per
// line, or interactively from stdin. The point is to see the shell without a human at the screen:
// every `ss` writes a PNG of the shell window; `page-ss` one of the live page view.
//
//   npm run build && node scripts/drive.mjs scripts/smoke.drive
//   node scripts/drive.mjs            # REPL; "help" lists commands
//
// Each run gets its own WEFT_DATA_DIR (so it never touches, or collides with, a running instance)
// unless DRIVE_DATA_DIR is set. Screenshots land in DRIVE_SHOTS (default: ./.drive-shots).
import { _electron as electron } from 'playwright-core';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as readline from 'node:readline';

const APP_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SHOTS = path.resolve(process.env.DRIVE_SHOTS || path.join(APP_DIR, '.drive-shots'));
const DATA = process.env.DRIVE_DATA_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'weft-drive-'));
fs.mkdirSync(SHOTS, { recursive: true });

const bin = process.platform === 'darwin'
  ? path.join(APP_DIR, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron')
  : path.join(APP_DIR, 'node_modules/electron/dist/electron');

let app = null;
let shell = null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = (...a) => console.log(...a);

async function shellPage() {
  for (let i = 0; i < 50; i++) {
    const w = app.windows().find((p) => /\/index\.html$/.test(p.url()));
    if (w) return w;
    await sleep(100);
  }
  throw new Error('shell window not found; windows: ' + app.windows().map((w) => w.url()).join(', '));
}

const CMD = {
  async launch() {
    if (app) return out('already launched');
    app = await electron.launch({ executablePath: bin, args: [APP_DIR], env: { ...process.env, WEFT_DATA_DIR: DATA, ELECTRON_RENDERER_URL: '' }, timeout: 30_000 });
    shell = await shellPage();
    await shell.waitForSelector('.shell', { timeout: 10_000 });
    await sleep(300);
    out('launched; data dir ' + DATA);
  },
  async ss(name) {
    const f = path.join(SHOTS, (name || 'shot-' + Date.now()) + '.png');
    await shell.screenshot({ path: f });
    out('screenshot ' + f);
  },
  /** Screenshot the live page view (the WebContentsView), if a page is loaded. */
  async 'page-ss'(name) {
    const pg = app.windows().find((p) => !/\/(index|hud)\.html$/.test(p.url()) && !p.url().startsWith('devtools:'));
    if (!pg) return out('no page view');
    const f = path.join(SHOTS, (name || 'page-' + Date.now()) + '.png');
    await pg.screenshot({ path: f });
    out('screenshot ' + f + ' (' + pg.url() + ')');
  },
  async press(keys) { for (const k of keys.split(' ')) { await shell.keyboard.press(k); await sleep(120); } },
  async type(text) { await shell.keyboard.type(text, { delay: 20 }); },
  /** Keys typed here reach the shell document, not the page view: put focus on the shell root first. */
  async 'focus-shell'() { await shell.evaluate(() => document.querySelector('.shell')?.focus()); },
  /** Prefix key then a key, as if typed into the shell: `leader T` */
  async leader(k) { await CMD['focus-shell'](); await shell.keyboard.press('Backquote'); await sleep(150); await shell.keyboard.press(k); await sleep(250); },
  /** Keys typed INTO THE PAGE VIEW, the way a user types after clicking a page: `page-press Backquote :` */
  async 'page-press'(keys) {
    const pg = app.windows().find((p) => !/\/(index|hud)\.html$/.test(p.url()) && !p.url().startsWith('devtools:'));
    if (!pg) return out('no page view');
    await app.evaluate(({ webContents }, url) => webContents.getAllWebContents().find((w) => w.getURL() === url)?.focus(), pg.url());
    for (const k of keys.split(' ')) { await pg.keyboard.press(k); await sleep(150); }
  },
  /** Evaluate in the main process: `main BrowserWindow.getAllWindows()[0].webContents.isFocused()` */
  async main(js) { out(JSON.stringify(await app.evaluate((electron, src) => (0, eval)('(({ BrowserWindow, webContents, app }) => (' + src + '))')(electron), js))); },
  async click(sel) { await shell.locator(sel).first().click(); await sleep(200); },
  async rclick(sel) { await shell.locator(sel).first().click({ button: 'right' }); await sleep(200); },
  async hover(sel) { await shell.locator(sel).first().hover(); await sleep(300); },
  async 'shift-click'(sel) { await shell.locator(sel).first().click({ modifiers: ['Shift'] }); await sleep(200); },
  async text(sel) { out(await shell.locator(sel || 'body').first().innerText()); },
  async eval(js) { out(JSON.stringify(await shell.evaluate(js))); },
  async wait(ms) { await sleep(Number(ms) || 500); },
  async windows() { for (const w of app.windows()) out('  ' + w.url()); },
  async state() {
    const s = await app.evaluate(async ({ webContents }) => {
      const shellWc = webContents.getAllWebContents().find((w) => /\/index\.html$/.test(w.getURL()));
      return shellWc ? shellWc.executeJavaScript('window.weft.getState()') : null;
    });
    out(JSON.stringify(s && { activeWs: s.activeWs, workspaces: s.workspaces.map((w) => ({ name: w.name, active: w.active, tabs: w.tabs.map((t) => ({ title: t.title, url: t.url, private: t.private })) })) }, null, 1));
  },
  async quit() { if (app) await app.close().catch(() => {}); app = null; shell = null; },
  help() { out('commands: ' + Object.keys(CMD).join(', ')); }
};

// A scripted run is a check (the release workflow gates on it): any failed line fails the run.
let failed = 0;
async function run(line) {
  const t = line.trim();
  if (!t || t.startsWith('#')) return;
  const sp = t.indexOf(' ');
  const cmd = sp < 0 ? t : t.slice(0, sp);
  const arg = sp < 0 ? '' : t.slice(sp + 1);
  const fn = CMD[cmd];
  if (!fn) { failed += 1; return out('unknown: ' + cmd); }
  if (!app && cmd !== 'launch' && cmd !== 'help' && cmd !== 'quit') { failed += 1; return out('launch first'); }
  try { await fn(arg); } catch (e) { failed += 1; out('ERROR ' + cmd + ': ' + e.message); }
}

const script = process.argv[2];
if (script) {
  for (const line of fs.readFileSync(script, 'utf8').split('\n')) { out('> ' + line); await run(line); }
  await CMD.quit();
  if (failed) out(failed + ' command(s) failed');
  process.exit(failed ? 1 : 0);
} else {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: 'drive> ' });
  out('weft driver; "help" for commands, "launch" to start');
  rl.prompt();
  rl.on('line', async (l) => { await run(l); if (l.trim() === 'quit') process.exit(0); rl.prompt(); });
  rl.on('close', async () => { await CMD.quit(); process.exit(0); });
}
