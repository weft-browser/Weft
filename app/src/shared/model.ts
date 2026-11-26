// The browser model, shared by every process. Pure: no Electron, no DOM.
import type { TunnelStatus } from './wg';

export type Network = 'direct' | 'vpn' | 'proxy' | 'tor';
export type Fingerprint = 'standard' | 'randomized' | 'strict';
export type Icon = { kind: 'letter' } | { kind: 'svg'; id: string } | { kind: 'img'; src: string };

export interface Env {
  network: Network;
  region: string;
  proxy: string;
  locale: string;
  tz: string;
  fp: Fingerprint;
  disposable: boolean;
  ext: Record<string, boolean>;
}

export interface HistEntry { url: string; title: string; }

export interface Tab {
  id: string;
  url: string;
  title: string;
  pinned: boolean;
  group: string | null;
  icon: Icon | null;
  favicon: string | null;
  /** Own in-memory partition, wiped when the tab closes; never persisted, never in `closed`. */
  private: boolean;
  blocked: number;
  loading: boolean;
  canBack: boolean;
  canFwd: boolean;
  /** This tab's navigation history (newest last) and the entry it is on. */
  history: HistEntry[];
  histPos: number;
  zoom: number;
  /** Triage signals (triage.ts), all local. When the tab was last in front (epoch ms) and its total time there. */
  lastActive: number;
  activeMs: number;
  /** Live only, never persisted: playing sound; holds text typed since it last navigated. */
  audible: boolean;
  edited: boolean;
}

export interface Group {
  id: string;
  name: string;
  color: string;
  collapsed: boolean;
}

export interface Workspace {
  id: string;
  name: string;
  color: string;
  icon: Icon | null;
  env: Env;
  tabs: Tab[];
  groups: Group[];
  active: number;
}

export interface ClosedTab {
  wsId: string;
  tab: Tab;
}

export interface BrowserState {
  workspaces: Workspace[];
  activeWs: number;
  closed: ClosedTab[];
  leader: boolean;
  pendingCloseWs: string | null;
  extensions: string[];
  /** Regions offered in pickers: the configured ones, or placeholders when none are. */
  vpnRegions: string[];
  /** Regions that actually have a WireGuard config (or a legacy endpoint). */
  vpnConfigured: string[];
  /** Live tunnel state per region, for the ones that have been started. */
  vpnStatus: Record<string, TunnelStatus>;
  /** Whether the WireGuard engine (wireproxy) was found. */
  vpnEngine: boolean;
  vpnDir: string;
  /** `${wsId}|${host}` → tracker blocking switched off for that site in that workspace. */
  allow: Record<string, boolean>;
  /** A group main just created; the renderer opens its name for editing, then clears it. */
  renameGroup: string | null;
  uiScale: number;
  dataDir: string;
  /** Self-update, for the palette and the toast. Engine-neutral: the fork reports through the same shape. */
  update: UpdateState;
}

/** 'off' means this build does not update itself (a dev run, or a platform without a feed). */
export type UpdatePhase = 'off' | 'idle' | 'checking' | 'downloading' | 'ready' | 'error';
export interface UpdateState { phase: UpdatePhase; current: string; version: string; percent: number; detail: string; }

export const NETS: Network[] = ['direct', 'vpn', 'proxy', 'tor'];
export const NET_NAMES: Record<Network, string> = { direct: 'Direct', vpn: 'VPN', proxy: 'Proxy', tor: 'Tor' };
export const FPS: Fingerprint[] = ['standard', 'randomized', 'strict'];
export const FP_NAMES: Record<Fingerprint, string> = { standard: 'Standard', randomized: 'Randomized', strict: 'Strict' };
export const FP_HELP: Record<Fingerprint, string> = {
  standard: 'Looks like a normal Chromium browser. Best site compatibility.',
  randomized: 'Canvas, audio and font readings would vary per site and session. Not applied yet in this build.',
  strict: 'Everyone in strict mode would look the same. Not applied yet in this build.'
};
export const LOCALES = ['en-US', 'en-GB', 'it-IT', 'de-CH', 'en-SG'];
export const TIMEZONES = ['America/Los_Angeles', 'America/New_York', 'Europe/Zurich', 'Europe/Rome', 'Europe/Berlin', 'Asia/Singapore', 'UTC'];
export const DEFAULT_REGIONS = ['Seattle, US', 'New York, US', 'Zurich, CH', 'Frankfurt, DE', 'Milan, IT', 'Singapore, SG'];
export const PALETTE = ['#6aa9ff', '#f0a35e', '#7fd6a6', '#ff8f8f', '#c79bff', '#5fd3e0', '#e6d36a'];
export const SWATCHES = ['#6aa9ff', '#5fd3e0', '#7fd6a6', '#e6d36a', '#f0a35e', '#ff8f8f', '#ff6fb5', '#c79bff', '#f2f2f2', '#9aa1ab'];
export const GROUP_COLORS = ['#5fd3e0', '#7fd6a6', '#e6d36a', '#f0a35e', '#ff8f8f', '#ff6fb5', '#c79bff', '#6aa9ff'];
export const DISPOSABLE_COLOR = '#e5c07b';
export const PRIVATE_COLOR = '#c79bff';
export const ZOOM_STEPS = [0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];
export const UI_SCALES = [0.9, 1, 1.15];
export const SEARCH_URL = 'duckduckgo.com/?q=';

