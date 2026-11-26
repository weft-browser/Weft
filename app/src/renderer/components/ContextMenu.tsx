import type { JSX } from 'react';
import { useEffect, useRef } from 'react';
import { DISPOSABLE_COLOR, GROUP_COLORS, NET_NAMES, PRIVATE_COLOR, hostOf, type BrowserState, type Workspace } from '../../shared/model';
import { send } from '../api';

export type MenuTarget =
  | { kind: 'tab'; j: number }
  | { kind: 'group'; gid: string }
  | { kind: 'ws'; i: number }
  | { kind: 'newtab' }
  | { kind: 'history' }
  | { kind: 'route' }
  | { kind: 'shield' };

export type MenuItem = { k: 'head'; label: string } | { k: 'sep' } | { k: 'item'; label: string; key?: string; color?: string; run: () => void } | { k: 'swatches'; gid: string; current: string };

export interface MenuCtx {
  state: BrowserState;
  openIcons: () => void;
  /** Opens the environment panel for the active workspace; pass `ws` to switch first. */
  openEnv: (tab: 'settings' | 'config', ws?: number) => void;
  openPrivacy: () => void;
  startGroupRename: (gid: string, name: string) => void;
  startRename: (i: number) => void;
}

const CHECK = '✓';

export function menuItems(ws: Workspace, target: MenuTarget, c: MenuCtx): MenuItem[] {
  const out: MenuItem[] = [];
  const { state } = c;
  const wi = state.workspaces.indexOf(ws);
  const head = (label: string): void => { out.push({ k: 'head', label }); };
  const item = (label: string, run: () => void, key?: string, color?: string): void => { out.push({ k: 'item', label, run, key, color }); };
  const sep = (): void => { out.push({ k: 'sep' }); };
  const others = state.workspaces.map((w, i) => ({ w, i })).filter((x) => x.i !== wi);
  const t = ws.tabs[ws.active];

  if (target.kind === 'tab') {
    const j = target.j;
    const tb = ws.tabs[j];
    if (!tb) return out;
    head(tb.title);
    item(tb.pinned ? 'Unpin tab' : 'Pin tab', () => send({ type: 'togglePin', j }), '` P');
    sep();
    item('New group with this tab', () => send({ type: 'newGroup', j }), '` g');
    ws.groups.filter((g) => g.id !== tb.group && ws.tabs.some((x) => x.group === g.id)).forEach((g) => item('Add to ' + g.name, () => send({ type: 'setTabGroup', j, gid: g.id }), undefined, g.color));
    if (tb.group) item('Remove from group', () => send({ type: 'setTabGroup', j, gid: null }));
    sep();
    item('Change tab icon…', () => { send({ type: 'selectTab', j }); c.openIcons(); });
    item('Close tab', () => send({ type: 'closeTab', j }), '` x');
  } else if (target.kind === 'group') {
    const g = ws.groups.find((x) => x.id === target.gid);
    if (!g) return out;
    const n = ws.tabs.filter((x) => x.group === g.id).length;
    head(g.name);
    item(g.collapsed ? 'Expand group' : 'Collapse group', () => send({ type: 'updateGroup', gid: g.id, patch: { collapsed: !g.collapsed } }), '` G');
    item('Rename group', () => c.startGroupRename(g.id, g.name));
    out.push({ k: 'swatches', gid: g.id, current: g.color });
    sep();
    item('Ungroup', () => send({ type: 'ungroup', gid: g.id }));
    item('Close ' + n + ' tab' + (n === 1 ? '' : 's') + ' in group', () => send({ type: 'closeGroup', gid: g.id }));
  } else if (target.kind === 'newtab') {
    head('New tab');
    item('New tab', () => send({ type: 'newTab' }), '` t');
    item('New private tab', () => send({ type: 'newTab', private: true }), '` T', PRIVATE_COLOR);
    if (others.length) {
      sep();
      head('New tab in workspace');
      others.forEach((x) => item(x.w.name, () => send({ type: 'newTab', ws: x.i }), undefined, x.w.color));
    }
    sep();
    item('New disposable workspace', () => send({ type: 'addDisposable' }), '` d', DISPOSABLE_COLOR);
  } else if (target.kind === 'ws') {
    const i = target.i;
    const w = state.workspaces[i];
    if (!w) return out;
    head(w.name);
    if (i !== state.activeWs) item('Switch to ' + w.name, () => send({ type: 'selectWs', i }), i < 9 ? '` ' + (i + 1) : undefined);
    item('New tab here', () => send({ type: 'newTab', ws: i }));
    item('Rename', () => c.startRename(i), '` e');
    item('Environment and appearance…', () => c.openEnv('settings', i), '` v');
    item('Edit environment file…', () => c.openEnv('config', i));
    sep();
    head('Network route');
    (['direct', 'vpn', 'proxy', 'tor'] as const).forEach((n) => {
      const label = n === 'vpn' ? 'VPN · ' + w.env.region.split(',')[0] : NET_NAMES[n];
      item(label, () => send({ type: 'updateEnv', ws: i, patch: { network: n } }), w.env.network === n ? CHECK : undefined);
    });
    sep();
    item(w.env.disposable ? 'Keep (stop being disposable)' : 'Make disposable', () => send({ type: 'updateEnv', ws: i, patch: { disposable: !w.env.disposable } }), undefined, DISPOSABLE_COLOR);
    item(w.env.disposable ? 'Wipe and close' : 'Close workspace', () => send({ type: 'closeWs', i }), '` X');
  } else if (target.kind === 'history') {
    head('History of this tab');
    if (!t || !t.history.length) item('Nothing yet', () => {});
    else t.history.map((en, p) => ({ en, p })).reverse().slice(0, 12).forEach((x) => item(x.en.title, () => send({ type: 'jumpTo', p: x.p }), x.p === t.histPos ? 'current' : undefined));
  } else if (target.kind === 'route') {
    const env = ws.env;
    head(ws.name + ' network route');
    item('Direct', () => send({ type: 'updateEnv', patch: { network: 'direct' } }), env.network === 'direct' ? CHECK : undefined);
    state.vpnRegions.forEach((r) => item('VPN · ' + r, () => send({ type: 'updateEnv', patch: { network: 'vpn', region: r } }), env.network === 'vpn' && env.region === r ? CHECK : undefined));
    item('Proxy' + (env.proxy ? ' · ' + env.proxy : ''), () => send({ type: 'updateEnv', patch: { network: 'proxy' } }), env.network === 'proxy' ? CHECK : undefined);
    item('Tor', () => send({ type: 'updateEnv', patch: { network: 'tor' } }), env.network === 'tor' ? CHECK : undefined);
    sep();
    item('Environment settings…', () => c.openEnv('settings'), '` v');
  } else if (target.kind === 'shield') {
    if (!t || !t.url) return out;
    const host = hostOf(t.url);
    const isProtected = !state.allow[ws.id + '|' + host];
    head(host);
    item(isProtected ? 'Allow trackers on this site' : 'Block trackers on this site', () => send({ type: 'toggleProtection' }));
    item('Clear site data in ' + ws.name, () => send({ type: 'clearSiteData' }));
    sep();
    item('Privacy panel…', () => c.openPrivacy(), '` p');
  }
  return out;
}

