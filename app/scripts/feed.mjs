// Pure helpers for publishing the update feed (latest-mac.yml), used by scripts/publish.sh and tested
// in test/feed.test.ts. Run as a CLI: `node scripts/feed.mjs guard <new.yml> <live.yml|->` exits 1
// unless the new feed's version is strictly greater than the live one; `files <new.yml>` prints the
// files the feed references, one per line.

const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;

/** The top-level `version:` of an electron-builder feed, or null if it has none. */
export function feedVersion(yml) {
  const m = /^version:\s*['"]?([^'"\s]+)['"]?\s*$/m.exec(yml ?? '');
  return m ? m[1] : null;
}

/** Every `url:` (and the legacy top-level `path:`) the feed points at, deduplicated. */
export function feedFiles(yml) {
  const out = new Set();
  for (const m of (yml ?? '').matchAll(/^\s*-?\s*(?:url|path):\s*['"]?([^'"\s]+)['"]?\s*$/gm)) out.add(m[1]);
  return [...out];
}

/** Semver precedence, enough for release tags: a pre-release sorts below its release. */
export function compareSemver(a, b) {
  const x = SEMVER.exec(a), y = SEMVER.exec(b);
  if (!x || !y) throw new Error('not a semver version: ' + (!x ? a : b));
  for (let i = 1; i <= 3; i++) { const d = Number(x[i]) - Number(y[i]); if (d) return Math.sign(d); }
  if (x[4] === y[4]) return 0;
  if (!x[4]) return 1;
  if (!y[4]) return -1;
  const p = x[4].split('.'), q = y[4].split('.');
  for (let i = 0; i < Math.max(p.length, q.length); i++) {
    if (p[i] === undefined) return -1;
    if (q[i] === undefined) return 1;
    const n = /^\d+$/.test(p[i]), m = /^\d+$/.test(q[i]);
    if (n && m) { const d = Number(p[i]) - Number(q[i]); if (d) return Math.sign(d); continue; }
    if (n !== m) return n ? -1 : 1;
    if (p[i] !== q[i]) return p[i] < q[i] ? -1 : 1;
  }
  return 0;
}

export const isSemver = (v) => SEMVER.test(v ?? '');

/** null when publishing `next` over `live` is allowed, else the reason it is not. A missing live feed is a first release. */
export function guard(nextYml, liveYml) {
  const next = feedVersion(nextYml);
  if (!next || !isSemver(next)) return 'new feed has no valid version (' + next + ')';
  if (!feedFiles(nextYml).length) return 'new feed references no files';
  const live = liveYml ? feedVersion(liveYml) : null;
  if (!live) return null;
  return compareSemver(next, live) > 0 ? null : 'new version ' + next + ' is not greater than live ' + live;
}

// Run as a script? Compared by real path: on macOS /var is a symlink to /private/var, and a guard that
// silently does nothing because the paths differ would wave every release through.
const { readFileSync, realpathSync } = await import('node:fs');
const { fileURLToPath } = await import('node:url');
const isMain = !!process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));

if (isMain) {
  const [cmd, a, b] = process.argv.slice(2);
  const read = (f) => (f === '-' || !f ? '' : readFileSync(f, 'utf8'));
  if (cmd === 'guard') {
    const why = guard(read(a), read(b));
    if (why) { console.error('downgrade guard: ' + why); process.exit(1); }
    console.log('downgrade guard OK: ' + feedVersion(read(a)) + ' > ' + (feedVersion(read(b)) ?? 'nothing live'));
  } else if (cmd === 'files') {
    console.log(feedFiles(read(a)).join('\n'));
  } else if (cmd === 'version') {
    const v = feedVersion(read(a));
    if (!v) process.exit(1);
    console.log(v);
  } else if (cmd === 'semver') {
    process.exit(isSemver(a) ? 0 : 1);
  } else {
    console.error('usage: feed.mjs guard <new.yml> <live.yml|-> | files <new.yml> | version <yml> | semver <v>');
    process.exit(2);
  }
}
