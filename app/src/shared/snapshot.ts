// state.json — the persisted browser state. A versioned contract: decode tolerantly, per record.
import { mkEnv, newTab, newWorkspace, type ClosedTab, type Env, type Icon, type Tab, type Workspace } from './model';

export const SNAPSHOT_VERSION = 1;

export interface Snapshot {
  v: number;
  workspaces: Workspace[];
  activeWs: number;
  closed: ClosedTab[];
  allow: Record<string, boolean>;
}

export interface Decoded {
  workspaces: Workspace[];
  activeWs: number;
  closed: ClosedTab[];
  allow: Record<string, boolean>;
  warnings: string[];
}

const obj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, d: string): string => (typeof v === 'string' ? v : d);
const bool = (v: unknown, d: boolean): boolean => (typeof v === 'boolean' ? v : d);
const num = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);

function decodeIcon(v: unknown): Icon | null {
  if (!obj(v)) return null;
  if (v.kind === 'svg' && typeof v.id === 'string') return { kind: 'svg', id: v.id };
  if (v.kind === 'img' && typeof v.src === 'string') return { kind: 'img', src: v.src };
  if (v.kind === 'letter') return { kind: 'letter' };
  return null;
}

function decodeEnv(v: unknown, extNames: string[]): Env {
  if (!obj(v)) return mkEnv(null, extNames);
  const ext: Record<string, boolean> = {};
  if (obj(v.ext)) for (const [k, b] of Object.entries(v.ext)) if (typeof b === 'boolean') ext[k] = b;
  return mkEnv({
    network: (['direct', 'vpn', 'proxy', 'tor'] as const).find((n) => n === v.network) ?? 'direct',
    region: str(v.region, 'Seattle, US'),
    proxy: str(v.proxy, ''),
    locale: str(v.locale, 'en-US'),
    tz: str(v.tz, 'America/Los_Angeles'),
    fp: (['standard', 'randomized', 'strict'] as const).find((f) => f === v.fp) ?? 'standard',
    disposable: bool(v.disposable, false),
    ext
  }, extNames);
}

/** Triage timestamps are optional: a file written before them reads as "used now", not as weeks
 *  stale, so an upgrade never makes every tab a close suggestion. A future time (clock moved) clamps to now. */
function decodeTab(v: unknown, now = Date.now()): Tab | null {
  if (!obj(v)) return null;
  const url = str(v.url, '');
  const t = newTab(url, str(v.title, ''), {
    pinned: bool(v.pinned, false),
    group: typeof v.group === 'string' ? v.group : null,
    icon: decodeIcon(v.icon),
    favicon: typeof v.favicon === 'string' ? v.favicon : null,
    lastActive: Math.min(now, num(v.lastActive, now)),
    activeMs: Math.max(0, num(v.activeMs, 0))
  });
  if (typeof v.id === 'string' && v.id) t.id = v.id;
  return t;
}

function decodeWorkspace(v: unknown, extNames: string[], warn: (m: string) => void): Workspace | null {
  if (!obj(v)) return null;
  const name = str(v.name, '');
  if (!name) return null;
  const tabs: Tab[] = [];
  (Array.isArray(v.tabs) ? v.tabs : []).forEach((t, i) => {
    const d = decodeTab(t);
    if (d) tabs.push(d); else warn(`tab ${i} of ${name} unreadable, dropped`);
  });
  const groups = (Array.isArray(v.groups) ? v.groups : [])
    .filter(obj)
    .filter((g) => typeof g.id === 'string' && typeof g.name === 'string')
    .map((g) => ({ id: g.id as string, name: g.name as string, color: str(g.color, '#5fd3e0'), collapsed: bool(g.collapsed, false) }));
  const ids = new Set(groups.map((g) => g.id));
  tabs.forEach((t) => { if (t.group && !ids.has(t.group)) t.group = null; });
  const w = newWorkspace(name, str(v.color, '#6aa9ff'), decodeEnv(v.env, extNames), {
    icon: decodeIcon(v.icon),
    tabs,
    groups,
    active: Math.max(0, Math.min(tabs.length - 1, Math.floor(num(v.active, 0))))
  });
  if (typeof v.id === 'string' && v.id) w.id = v.id;
  return w;
}

export function decodeSnapshot(json: unknown, extNames: string[]): Decoded {
  const warnings: string[] = [];
  const warn = (m: string): void => { warnings.push(m); };
  if (!obj(json)) return { workspaces: [], activeWs: 0, closed: [], allow: {}, warnings: ['state.json is not an object'] };
  const v = num(json.v, 0);
  if (v > SNAPSHOT_VERSION) warn(`state.json is version ${v}, newer than this build (${SNAPSHOT_VERSION}); reading what is understood`);
  const workspaces: Workspace[] = [];
  (Array.isArray(json.workspaces) ? json.workspaces : []).forEach((w, i) => {
    const d = decodeWorkspace(w, extNames, warn);
    if (d) workspaces.push(d); else warn(`workspace ${i} unreadable, dropped`);
  });
  const known = new Set(workspaces.map((w) => w.id));
  const closed: ClosedTab[] = (Array.isArray(json.closed) ? json.closed : [])
    .filter(obj)
    .map((c) => ({ wsId: str(c.wsId, ''), tab: decodeTab(c.tab) }))
    .filter((c): c is ClosedTab => !!c.tab && known.has(c.wsId));
  const allow: Record<string, boolean> = {};
  if (obj(json.allow)) for (const [k, b] of Object.entries(json.allow)) if (b === true) allow[k] = true;
  return { workspaces, activeWs: Math.max(0, Math.min(workspaces.length - 1, Math.floor(num(json.activeWs, 0)))), closed, allow, warnings };
}

/** Disposable workspaces and private tabs are never written; a private active tab falls back to its neighbour. */
export function encodeSnapshot(workspaces: Workspace[], activeWs: number, closed: ClosedTab[], allow: Record<string, boolean>): Snapshot {
  const kept = workspaces.filter((w) => !w.env.disposable);
  const ids = new Set(kept.map((w) => w.id));
  const cur = workspaces[activeWs];
  const strip = (t: Tab): Tab => ({ ...t, blocked: 0, loading: false, canBack: false, canFwd: false, history: [], histPos: 0, zoom: 1, audible: false, edited: false });
  const publicTabs = (w: Workspace): Workspace => {
    const tabs = w.tabs.filter((t) => !t.private);
    const before = w.tabs.slice(0, w.active).filter((t) => t.private).length;
    return { ...w, tabs: tabs.map(strip), active: Math.max(0, Math.min(tabs.length - 1, w.active - before)) };
  };
  return {
    v: SNAPSHOT_VERSION,
    workspaces: kept.map(publicTabs),
    activeWs: cur && ids.has(cur.id) ? kept.findIndex((w) => w.id === cur.id) : 0,
    closed: closed.filter((c) => ids.has(c.wsId) && !c.tab.private).map((c) => ({ wsId: c.wsId, tab: strip(c.tab) })),
    allow
  };
}
