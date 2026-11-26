#!/usr/bin/env node
// Drive a built Weft.app without a screen, through Playwright's CDP support (playwright-core from
// ../app). Opens a URL headless, waits, writes a screenshot, prints what the page and
// the browser process logged. The headless `--screenshot` switch cannot do this: it shoots at the
// load event, before an embedded page has produced a frame.
//
//   node scripts/drive.mjs [dev|release] <url> [--wait ms] [--out file.png]
//   node scripts/drive.mjs dev 'chrome://weft/?page=https://example.com' --wait 4000
import { chromium } from '../../app/node_modules/playwright-core/index.mjs';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const argv = process.argv.slice(2);
const profile = /^(dev|release)$/.test(argv[0] ?? '') ? argv.shift() : 'dev';
const url = argv.shift();
if (!url) { console.error('usage: drive.mjs [dev|release] <url> [--wait ms] [--out file.png]'); process.exit(2); }
const opt = (name, dflt) => { const i = argv.indexOf('--' + name); return i >= 0 ? argv[i + 1] : dflt; };
const wait = Number(opt('wait', '3000'));
const OUT = path.join(ROOT, 'chromium/src/out', profile, 'smoke');
fs.mkdirSync(OUT, { recursive: true });
const shot = path.resolve(opt('out', path.join(OUT, 'drive.png')));
const bin = path.join(ROOT, 'chromium/src/out', profile, 'Weft.app/Contents/MacOS/Weft');
// --data <dir>: a user data dir to keep (and reuse across runs: persistence); default: a fresh temp dir, removed at the end.
const keepData = opt('data', '');
const data = keepData ? path.resolve(keepData) : fs.mkdtempSync(path.join(os.tmpdir(), 'weft-drive-'));
fs.mkdirSync(data, { recursive: true });

// --serve: a local page that logs what each request carried (Accept-Language, Cookie) and sets a
// cookie, so workspace isolation and environment headers can be checked offline. `{{port}}` in
// the URL and in --do steps becomes its port.
let server = null;
let port = 0;
if (argv.includes('--serve')) {
  const http = await import('node:http');
  server = http.createServer((req, res) => {
    console.log(`request ${req.url} accept-language=${req.headers['accept-language'] ?? '-'} cookie=${req.headers.cookie ?? '-'}`);
    if (req.url.startsWith('/set')) res.setHeader('Set-Cookie', 'seen=1; Path=/');
    res.setHeader('Content-Type', 'text/html');
    // The page reports what it sees (timezone, language) as a request, since the embedded page's DOM is out of reach.
    // /track embeds a request to a tracker host: blocked by Weft, the tab's counter goes up.
    const tracker = req.url.startsWith('/track') ? '<img src="https://www.google-analytics.com/collect?v=1"><img src="https://static.doubleclick.net/instream/ad_status.js">' : '';
    res.end(`<title>Served ${req.url}</title><body style="background:#cfe">served ${req.url}${tracker}</body>
<script>document.addEventListener('keydown', (e) => fetch('/seen?key=' + encodeURIComponent(e.key))); if (!location.pathname.startsWith('/seen')) fetch('/seen?tz=' + encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone) + '&lang=' + encodeURIComponent(navigator.language) + '&from=' + encodeURIComponent(location.pathname));</script>`);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  port = server.address().port;
}
const withPort = (s) => s.replaceAll('{{port}}', String(port));

const stderr = [];
// A persistent context: the shell then runs in the regular profile, as in the real app (a plain
// launch() context is off-the-record, and workspaces hang off the regular profile).
const browser = await chromium.launchPersistentContext(data, {
  executablePath: bin,
  headless: true,
  viewport: { width: 1440, height: 900 },
  // Playwright's defaults switch extensions off process-wide; Weft loads them per workspace.
  ignoreDefaultArgs: ['--disable-extensions', '--disable-component-extensions-with-background-pages'],
  args: ['--allow-chrome-scheme-url', '--disable-features=MacAppCodeSignClone', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--enable-logging=stderr'],
  logger: { isEnabled: (name) => name === 'browser', log: (_n, _s, msg) => { const m = String(msg); if (!/ANGLESwapCGLLayer|CVDisplayLink|Keychain|Encryption is not|quarantine|Not implemented|waitpid|rendezvous|parent died|DelayBasedTimeSource|Identity Consistency|CacheStorage/.test(m)) stderr.push(m); } }
});
const page = browser.pages()[0] ?? await browser.newPage();
page.on('console', (m) => console.log('console.' + m.type() + ': ' + m.text()));
page.on('pageerror', (e) => console.log('pageerror: ' + (e.stack || e.message).split('\n').slice(0, 3).join(' | ')));
await page.goto(withPort(url), { waitUntil: 'load' });
await page.waitForTimeout(wait);
// --do "click .sel; fill .sel text; press Enter; wait 1500; ss name; eval js": drive the shell step by step.
for (const step of withPort(opt('do', '') || '').split(';').map((s) => s.trim()).filter(Boolean)) {
  const [verb, ...rest] = step.split(' ');
  const arg = rest.join(' ');
  if (verb === 'click') await page.click(arg);
  else if (verb === 'fill') { const [sel, ...text] = rest; await page.fill(sel, text.join(' ')); }
  else if (verb === 'press') await page.keyboard.press(arg);
  else if (verb === 'type') await page.keyboard.type(arg);
  else if (verb === 'wait') await page.waitForTimeout(Number(arg));
  else if (verb === 'ss') { const f = path.join(OUT, arg + '.png'); await page.screenshot({ path: f }); console.log('screenshot ' + f); }
  else if (verb === 'eval') console.log('eval: ' + JSON.stringify(await page.evaluate(arg)));
  else console.log('unknown step: ' + step);
}
await page.screenshot({ path: shot });
console.log('screenshot ' + shot);
const js = opt('eval', '');
if (js) console.log('eval: ' + JSON.stringify(await page.evaluate(js)));
const cdp = await browser.newCDPSession(page);
const { targetInfos } = await cdp.send('Target.getTargets');
for (const t of targetInfos) console.log(`target ${t.type} ${t.url}${t.attached ? ' (attached)' : ''}`);
await browser.close();
server?.close();
if (!keepData) fs.rmSync(data, { recursive: true, force: true });
for (const l of stderr) console.log('browser: ' + l.trim());
