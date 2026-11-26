import { describe, expect, it } from 'vitest';
// @ts-expect-error plain .mjs script, no types
import { compareSemver, feedFiles, feedVersion, guard } from '../scripts/feed.mjs';

// The shape electron-builder 26 writes for an arm64 zip + dmg.
const feed = (v: string) => `version: ${v}
files:
  - url: Weft-${v}-arm64.zip
    sha512: abc==
    size: 123
  - url: Weft-${v}-arm64.dmg
    sha512: def==
    size: 456
path: Weft-${v}-arm64.zip
sha512: abc==
releaseDate: '2026-11-06T23:00:00.000Z'
`;

describe('feed', () => {
  it('reads the version and every referenced file', () => {
    expect(feedVersion(feed('0.2.0'))).toBe('0.2.0');
    expect(feedVersion("version: '1.0.0-beta.1'\n")).toBe('1.0.0-beta.1');
    expect(feedFiles(feed('0.2.0'))).toEqual(['Weft-0.2.0-arm64.zip', 'Weft-0.2.0-arm64.dmg']);
    expect(feedVersion('')).toBeNull();
  });

  it('orders versions by semver, not by string', () => {
    expect(compareSemver('0.10.0', '0.9.0')).toBe(1);
    expect(compareSemver('1.0.0', '1.0.0')).toBe(0);
    expect(compareSemver('1.0.0-beta.2', '1.0.0')).toBe(-1);
    expect(compareSemver('1.0.0-beta.10', '1.0.0-beta.2')).toBe(1);
    expect(compareSemver('1.0.0-alpha', '1.0.0-beta')).toBe(-1);
    expect(() => compareSemver('1.0', '1.0.0')).toThrow();
  });

  it('only moves forward: equal or older is refused, a first release is allowed', () => {
    expect(guard(feed('0.2.0'), '')).toBeNull();
    expect(guard(feed('0.2.0'), feed('0.1.9'))).toBeNull();
    expect(guard(feed('0.2.0'), feed('0.2.0'))).toMatch(/not greater/);
    expect(guard(feed('0.1.0'), feed('0.10.0'))).toMatch(/not greater/);
    expect(guard('version: 1.2\nfiles: []\n', '')).toMatch(/no valid version/);
    expect(guard('version: 1.2.0\n', '')).toMatch(/no files/);
  });
});
