import type { JSX } from 'react';
import { useEffect, useRef } from 'react';
import { netLabel, readable, type BrowserState } from '../../shared/model';
import { send } from '../api';
import { G, Glyph, IconView } from '../icons';
import type { MenuTarget } from './ContextMenu';

interface Props {
  state: BrowserState;
  open: boolean;
  pinned: boolean;
  paletteOpen: boolean;
  renaming: number | null;
  renameDraft: string;
  onHover: (on: boolean) => void;
  onRenameDraft: (v: string) => void;
  onRenameEnd: (save: boolean) => void;
  onStartRename: (i: number) => void;
  onTogglePalette: () => void;
  onTogglePin: () => void;
  onMenu: (e: React.MouseEvent, t: MenuTarget) => void;
}

export function Rail(p: Props): JSX.Element {
  const { state } = p;
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (p.renaming !== null) { input.current?.focus(); input.current?.select(); } }, [p.renaming]);
  return (
    <nav aria-label="Workspaces" className={'rail' + (p.open ? ' open' : '')} style={{ width: p.open ? 248 : 72, boxShadow: p.open && !p.pinned ? '8px 0 32px rgba(0,0,0,0.45)' : 'none' }}
      onMouseEnter={() => p.onHover(true)} onMouseLeave={() => p.onHover(false)}>
      <div className="rail-head drag" />
      <div className="rail-sec">
        <button type="button" className="rail-btn nodrag" onClick={p.onTogglePalette} aria-expanded={p.paletteOpen} title="Command palette (` :)" style={{ background: p.paletteOpen ? 'var(--selected)' : undefined, color: 'var(--text)' }}>
          <span aria-hidden="true" className="badge mono" style={{ background: 'var(--raised)', color: 'var(--key)', fontSize: 11 }}>&gt;_</span>
          <span className="fade" style={{ flex: 1, color: 'var(--text2)' }}>Command palette</span>
          <span className="fade kbd">` :</span>
        </button>
      </div>
      <div className="rail-list">
        {state.workspaces.map((w, i) => {
          const on = i === state.activeWs;
          const disp = w.env.disposable;
          const initial = (w.name.charAt(0) || '?').toUpperCase();
          if (p.renaming === i) {
            return (
              <div key={w.id} className="rename-row">
                <span aria-hidden="true" className="badge" style={{ background: w.color + '2b', color: readable(w.color) }}>{initial}</span>
                <label htmlFor="wsrename" className="sr">Workspace name</label>
                <input id="wsrename" ref={input} type="text" value={p.renameDraft} onChange={(e) => p.onRenameDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); p.onRenameEnd(true); } else if (e.key === 'Escape') { e.preventDefault(); p.onRenameEnd(false); } }}
                  onBlur={() => p.onRenameEnd(true)} />
              </div>
            );
          }
          return (
            <button key={w.id} type="button" className="rail-btn ws" aria-current={on ? 'true' : undefined} title="Double-click to rename · right-click for options"
              onClick={() => send({ type: 'selectWs', i })} onDoubleClick={() => p.onStartRename(i)} onContextMenu={(e) => p.onMenu(e, { kind: 'ws', i })} style={{ background: on ? 'var(--selected)' : undefined }}>
              <span aria-hidden="true" className="badge" style={{ background: w.color + '2b', color: readable(w.color), border: disp ? '1px dashed ' + w.color : undefined, boxShadow: on ? '0 0 0 2px ' + w.color : undefined }}>
                <IconView icon={w.icon} letter={initial} />
              </span>
              <span className="fade" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span className="ws-name ellip">{w.name}</span>
                <span className="ws-meta ellip" style={{ color: disp ? 'var(--key)' : undefined }}>{netLabel(w.env, state.vpnConfigured, state.vpnStatus)}{disp ? ' · disposable' : ''}</span>
              </span>
              <span className="fade ws-count">{w.tabs.length}</span>
              <span className={'fade ws-key' + (state.leader ? ' on' : '')}>{i < 9 ? i + 1 : ''}</span>
            </button>
          );
        })}
      </div>
      <div className="rail-foot">
        <button type="button" className="rail-btn" onClick={() => send({ type: 'addWs' })}>
          <span aria-hidden="true" className="badge" style={{ border: '1px dashed var(--disabled)' }}><Glyph d={G.plus} size={14} /></span>
          <span className="fade" style={{ flex: 1 }}>New workspace</span><span className="fade kbd">` n</span>
        </button>
        <button type="button" className="rail-btn" onClick={() => send({ type: 'addDisposable' })}>
          <span aria-hidden="true" className="badge" style={{ border: '1px dashed var(--key)', color: 'var(--key)' }}><Glyph d={G.trash} size={14} /></span>
          <span className="fade" style={{ flex: 1 }}>Disposable workspace</span><span className="fade kbd">` d</span>
        </button>
        <button type="button" className="rail-btn" onClick={p.onTogglePin} aria-pressed={p.pinned} style={{ color: p.pinned ? 'var(--text)' : undefined }}>
          <span aria-hidden="true" className="badge" style={{ border: 0 }}><Glyph d={G.pin} /></span>
          <span className="fade" style={{ flex: 1 }}>{p.pinned ? 'Unpin sidebar' : 'Pin sidebar open'}</span><span className="fade kbd">` b</span>
        </button>
      </div>
    </nav>
  );
}
