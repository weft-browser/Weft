// What the command palette offers, ranked against what was typed. Pure apart from `run`.
import type { Command } from '../shared/ipc';
import { KEY_GROUPS } from '../shared/keys';
import { UI_SCALES, looksLikeUrl, netLabel, toNavigation, type BrowserState } from '../shared/model';

export interface PaletteItem { kind: string; label: string; sub: string; color: string; key: string; run: () => void; }

export interface PaletteCtx {
  state: BrowserState;
  pinned: boolean;
  send: (c: Command) => void;
  ui: {
    env: (tab: 'settings' | 'config') => void;
    privacy: () => void;
    rename: () => void;
    pinRail: () => void;
    menu: () => void;
    uiScale: (v: number) => void;
    tabs: () => void;
    tidy: () => void;
  };
}

const KEY_OF: Record<string, string> = {};
KEY_GROUPS.forEach((g) => g.keys.forEach((k) => { if (k.cmdLabel) KEY_OF[k.cmdLabel] = '` ' + k.keys; }));

export function score(q: string, text: string): number {
  if (!q) return 1;
  const t = text.toLowerCase();
  const i = t.indexOf(q);
  if (i === 0) return 100;
  if (i > 0) return t.charAt(i - 1) === ' ' ? 80 : 50;
  let p = 0;
  for (let n = 0; n < t.length && p < q.length; n++) if (t.charAt(n) === q.charAt(p)) p++;
  return p === q.length ? 10 : 0;
}

export function paletteItems(raw: string, ctx: PaletteCtx): PaletteItem[] {
  const { state, send, ui } = ctx;
  const q = raw.trim().toLowerCase();
  const cur = state.workspaces[state.activeWs]!;
  const curTab = cur.tabs[cur.active];
  const cmd = (label: string, run: () => void, key = KEY_OF[label] ?? ''): PaletteItem => ({ kind: 'Command', label, sub: '', color: '#e5c07b', key, run });
  const up = state.update;
  const cmds: PaletteItem[] = [
    ...(up.phase === 'ready' ? [cmd('Restart to update to Weft ' + up.version, () => send({ type: 'installUpdate' }))] : []),
    cmd('New tab', () => send({ type: 'newTab' })),
    cmd('New private tab', () => send({ type: 'newTab', private: true })),
    cmd('Show all tabs', () => ui.tabs()),
    cmd('Tidy tabs', () => ui.tidy()),
    cmd('Sort tabs by importance', () => send({ type: 'sortTabs' })),
    cmd('Save page as text', () => send({ type: 'savePage' })),
    cmd('New workspace', () => send({ type: 'addWs' })),
    cmd('New disposable workspace', () => send({ type: 'addDisposable' })),
    cmd('Workspace environment', () => ui.env('settings')),
    cmd('Edit environment file', () => ui.env('config')),
    cmd('Reopen closed tab', () => send({ type: 'reopen' })),
    cmd('Close tab', () => send({ type: 'closeTab' })),
    cmd('Rename workspace', () => ui.rename()),
    cmd('Close workspace', () => send({ type: 'closeWs' })),
    cmd('Privacy panel', () => ui.privacy()),
    cmd('Follow a link', () => send({ type: 'hints' })),
    cmd('Reload', () => send({ type: 'reload' })),
    cmd('Back', () => send({ type: 'back' }), '` ['),
    cmd('Forward', () => send({ type: 'forward' }), '` ]'),
    cmd(ctx.pinned ? 'Unpin sidebar' : 'Pin sidebar open', () => ui.pinRail(), '` b'),
    cmd(curTab?.pinned ? 'Unpin tab' : 'Pin tab', () => send({ type: 'togglePin' }), '` P'),
    cmd('New group with this tab', () => send({ type: 'newGroup' })),
    cmd('Collapse or expand group', () => send({ type: 'toggleActiveGroup' })),
    cmd('Tab menu', () => ui.menu()),
    cmd('Zoom page in', () => send({ type: 'zoom', d: 1 }), '` +'),
    cmd('Zoom page out', () => send({ type: 'zoom', d: -1 }), '` -'),
    cmd('Reset page zoom', () => send({ type: 'zoom', d: 0 }), '` 0'),
    cmd(up.phase === 'downloading' ? 'Downloading Weft ' + up.version + ' (' + up.percent + '%)' : 'Check for updates', () => send({ type: 'checkUpdates' })),
    ...UI_SCALES.map((v) => cmd('Interface size: ' + (v === 1 ? 'Default' : v < 1 ? 'Small' : 'Large') + ' (' + Math.round(v * 100) + '%)', () => ui.uiScale(v), ''))
  ];
  const wsItems: PaletteItem[] = state.workspaces.map((w, i) => ({
    kind: 'Workspace', label: w.name, sub: netLabel(w.env, state.vpnConfigured, state.vpnStatus) + ' · ' + w.tabs.length + ' tabs', color: w.color,
    key: i < 9 ? '` ' + (i + 1) : '', run: () => send({ type: 'selectWs', i })
  }));
  const tabItems: PaletteItem[] = [];
  state.workspaces.forEach((w, i) => w.tabs.forEach((t, j) => {
    const g = t.group ? w.groups.find((x) => x.id === t.group) : undefined;
    tabItems.push({
      kind: 'Tab', label: t.title, sub: (t.private ? 'Private · ' : '') + (t.pinned ? 'Pinned · ' : '') + (g ? g.name + ' · ' : '') + w.name + (t.url ? ' · ' + t.url : ''),
      color: w.color, key: '', run: () => send({ type: 'selectTab', ws: i, j })
    });
  }));
  if (!q) return cmds.slice(0, 5).concat(wsItems).slice(0, 12);
  const open: PaletteItem = looksLikeUrl(raw)
    ? { kind: 'Open', label: 'Open ' + raw.trim(), sub: 'New tab in ' + cur.name, color: cur.color, key: '', run: () => send({ type: 'newTab', url: toNavigation(raw)!.url }) }
    : { kind: 'Search', label: 'Search “' + raw.trim() + '”', sub: 'New tab in ' + cur.name + ' · DuckDuckGo', color: cur.color, key: '', run: () => send({ type: 'newTab', url: raw.trim() }) };
  const ranked = tabItems.concat(wsItems, cmds)
    .map((it, n) => ({ it, n, sc: Math.max(score(q, it.label), score(q, it.sub) - 5) }))
    .filter((r) => r.sc > 0)
    .sort((a, b) => b.sc - a.sc || a.n - b.n)
    .map((r) => r.it);
  return ranked.slice(0, 11).concat([open]);
}
