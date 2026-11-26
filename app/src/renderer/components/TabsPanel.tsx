// The "all tabs" list (` a): every tab of the current workspace, or of all of them, filtered as you type.
import type { JSX } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { PRIVATE_COLOR, hostOf, type BrowserState, type Tab, type Workspace } from '../../shared/model';
import { send } from '../api';
import { G, Glyph, IconView } from '../icons';
import { moveSel } from '../../shared/listnav';

type Scope = 'ws' | 'all';
type Row = { kind: 'head'; label: string; color: string; count: number } | { kind: 'row'; wi: number; j: number; tab: Tab; tag: string; n: number };

/** Pinned first, then each group, then the rest; grouped by workspace when the scope is `all`. */
export function tabRows(state: BrowserState, scope: Scope, query: string): Row[] {
  const q = query.trim().toLowerCase();
  const rows: Row[] = [];
  let n = 0;
  const add = (label: string, color: string, items: Array<Omit<Extract<Row, { kind: 'row' }>, 'n' | 'kind'>>): void => {
    if (!items.length) return;
    rows.push({ kind: 'head', label, color, count: items.length });
    items.forEach((it) => { rows.push({ kind: 'row', ...it, n }); n += 1; });
  };
  const list = scope === 'all' ? state.workspaces.map((_, i) => i) : [state.activeWs];
  list.forEach((wi) => {
    const w: Workspace = state.workspaces[wi]!;
    const known = new Set(w.groups.map((g) => g.id));
    const mk = (j: number, tag: string): Omit<Extract<Row, { kind: 'row' }>, 'n' | 'kind'> | null => {
      const tab = w.tabs[j]!;
      const hit = !q || tab.title.toLowerCase().includes(q) || tab.url.toLowerCase().includes(q);
      return hit ? { wi, j, tab, tag } : null;
    };
    const pinned = w.tabs.flatMap((t, j) => (t.pinned ? [mk(j, scope === 'all' ? 'Pinned' : '')] : [])).filter((x) => x !== null);
    const byGroup = w.groups.map((g) => ({ g, items: w.tabs.flatMap((t, j) => (!t.pinned && t.group === g.id ? [mk(j, scope === 'all' ? g.name : '')] : [])).filter((x) => x !== null) }));
    const rest = w.tabs.flatMap((t, j) => (!t.pinned && !(t.group && known.has(t.group)) ? [mk(j, '')] : [])).filter((x) => x !== null);
    if (scope === 'all') add(w.name, w.color, pinned.concat(...byGroup.map((x) => x.items), rest));
    else {
      add('Pinned', '#9aa1ab', pinned);
      byGroup.forEach((x) => add(x.g.name + (x.g.collapsed ? ' · collapsed' : ''), x.g.color, x.items));
      add(pinned.length || byGroup.some((x) => x.items.length) ? 'Other tabs' : 'Tabs', w.color, rest);
    }
  });
  return rows;
}