/** [id, label, svg path] — stroke icons, 24-unit viewBox. */
export const ICONS: ReadonlyArray<readonly [string, string, string]> = [
  ['briefcase', 'Briefcase', 'M3 8h18v12H3z M8 8V5h8v3 M3 13h18'],
  ['home', 'Home', 'M3 11l9-7 9 7 M5 10v10h14V10 M10 20v-6h4v6'],
  ['code', 'Code', 'M8 7l-5 5 5 5 M16 7l5 5-5 5'],
  ['terminal', 'Terminal', 'M4 6l6 6-6 6 M12 18h8'],
  ['plane', 'Plane', 'M2 13l8-1 4-8 2 1-2 7 6 1 1-2 1 1-1 3-3 1-1-1 2-1-6-1-2 7-2 1v-8l-8 1z'],
  ['radio', 'Antenna', 'M12 13v8 M9 21h6 M8.5 9.5a5 5 0 0 1 7 0 M5.5 6.5a9 9 0 0 1 13 0 M12 13a1 1 0 1 0 0-2a1 1 0 1 0 0 2'],
  ['dollar', 'Money', 'M12 3v18 M17 7H9.5a3 3 0 0 0 0 6h5a3 3 0 0 1 0 6H6'],
  ['cart', 'Shopping', 'M3 4h2l2.4 11h11l2-8H6 M9 20h.01 M18 20h.01'],
  ['heart', 'Heart', 'M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z'],
  ['star', 'Star', 'M12 3l2.8 5.8 6.2.9-4.5 4.4 1 6.2L12 17.4l-5.5 2.9 1-6.2L3 9.7l6.2-.9z'],
  ['book', 'Book', 'M4 19a2 2 0 0 1 2-2h14V3H6a2 2 0 0 0-2 2z M4 19a2 2 0 0 0 2 2h14v-4'],
  ['flask', 'Lab', 'M9 3h6 M10 3v6l-6 10a1.5 1.5 0 0 0 1.3 2h13.4a1.5 1.5 0 0 0 1.3-2L14 9V3 M7 15h10'],
  ['music', 'Music', 'M9 18V5l12-2v13 M9 18a3 3 0 1 1-6 0a3 3 0 1 1 6 0 M21 16a3 3 0 1 1-6 0a3 3 0 1 1 6 0'],
  ['shield', 'Shield', 'M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z'],
  ['globe', 'Globe', 'M3 12h18 M12 3a14 14 0 0 1 0 18 M12 3a14 14 0 0 0 0 18 M21 12a9 9 0 1 1-18 0a9 9 0 1 1 18 0']
];

export function iconPath(id: string): string {
  const f = ICONS.find((i) => i[0] === id);
  return f ? f[2] : '';
}

