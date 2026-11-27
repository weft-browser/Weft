import type { JSX } from 'react';
import { useEffect, useRef } from 'react';
import { PRIVATE_COLOR, readable, stripOrder, type Workspace } from '../../shared/model';
import { send } from '../api';
import { G, Glyph, IconView } from '../icons';
import type { MenuTarget } from './ContextMenu';

interface Props {
  ws: Workspace;
  groupRenaming: string | null;
  groupDraft: string;
  shiftHeld: boolean;
  tabsOpen: boolean;
  tabsBtnRef: React.RefObject<HTMLButtonElement | null>;
  onGroupDraft: (v: string) => void;
  onGroupRenameEnd: (save: boolean) => void;
  onStartGroupRename: (gid: string, name: string) => void;
  onMenu: (e: React.MouseEvent, t: MenuTarget) => void;
  onToggleTabs: () => void;
}

export function TabStrip(p: Props): JSX.Element {
  const { ws } = p;
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (p.groupRenaming) { input.current?.focus(); input.current?.select(); } }, [p.groupRenaming]);
  const gmap = Object.fromEntries(ws.groups.map((g) => [g.id, g]));
  return (
    <div className="strip drag">
      <div className="strip-ws"><span aria-hidden="true" className="dot" style={{ background: ws.color }} /><span>{ws.name}</span></div>
      <div role="tablist" aria-label="Tabs in this workspace" className="strip-tabs nodrag">
        {stripOrder(ws).map((it) => {
          if (it.type === 'chip') {
            const g = it.g;
            if (p.groupRenaming === g.id) {
              return <input key={'e' + g.id} ref={input} className="chip-edit" type="text" aria-label="Group name" value={p.groupDraft} onChange={(e) => p.onGroupDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); p.onGroupRenameEnd(true); } else if (e.key === 'Escape') { e.preventDefault(); p.onGroupRenameEnd(false); } }}
                onBlur={() => p.onGroupRenameEnd(true)} />;
            }
            const count = ws.tabs.filter((x) => x.group === g.id && !x.pinned).length;
            return (
              <button key={g.id} type="button" className="chip" aria-expanded={!g.collapsed} aria-label={'Tab group ' + g.name + ', ' + count + ' tabs'}
                title="Click to collapse or expand · double-click to rename · right-click for options"
                style={{ background: g.color + '2e', color: readable(g.color) }}
                onClick={() => send({ type: 'updateGroup', gid: g.id, patch: { collapsed: !g.collapsed } })}
                onDoubleClick={() => p.onStartGroupRename(g.id, g.name)} onContextMenu={(e) => p.onMenu(e, { kind: 'group', gid: g.id })}>
                <span aria-hidden="true" className="dot" style={{ background: g.color }} /><span>{g.name}</span>{g.collapsed && <span style={{ fontWeight: 500 }}>· {count}</span>}
              </button>
            );
          }
          const t = ws.tabs[it.j]!;
          const on = it.j === ws.active;
          const glyph = (t.title.charAt(0) || '?').toUpperCase();
          const icon = t.private ? <Glyph d={G.eyeOff} size={12} stroke={2.2} /> : t.icon ? <IconView icon={t.icon} letter={glyph} size={12} imgSize={16} /> : t.favicon ? <img src={t.favicon} alt="" /> : glyph;
          const label = t.title + (t.private ? ', private' : '') + (it.type === 'pin' ? ', pinned' : '');
          if (it.type === 'pin') {
            return (
              <div key={t.id} className={'tab pin' + (on ? ' on' : '') + (t.private ? ' private' : '')}>
                <span aria-hidden="true" className="tab-bar" style={{ background: on ? ws.color : 'transparent' }} />
                <button type="button" role="tab" aria-selected={on} aria-label={label} title={t.title} className="tab-btn"
                  onClick={() => send({ type: 'selectTab', j: it.j })} onContextMenu={(e) => p.onMenu(e, { kind: 'tab', j: it.j })}>
                  <span aria-hidden="true" className="tab-ico" style={t.private ? { color: PRIVATE_COLOR } : undefined}>{icon}</span>
                </button>
              </div>
            );
          }
          return (
            <div key={t.id} className={'tab' + (on ? ' on' : '') + (t.private ? ' private' : '')}>
              <span aria-hidden="true" className="tab-bar" style={{ background: on ? ws.color : 'transparent' }} />
              <span aria-hidden="true" className="tab-gline" style={{ background: t.group && gmap[t.group] ? gmap[t.group]!.color : 'transparent' }} />
              <button type="button" role="tab" aria-selected={on} aria-label={label} title="Right-click for tab options" className="tab-btn"
                onClick={() => send({ type: 'selectTab', j: it.j })} onContextMenu={(e) => p.onMenu(e, { kind: 'tab', j: it.j })}>
                <span aria-hidden="true" className="tab-ico" style={t.private ? { color: PRIVATE_COLOR } : undefined}>{icon}</span>
                <span className="ellip">{t.title}</span>
              </button>
              <button type="button" className="tab-x" aria-label={'Close ' + t.title} onClick={() => send({ type: 'closeTab', j: it.j })}><Glyph d={G.close} size={12} stroke={2.4} /></button>
            </div>
          );
        })}
      </div>
      <button type="button" className="icon-btn nodrag" aria-label={p.shiftHeld ? 'New private tab' : 'New tab'} title="New tab (` t) · Shift-click or right-click for a private tab"
        style={p.shiftHeld ? { color: PRIVATE_COLOR } : undefined}
        onClick={(e) => send({ type: 'newTab', private: e.shiftKey })} onContextMenu={(e) => p.onMenu(e, { kind: 'newtab' })}>
        {p.shiftHeld ? <Glyph d={G.eyeOff} size={17} /> : <Glyph d={G.plus} />}
      </button>
      <button ref={p.tabsBtnRef} type="button" className={'strip-all nodrag' + (p.tabsOpen ? ' on' : '')} onClick={p.onToggleTabs} aria-expanded={p.tabsOpen} aria-label={'Show all ' + ws.tabs.length + ' tabs'} title="All tabs (` a)">
        <span>{ws.tabs.length} {ws.tabs.length === 1 ? 'tab' : 'tabs'}</span><Glyph d={G.chevron} size={12} stroke={2.4} />
      </button>
    </div>
  );
}
