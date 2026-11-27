import { describe, expect, it } from 'vitest';
import { newTab, newWorkspace, mkEnv, type Tab } from '../src/shared/model';
import { MAX_STRETCH, byImportance, closeSuggestions, endStretch, importance, isSearch, samePage, sortByImportance, why } from '../src/shared/triage';

const NOW = Date.UTC(2026, 10, 25, 12);
const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR;
const tab = (url: string, o: Partial<Tab> = {}): Tab => newTab(url, '', { lastActive: NOW, ...o });
const ws = (tabs: Tab[], active = 0) => newWorkspace('W', '#6aa9ff', mkEnv(null, []), { tabs, active });

describe('time in front', () => {
  it('adds the stretch and stamps the tab as used', () => {
    const t = tab('https://a.example', { lastActive: 0 });
    endStretch(t, NOW - 5 * MIN, NOW);
    expect(t.activeMs).toBe(5 * MIN);
    expect(t.lastActive).toBe(NOW);
  });
  it('caps one stretch, so a Mac left awake on a tab does not make it important', () => {
    const t = tab('https://a.example');
    endStretch(t, NOW - 9 * HOUR, NOW);
    expect(t.activeMs).toBe(MAX_STRETCH);
  });
  it('ignores a clock that went backwards', () => {
    const t = tab('https://a.example');
    endStretch(t, NOW + HOUR, NOW);
    expect(t.activeMs).toBe(0);
  });
});

describe('importance', () => {
  it('ranks current, then pinned, then busy, then ordinary tabs by use', () => {
    const w = ws([
      tab('https://old.example', { lastActive: NOW - 5 * DAY }),
      tab('https://pin.example', { pinned: true, lastActive: NOW - 9 * DAY }),
      tab('https://cur.example'),
      tab('https://recent.example', { lastActive: NOW - 10 * MIN, activeMs: 40 * MIN }),
      tab('https://music.example', { audible: true, lastActive: NOW - 3 * DAY })
    ], 2);
    expect(byImportance(w, NOW)).toEqual([2, 1, 4, 3, 0]);
  });
  it('weighs recent use over long-ago reading', () => {
    const fresh = tab('https://a.example', { lastActive: NOW - 5 * MIN, activeMs: MIN });
    const read = tab('https://b.example', { lastActive: NOW - 4 * DAY, activeMs: 3 * HOUR });
    expect(importance(fresh, NOW)).toBeGreaterThan(importance(read, NOW));
  });
  it('explains itself in words', () => {
    expect(why(tab('https://a.example', { lastActive: NOW - 2 * HOUR, activeMs: 12 * MIN, pinned: true }), NOW)).toBe('pinned · used 2 h ago · 12 min in front');
    expect(why(tab('https://a.example'), NOW, true)).toBe('current tab');
  });
});

describe('sort by importance', () => {
  it('keeps pins first in their own order, keeps the active tab active, moves the rest', () => {
    const p1 = tab('https://p1.example', { pinned: true, lastActive: NOW - 9 * DAY });
    const p2 = tab('https://p2.example', { pinned: true });
    const old = tab('https://old.example', { lastActive: NOW - 4 * DAY });
    const hot = tab('https://hot.example', { lastActive: NOW - MIN, activeMs: HOUR });
    const cur = tab('https://cur.example', { lastActive: NOW - 6 * DAY });
    const w = ws([p1, p2, old, hot, cur], 4);
    sortByImportance(w, NOW);
    expect(w.tabs).toEqual([p1, p2, cur, hot, old]);
    expect(w.tabs[w.active]).toBe(cur);
  });
});

describe('close suggestions', () => {
  it('finds blanks, duplicates, finished searches, stale and skimmed tabs, with reasons', () => {
    const w = ws([
      tab('https://cur.example'),
      tab(''),
      tab('https://docs.example/page/', { lastActive: NOW - 2 * DAY, activeMs: 20 * MIN }),
      tab('http://www.docs.example/page#intro', { lastActive: NOW - 3 * HOUR }),
      tab('https://duckduckgo.com/?q=weft', { lastActive: NOW - 2 * HOUR }),
      tab('https://old.example', { lastActive: NOW - 4 * DAY, activeMs: HOUR }),
      tab('https://skim.example', { lastActive: NOW - 30 * HOUR, activeMs: 10_000 }),
      tab('https://fresh.example', { lastActive: NOW - 20 * MIN })
    ]);
    const s = closeSuggestions(w, NOW);
    expect(s.map((x) => [x.j, x.reason])).toEqual([[1, 'blank'], [2, 'duplicate'], [4, 'search'], [5, 'stale'], [6, 'skimmed']]);
    expect(s[3]!.text).toBe('not opened in 4 days');
    expect(s.every((x) => x.id === w.tabs[x.j]!.id)).toBe(true);
  });
  it('never suggests the current, pinned, audible, edited or private tab, however old', () => {
    const old = { lastActive: NOW - 30 * DAY };
    const w = ws([
      tab('https://cur.example', old),
      tab('https://pin.example', { ...old, pinned: true }),
      tab('https://music.example', { ...old, audible: true }),
      tab('https://draft.example', { ...old, edited: true }),
      tab('https://secret.example', { ...old, private: true }),
      tab('', { private: true })
    ]);
    expect(closeSuggestions(w, NOW)).toEqual([]);
  });
  it('keeps the more important copy of a duplicate, even when it comes later in the strip', () => {
    const w = ws([tab('https://x.example'), tab('https://a.example/', { lastActive: NOW - DAY }), tab('https://a.example', { lastActive: NOW - MIN })]);
    expect(closeSuggestions(w, NOW).map((x) => x.j)).toEqual([1]);
  });
  it('never offers a protected tab as the duplicate to close', () => {
    const w = ws([tab('https://a.example', { lastActive: NOW - DAY }), tab('https://a.example', { pinned: true, lastActive: NOW - 5 * DAY })], 0);
    expect(closeSuggestions(w, NOW)).toEqual([]);
  });
});

describe('page identity', () => {
  it('treats scheme, www, fragment and trailing slash as the same page; query and path as different', () => {
    expect(samePage('https://www.a.example/x/#top')).toBe(samePage('http://a.example/x'));
    expect(samePage('https://a.example/x?p=1')).not.toBe(samePage('https://a.example/x?p=2'));
    expect(samePage('https://a.example/x')).not.toBe(samePage('https://a.example/y'));
  });
  it('recognises result pages of common search engines only', () => {
    expect(isSearch('https://duckduckgo.com/?q=a')).toBe(true);
    expect(isSearch('https://www.google.co.uk/search?client=x&q=a')).toBe(true);
    expect(isSearch('https://duckduckgo.com/about')).toBe(false);
    expect(isSearch('https://shop.example/?q=a')).toBe(false);
  });
});