let seq = 0;
export function uid(prefix = 'id'): string {
  seq += 1;
  return `${prefix}-${Date.now().toString(36)}${seq.toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}

export function mkEnv(o: Partial<Env> | null | undefined, extNames: string[]): Env {
  const base: Env = { network: 'direct', region: DEFAULT_REGIONS[0]!, proxy: '', locale: 'en-US', tz: 'America/Los_Angeles', fp: 'standard', disposable: false, ext: {} };
  const env: Env = { ...base, ...(o ?? {}), ext: {} };
  const ext: Record<string, boolean> = {};
  extNames.forEach((n) => { ext[n] = !!(o?.ext && o.ext[n]); });
  Object.keys(o?.ext ?? {}).forEach((n) => { ext[n] = !!o!.ext![n]; });
  env.ext = ext;
  return env;
}

export function newTab(url = '', title = '', extra: Partial<Tab> = {}): Tab {
  const t: Tab = { id: uid('tab'), url, title: title || (url ? titleFor(url) : 'New tab'), pinned: false, group: null, icon: null, favicon: null, private: false, blocked: 0, loading: false, canBack: false, canFwd: false, history: [], histPos: 0, zoom: 1, lastActive: Date.now(), activeMs: 0, audible: false, edited: false, ...extra };
  if (t.private && !url && !title) t.title = 'Private tab';
  return t;
}

export function newWorkspace(name: string, color: string, env: Env, extra: Partial<Workspace> = {}): Workspace {
  return { id: uid('ws'), name, color, icon: null, env, tabs: [], groups: [], active: 0, ...extra };
}

export function hostOf(url: string): string {
  return stripScheme(url).split('/')[0]!.split('?')[0]!;
}

export function stripScheme(url: string): string {
  return (url || '').replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
}

export function titleFor(url: string): string {
  return hostOf(url).replace(/^www\./, '') || 'New tab';
}

export function isHex(v: string | null | undefined): boolean {
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v ?? '');
}

export function normHex(v: string): string {
  let h = String(v).toLowerCase();
  if (h.length === 4) h = '#' + h[1] + h[1] + h[2] + h[2] + h[3] + h[3];
  return h;
}

/** Text color for a workspace badge: the color itself, or near-white when it is too dark to read. */
export function readable(hex: string): string {
  const h = normHex(hex);
  const ch = [1, 3, 5].map((i) => {
    const c = parseInt(h.substring(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  const lum = 0.2126 * ch[0]! + 0.7152 * ch[1]! + 0.0722 * ch[2]!;
  return lum < 0.12 ? '#e8eaed' : h;
}

export function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'workspace';
}

/** What the chip says. Only a tunnel that is up earns a bare "VPN · City"; everything else says what is wrong. */
export function netLabel(env: Env, configured: string[] = [], status: Record<string, TunnelStatus> = {}): string {
  if (env.network === 'vpn') {
    const city = env.region.split(',')[0]!;
    if (!configured.includes(env.region)) return 'VPN · ' + city + ' · not configured';
    const s = status[env.region];
    if (!s || s.state === 'down') return 'VPN · ' + city + ' · down';
    if (s.state === 'starting') return 'VPN · ' + city + ' · connecting';
    return 'VPN · ' + city;
  }
  if (env.network === 'proxy') return 'Proxy · ' + (env.proxy || 'not set');
  if (env.network === 'tor') return 'Tor';
  return 'Direct';
}

export function seenAs(env: Env, configured: string[] = [], status: Record<string, TunnelStatus> = {}): string {
  let ip = 'your real IP';
  if (env.network === 'vpn') {
    const s = status[env.region];
    if (!configured.includes(env.region)) ip = 'your real IP (no WireGuard config for ' + env.region + ')';
    else if (s?.state === 'up') ip = 'the ' + env.region + ' exit of your VPN';
    else ip = 'nothing: the ' + env.region + ' tunnel is ' + (s?.state === 'starting' ? 'still connecting' : 'down') + ', so connections fail rather than leak';
  }
  if (env.network === 'proxy') ip = 'the proxy ' + (env.proxy || '(not set)');
  if (env.network === 'tor') ip = 'a Tor exit node';
  const fp = env.fp === 'standard' ? 'standard fingerprint' : env.fp + ' fingerprint (not applied yet)';
  return ip + ' · ' + env.locale + ' · ' + env.tz + ' · ' + fp;
}

export function looksLikeUrl(raw: string): boolean {
  const v = raw.trim();
  return !!v && !/\s/.test(v) && (/[.:]/.test(v) || v === 'localhost');
}

/** What the address bar turns typed text into. Returns a loadable URL. */
export function toNavigation(raw: string): { url: string; title: string } | null {
  const v = (raw || '').trim();
  if (!v) return null;
  if (!looksLikeUrl(v)) {
    return { url: 'https://' + SEARCH_URL + encodeURIComponent(v), title: 'Search: ' + v };
  }
  const url = /^[a-z][a-z0-9+.-]*:\/\//i.test(v) ? v : 'https://' + v;
  return { url, title: titleFor(url) };
}

export type StripItem = { type: 'pin' | 'tab'; j: number } | { type: 'chip'; g: Group };

/** Tab strip order: pins first, then tabs with their group chips, collapsed groups folded. */
export function stripOrder(ws: Workspace): StripItem[] {
  const has: Record<string, Group> = {};
  ws.groups.forEach((g) => { has[g.id] = g; });
  const out: StripItem[] = [];
  ws.tabs.forEach((t, j) => { if (t.pinned) out.push({ type: 'pin', j }); });
  const done: Record<string, boolean> = {};
  ws.tabs.forEach((t, j) => {
    if (t.pinned) return;
    const g = t.group ? has[t.group] : undefined;
    if (!g) { out.push({ type: 'tab', j }); return; }
    if (done[g.id]) return;
    done[g.id] = true;
    out.push({ type: 'chip', g });
    ws.tabs.forEach((t2, j2) => {
      if (!t2.pinned && t2.group === g.id && (!g.collapsed || j2 === ws.active)) out.push({ type: 'tab', j: j2 });
    });
  });
  return out;
}

export function navOrder(ws: Workspace): number[] {
  return stripOrder(ws).filter((o): o is { type: 'pin' | 'tab'; j: number } => o.type !== 'chip').map((o) => o.j);
}

export function activeTab(ws: Workspace | undefined): Tab | null {
  return ws ? ws.tabs[ws.active] ?? null : null;
}

export function nextZoom(cur: number, d: 1 | -1 | 0): number {
  if (d === 0) return 1;
  let i = ZOOM_STEPS.indexOf(cur);
  if (i < 0) i = ZOOM_STEPS.indexOf(1);
  return ZOOM_STEPS[Math.max(0, Math.min(ZOOM_STEPS.length - 1, i + d))]!;
}
