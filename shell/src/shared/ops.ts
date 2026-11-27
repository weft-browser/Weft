// Mutations of the browser model that owe nothing to the engine: how tabs are placed, removed,
// remembered and reopened, how groups form. The controller calls these and then does
// the engine work (pages, profiles).
import { GROUP_COLORS, newTab, navOrder, type ClosedTab, type Group, type Tab, type Workspace } from './model';

export const CLOSED_LIMIT = 20;

/** Insert a tab. `beside` puts it right after the active one and keeps the active one current unless `activate`. */
export function insertTab(ws: Workspace, tab: Tab, o: { beside: boolean; activate: boolean }): number {
  const at = o.beside && ws.tabs.length ? ws.active + 1 : ws.tabs.length;
  ws.tabs.splice(at, 0, tab);
  if (o.activate) ws.active = at;
  else if (at <= ws.active && ws.tabs.length > 1) ws.active += 1;
  return at;
}

/** A link opened from a page or a menu lands beside its opener and inherits its group, unless it is private. */
export function linkTab(ws: Workspace, url: string, priv: boolean, hasOpener: boolean): Tab {
  const opener = hasOpener ? ws.tabs[ws.active] : undefined;
  return newTab(url, '', { private: priv, group: opener && !priv ? opener.group : null });
}

/** Remove tab `j`; the active index follows the tab that was active, or clamps. Returns the tab, or null. */
export function removeTab(ws: Workspace, j: number): Tab | null {
  const t = ws.tabs[j];
  if (!t) return null;
  ws.tabs.splice(j, 1);
  let a = ws.active;
  if (j < a) a -= 1;
  if (a >= ws.tabs.length) a = ws.tabs.length - 1;
  ws.active = Math.max(a, 0);
  return t;
}

/** Remove a group and its tabs; the active tab stays active when it survives. Returns the removed tabs. */
export function removeGroup(ws: Workspace, gid: string): Tab[] {
  const active = ws.tabs[ws.active];
  const gone = ws.tabs.filter((t) => t.group === gid);
  ws.tabs = ws.tabs.filter((t) => t.group !== gid);
  const a = active ? ws.tabs.indexOf(active) : -1;
  ws.active = Math.max(a, 0);
  ws.groups = ws.groups.filter((g) => g.id !== gid);
  return gone;
}

/** What "reopen" can bring back: never a private tab, never from a disposable workspace, never a blank. */
export function remember(closed: ClosedTab[], ws: Workspace, tabs: Tab[]): ClosedTab[] {
  if (ws.env.disposable) return closed;
  const keep = tabs.filter((t) => t.url && !t.private).map((t) => ({ wsId: ws.id, tab: { ...t, group: null } }));
  return keep.length ? closed.concat(keep).slice(-CLOSED_LIMIT) : closed;
}

/** The most recently closed tab, rebuilt fresh, with the workspace it goes back to (or the current one when that is gone). */
export function reopenLast(closed: ClosedTab[], workspaces: Workspace[], activeWs: number): { closed: ClosedTab[]; wi: number; tab: Tab } | null {
  const last = closed[closed.length - 1];
  if (!last) return null;
  let wi = workspaces.findIndex((w) => w.id === last.wsId);
  if (wi < 0) wi = activeWs;
  const tab = newTab(last.tab.url, last.tab.title, { pinned: last.tab.pinned, icon: last.tab.icon, favicon: last.tab.favicon });
  return { closed: closed.slice(0, -1), wi, tab };
}

/** Next / previous in strip order (pins first, groups folded), wrapping. */
export function cycledTab(ws: Workspace, d: 1 | -1): number {
  const nav = navOrder(ws);
  if (!nav.length) return ws.active;
  let p = nav.indexOf(ws.active);
  if (p < 0) p = 0;
  return nav[(p + d + nav.length) % nav.length]!;
}

/** Pinning takes a tab out of its group; unpinning leaves it where pins live. */
export function togglePin(ws: Workspace, j: number): Tab | null {
  const t = ws.tabs[j];
  if (!t) return null;
  t.pinned = !t.pinned;
  t.group = null;
  return t;
}

/** A new group around tab `j` (which stops being pinned). */
export function groupWith(ws: Workspace, j: number, id: string): Group | null {
  const t = ws.tabs[j];
  if (!t) return null;
  const g: Group = { id, name: 'Group ' + (ws.groups.length + 1), color: GROUP_COLORS[ws.groups.length % GROUP_COLORS.length]!, collapsed: false };
  ws.groups.push(g);
  t.group = g.id;
  t.pinned = false;
  return g;
}

/** Remove workspace `i` from the list; returns the new active index. The last workspace never closes. */
export function removeWorkspace(workspaces: Workspace[], i: number, activeWs: number): number | null {
  if (!workspaces[i] || workspaces.length <= 1) return null;
  workspaces.splice(i, 1);
  let a = activeWs;
  if (i < a) a -= 1;
  if (a >= workspaces.length) a = workspaces.length - 1;
  return a;
}