export function TabsPanel({ state, panelRef, onClose }: { state: BrowserState; panelRef: React.RefObject<HTMLDivElement | null>; onClose: (refocus: boolean) => void }): JSX.Element {
  const [scope, setScope] = useState<Scope>('ws');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const cur = state.workspaces[state.activeWs]!;
  const rows = useMemo(() => tabRows(state, scope, q), [state, scope, q]);
  const picks = rows.filter((r): r is Extract<Row, { kind: 'row' }> => r.kind === 'row');
  const allCount = state.workspaces.reduce((n, w) => n + w.tabs.length, 0);
  useEffect(() => {
    input.current?.focus();
    const i = picks.findIndex((r) => r.wi === state.activeWs && r.j === cur.active);
    setSel(Math.max(i, 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const go = (r: Extract<Row, { kind: 'row' }>): void => { send({ type: 'selectTab', ws: r.wi, j: r.j }); onClose(true); };
  useEffect(() => { panelRef.current?.querySelector<HTMLElement>('[aria-selected=true]')?.scrollIntoView({ block: 'nearest' }); }, [sel, panelRef]);
  const onKey = (e: React.KeyboardEvent): void => {
    const next = moveSel(e.key, e.ctrlKey, Math.min(sel, Math.max(picks.length - 1, 0)), picks.length);
    if (next !== null) { e.preventDefault(); setSel(next); return; }
    if (e.key === 'Enter') { e.preventDefault(); const r = picks[Math.min(sel, picks.length - 1)]; if (r) go(r); }
    else if ((e.key === 'Backspace' || e.key === 'Delete') && e.metaKey) { e.preventDefault(); const r = picks[Math.min(sel, picks.length - 1)]; if (r) send({ type: 'closeTab', ws: r.wi, j: r.j }); }
    else if (e.key === 'Escape') { e.preventDefault(); onClose(true); }
  };
  const pick = (s: Scope): void => { setScope(s); setSel(0); input.current?.focus(); };
  return (
    <div ref={panelRef} role="dialog" aria-label="Open tabs" className="tabs-panel" style={{ top: 50 }}>
      <div className="tabs-head">
        <label htmlFor="tabsq" className="sr">Filter tabs</label>
        <input id="tabsq" ref={input} type="text" autoComplete="off" spellCheck={false} placeholder="Filter tabs by title or address" value={q} onChange={(e) => { setQ(e.target.value); setSel(0); }} onKeyDown={onKey} />
        <div role="group" aria-label="Which tabs to show" className="tabs-scope">
          <button type="button" className={'seg' + (scope === 'ws' ? ' on' : '')} aria-pressed={scope === 'ws'} onClick={() => pick('ws')}>{cur.name} · {cur.tabs.length}</button>
          <button type="button" className={'seg' + (scope === 'all' ? ' on' : '')} aria-pressed={scope === 'all'} onClick={() => pick('all')}>All workspaces · {allCount}</button>
        </div>
      </div>
      <div role="listbox" aria-label="Tabs" className="tabs-list">
        {rows.map((r, k) => {
          if (r.kind === 'head') return <div key={'h' + k} className="tabs-group"><span aria-hidden="true" className="dot" style={{ background: r.color }} /><span>{r.label}</span><span style={{ marginLeft: 'auto', fontWeight: 500 }}>{r.count}</span></div>;
          const t = r.tab;
          const w = state.workspaces[r.wi]!;
          const active = r.wi === state.activeWs && r.j === w.active;
          const glyph = (t.title.charAt(0) || '?').toUpperCase();
          const icon = t.private ? <Glyph d={G.eyeOff} size={12} stroke={2.2} /> : t.icon ? <IconView icon={t.icon} letter={glyph} size={12} imgSize={18} /> : t.favicon ? <img src={t.favicon} alt="" /> : glyph;
          const on = r.n === sel;
          return (
            <div key={t.id} className={'tabs-row' + (on ? ' on' : '')}>
              <button type="button" role="option" tabIndex={-1} aria-selected={on} onClick={() => go(r)} onMouseEnter={() => { if (sel !== r.n) setSel(r.n); }}>
                <span aria-hidden="true" className="tab-ico" style={{ width: 18, height: 18, color: t.private ? PRIVATE_COLOR : undefined }}>{icon}</span>
                <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <span className="ellip" style={{ fontSize: 13 }}>{t.title}</span>
                  <span className="ellip" style={{ fontSize: 11.5, color: 'var(--muted)' }}>{(r.tag ? r.tag + ' · ' : '') + (t.private ? 'private · ' : '') + (t.url ? hostOf(t.url) : 'New tab')}</span>
                </span>
                {active && <span style={{ fontSize: 11, color: 'var(--muted)' }}>current</span>}
              </button>
              <button type="button" className="tab-x" aria-label={'Close ' + t.title} onClick={() => send({ type: 'closeTab', ws: r.wi, j: r.j })}><Glyph d={G.close} size={11} stroke={2.4} /></button>
            </div>
          );
        })}
        {!picks.length && <p style={{ margin: 0, padding: '16px 10px', color: 'var(--muted)' }}>No tabs match</p>}
      </div>
    </div>
  );
}
