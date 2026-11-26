// Tab triage from local signals only: which tabs matter, which look finished. No page content, no
// model, nothing leaves the device. The signals are when a tab was last in front, how long it has
// been in front in total, and what it is doing right now (playing sound, holding typed text).
import { hostOf, stripScheme, type Tab, type Workspace } from './model';

const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR;

/** One stretch in front counts for at most this long, so a Mac left awake on a tab does not make it "important". */
export const MAX_STRETCH = 30 * MIN;
export const STALE_AFTER = 3 * DAY;
export const SKIMMED_AFTER = DAY;
export const SKIMMED_UNDER = 30_000;
export const SEARCH_DONE_AFTER = HOUR;
const HALF_LIFE = 12 * HOUR;

/** Add the stretch since `since` to the tab's time in front and stamp it as just used. */
export function endStretch(tab: Tab, since: number, now: number): void {
  tab.activeMs += Math.max(0, Math.min(now - since, MAX_STRETCH));
  tab.lastActive = now;
}

/** A tab nobody can lose by closing: pinned, the current one, or busy with something the user would miss. */
export function isProtected(tab: Tab, current: boolean): boolean {
  return current || tab.pinned || tab.audible || tab.edited;
}

/** 0‥1 for an ordinary tab: recent use (halving every 12 h) weighs more than total time in front.
 *  The current tab, pins and busy tabs sit above every ordinary tab, in that order. */
export function importance(tab: Tab, now: number, current = false): number {
  const age = Math.max(0, now - tab.lastActive);
  const recency = Math.pow(0.5, age / HALF_LIFE);
  const minutes = tab.activeMs / MIN;
  const engagement = Math.min(1, Math.log2(1 + minutes) / 7);
  const base = 0.6 * recency + 0.4 * engagement;
  if (current) return 4 + base;
  if (tab.pinned) return 3 + base;
  if (tab.audible || tab.edited) return 2 + base;
  return base;
}

export function ago(ms: number): string {
  if (ms < MIN) return 'just now';
  if (ms < HOUR) return Math.floor(ms / MIN) + ' min ago';
  if (ms < DAY) return Math.floor(ms / HOUR) + ' h ago';
  const d = Math.floor(ms / DAY);
  return d === 1 ? 'yesterday' : d + ' days ago';
}

function span(ms: number): string {
  if (ms < MIN) return 'under a minute';
  if (ms < HOUR) return Math.round(ms / MIN) + ' min';
  return (Math.round((ms / HOUR) * 10) / 10) + ' h';
}

/** The line shown under a tab when lists are ordered by importance. */
export function why(tab: Tab, now: number, current = false): string {
  if (current) return 'current tab';
  const bits: string[] = [];
  if (tab.pinned) bits.push('pinned');
  if (tab.audible) bits.push('playing sound');
  if (tab.edited) bits.push('has typed text');
  bits.push('used ' + ago(now - tab.lastActive), span(tab.activeMs) + ' in front');
  return bits.join(' · ');
}

/** Tab indices of a workspace, most important first; ties keep strip order. */
export function byImportance(ws: Workspace, now: number): number[] {
  return ws.tabs.map((t, j) => ({ j, s: importance(t, now, j === ws.active) })).sort((a, b) => b.s - a.s || a.j - b.j).map((x) => x.j);
}

/** Reorder the strip by importance. Pins keep their order (they were placed by hand); a group lands
 *  where its most important tab ranks, its tabs ordered inside it. The active tab stays active. */
export function sortByImportance(ws: Workspace, now: number): void {
  const active = ws.tabs[ws.active];
  const pins = ws.tabs.filter((t) => t.pinned);
  const rest = ws.tabs.filter((t) => !t.pinned).map((t) => ({ t, s: importance(t, now, t === active) }));
  rest.sort((a, b) => b.s - a.s);
  ws.tabs = pins.concat(rest.map((x) => x.t));
  ws.active = Math.max(0, active ? ws.tabs.indexOf(active) : 0);
}

/** The URL with scheme, `www.`, fragment and trailing slash dropped: two tabs on the same page compare equal. */
export function samePage(url: string): string {
  return stripScheme(url).replace(/^www\./i, '').replace(/#.*$/, '').replace(/\/+(\?|$)/, '$1').toLowerCase();
}

const SEARCH_HOSTS = /^(www\.)?(duckduckgo\.com|google\.[a-z.]+|bing\.com|search\.brave\.com|kagi\.com|startpage\.com|ecosia\.org)$/i;

export function isSearch(url: string): boolean {
  return SEARCH_HOSTS.test(hostOf(url)) && /[?&]q=/.test(url);
}

export type Reason = 'duplicate' | 'blank' | 'search' | 'stale' | 'skimmed';
export interface Suggestion { j: number; id: string; reason: Reason; text: string; }

/** Tabs that look finished, with the reason in words. Never a protected tab, never a private one
 *  (it is gone on close anyway and is not ours to judge). Ordered by strip position. */
export function closeSuggestions(ws: Workspace, now: number): Suggestion[] {
  const out: Suggestion[] = [];
  const keeper = new Map<string, number>();
  ws.tabs.forEach((t, j) => {
    if (!t.url || t.private) return;
    const k = samePage(t.url);
    const prev = keeper.get(k);
    if (prev === undefined || importance(t, now, j === ws.active) > importance(ws.tabs[prev]!, now, prev === ws.active)) keeper.set(k, j);
  });
  ws.tabs.forEach((t, j) => {
    if (t.private || isProtected(t, j === ws.active)) return;
    const idle = now - t.lastActive;
    const add = (reason: Reason, text: string): void => { out.push({ j, id: t.id, reason, text }); };
    if (!t.url) { add('blank', 'empty tab'); return; }
    const k = keeper.get(samePage(t.url));
    if (k !== undefined && k !== j) { add('duplicate', 'same page as “' + ws.tabs[k]!.title + '”'); return; }
    if (isSearch(t.url) && idle >= SEARCH_DONE_AFTER) { add('search', 'search results, used ' + ago(idle)); return; }
    if (idle >= STALE_AFTER) { add('stale', 'not opened in ' + Math.floor(idle / DAY) + ' days'); return; }
    if (idle >= SKIMMED_AFTER && t.activeMs < SKIMMED_UNDER) add('skimmed', 'opened ' + ago(idle) + ', under 30 s in front');
  });
  return out;
}