const LABELS: Record<MenuTarget['kind'], string> = { tab: 'Tab actions', group: 'Group actions', ws: 'Workspace actions', newtab: 'New tab', history: 'Tab history', route: 'Network route', shield: 'Tracker blocking' };

export function ContextMenu({ items, kind, x, y, onClose }: { items: MenuItem[]; kind: MenuTarget['kind']; x: number; y: number; onClose: () => void }): JSX.Element {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => { el.current?.querySelector<HTMLElement>('[role=menuitem]')?.focus(); }, []);
  const move = (d: 1 | -1): void => {
    const list = Array.from(el.current?.querySelectorAll<HTMLElement>('[role=menuitem]') ?? []);
    const i = list.indexOf(document.activeElement as HTMLElement);
    if (list.length) list[(i + d + list.length) % list.length]!.focus();
  };
  return (
    <div ref={el} role="menu" aria-label={LABELS[kind]} className="menu" style={{ left: x, top: y }}
      onKeyDown={(e) => { if (e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); move(1); } else if (e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); move(-1); } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); } }}>
      {items.map((it, n) => {
        if (it.k === 'head') return <span key={n} className="menu-head ellip">{it.label}</span>;
        if (it.k === 'sep') return <div key={n} role="separator" className="menu-sep" />;
        if (it.k === 'swatches') return (
          <div key={n} role="group" aria-label="Group color" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '6px 10px' }}>
            {GROUP_COLORS.map((h) => <button key={h} type="button" role="menuitem" className={'swatch' + (it.current === h ? ' on' : '')} style={{ width: 22, height: 22, background: h }} aria-label={'Group color ' + h} onClick={() => { send({ type: 'updateGroup', gid: it.gid, patch: { color: h } }); onClose(); }} />)}
          </div>
        );
        const checked = it.key === CHECK;
        return (
          <button key={n} type="button" role={checked || it.key === 'current' ? 'menuitemradio' : 'menuitem'} aria-checked={checked || it.key === 'current' ? true : undefined} className="menu-item" onClick={() => { onClose(); it.run(); }}>
            <span aria-hidden="true" className="dot" style={{ background: it.color ?? 'transparent' }} />
            <span className="ellip" style={{ flex: 1 }}>{it.label}</span>
            <span className="menu-key" style={checked ? { color: 'var(--text)' } : undefined}>{it.key ?? ''}</span>
          </button>
        );
      })}
    </div>
  );
}
