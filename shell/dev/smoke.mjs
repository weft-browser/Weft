// Drives `npm run dev` in headless Chrome and fails on anything that is wrong: the shell boots on
// the fake engine, tabs and workspaces work from the keyboard, state survives a reload.
//   npm run dev -- --port 5199 --strictPort &   then   node dev/smoke.mjs http://localhost:5199/ [shots-dir]
import { chromium } from 'playwright-core';

const url = process.argv[2] ?? 'http://localhost:5173/';
const shots = process.argv[3];
const fails = [];
const check = (ok, what) => { console.log((ok ? 'ok    ' : 'FAIL  ') + what); if (!ok) fails.push(what); };

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const p = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
const leader = async (k) => { await p.evaluate(() => document.querySelector('.shell')?.focus()); await p.keyboard.press('Backquote'); await p.waitForTimeout(150); await p.keyboard.press(k); await p.waitForTimeout(300); };
const names = () => p.evaluate(async () => (await window.weft.getState()).workspaces.map((w) => w.name + ':' + w.tabs.map((t) => t.title).join(',')));
const shot = async (n) => { if (shots) await p.screenshot({ path: shots + '/' + n + '.png' }); };

await p.goto(url);
await p.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('weft-dev:')) localStorage.removeItem(k); });
await p.reload();
await p.waitForSelector('.shell', { timeout: 15000 });
await p.waitForTimeout(400);
check((await names()).join() === 'Workspace 1:New tab', 'boots with one workspace and one empty tab');

await p.click('#addr'); await p.keyboard.type('example.com'); await p.keyboard.press('Enter'); await p.waitForTimeout(400);
await leader('t'); await p.keyboard.type('example.com'); await p.keyboard.press('Enter'); await p.waitForTimeout(400);
check((await names())[0] === 'Workspace 1:example.com,example.com', 'the address bar and ` t open pages');
await shot('01-tabs');

// The class of bug: a `ui` event that follows a `state` event must act on the new state.
await leader('n'); await p.keyboard.type('Research'); await p.keyboard.press('Enter'); await p.waitForTimeout(300);
const afterNew = await names();
check(afterNew.length === 2 && afterNew[1].startsWith('Research:') && afterNew[0].startsWith('Workspace 1:'), 'a new workspace is the one its rename box names (' + afterNew.join(' / ') + ')');

await leader('k');
await leader('c'); await p.waitForTimeout(300);
const tidy = await p.locator('.tabs-panel').innerText();
check(/same page as/.test(tidy), 'Tidy suggests the duplicate tab');
await shot('02-tidy');
await p.keyboard.press('Meta+Enter'); await p.waitForTimeout(400);
await p.keyboard.press('Escape');
check((await names())[0] === 'Workspace 1:example.com', 'close-all closes it');

await p.waitForTimeout(600);   // the controller saves 400 ms after a change
await p.reload(); await p.waitForSelector('.shell'); await p.waitForTimeout(500);
check((await names()).join(' / ') === 'Workspace 1:example.com / Research:New tab', 'state survives a reload');
check(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors[0] : ''));

await browser.close();
if (fails.length) { console.log(fails.length + ' check(s) failed'); process.exit(1); }
