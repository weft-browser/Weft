import { forwardRef } from 'react';
import { hostOf, netLabel, readable, stripScheme, type BrowserState, type Tab, type Workspace } from '../../shared/model';
import { send } from '../api';
import { G, Glyph } from '../icons';
import type { MenuTarget } from './ContextMenu';

interface Props {
  state: BrowserState;
  ws: Workspace;
  tab: Tab | null;
  editing: boolean;
  draft: string;
  privacyOpen: boolean;
  envOpen: boolean;
  onDraft: (v: string) => void;
  onEditing: (on: boolean) => void;
  onTogglePrivacy: () => void;
  onToggleEnv: () => void;
  onMenu: (e: React.MouseEvent, t: MenuTarget) => void;
}

export const Toolbar = forwardRef<HTMLInputElement, Props>(function Toolbar(p, ref) {
  const { ws, tab } = p;
  const isPage = !!(tab && tab.url);
  const host = isPage ? hostOf(tab.url) : '';
  const isProtected = !p.state.allow[ws.id + '|' + host];
  const blocked = isPage && isProtected ? tab.blocked : 0;
  const env = ws.env;
  const chip = (env.disposable ? 'Disposable · ' : '') + netLabel(env, p.state.vpnConfigured, p.state.vpnStatus);
  const history = (e: React.MouseEvent): void => p.onMenu(e, { kind: 'history' });
  return (
    <div className="toolbar">
      <button type="button" className="icon-btn" onClick={() => send({ type: 'back' })} onContextMenu={history} disabled={!tab?.canBack} aria-label="Back" title="Back (` [) · right-click for history"><Glyph d={G.back} /></button>
      <button type="button" className="icon-btn" onClick={() => send({ type: 'forward' })} onContextMenu={history} disabled={!tab?.canFwd} aria-label="Forward" title="Forward (` ]) · right-click for history"><Glyph d={G.fwd} /></button>
      <button type="button" className="icon-btn" onClick={() => send({ type: 'reload' })} disabled={!isPage} aria-label="Reload" title="Reload (` r)"><Glyph d={G.reload} size={15} /></button>
      <div className={'addr' + (p.editing ? ' editing' : '')}>
        <button type="button" className={'shield' + (isPage && isProtected ? ' on' : '')} onClick={p.onTogglePrivacy} onContextMenu={(e) => { if (isPage) p.onMenu(e, { kind: 'shield' }); }} disabled={!isPage} aria-expanded={p.privacyOpen}
          aria-label={'Privacy panel: ' + blocked + ' trackers blocked'} title="Privacy (` p)">
          <Glyph d={G.shield} size={13} stroke={2.2} /><span>{isPage ? (isProtected ? String(blocked) : 'off') : '–'}</span>
        </button>
        <label htmlFor="addr" className="sr">Address or search</label>
        <input id="addr" ref={ref} type="text" autoComplete="off" spellCheck={false} placeholder={tab?.private ? 'Private tab: search or enter address' : 'Search privately or enter address'}
          value={p.editing ? p.draft : (isPage ? stripScheme(tab.url) : '')}
          onChange={(e) => p.onDraft(e.target.value)}
          onFocus={(e) => { const el = e.target; p.onDraft(isPage ? tab.url : ''); p.onEditing(true); setTimeout(() => el.select(), 0); }}
          onBlur={() => p.onEditing(false)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); send({ type: 'navigate', raw: p.draft }); (e.target as HTMLInputElement).blur(); }
            else if (e.key === 'Escape') { e.preventDefault(); (e.target as HTMLInputElement).blur(); send({ type: 'focusPage' }); }
          }} />
        {tab?.private && <span className="priv-chip" title="This tab has its own storage; it is wiped when the tab closes">private</span>}
        {isPage && tab.zoom !== 1 && (
          <div role="group" aria-label="Page zoom" className="zoomer">
            <button type="button" className="z" onClick={() => send({ type: 'zoom', d: -1 })} aria-label="Zoom page out" title="Zoom out (` -)"><Glyph d="M5 12h14" size={10} /></button>
            <button type="button" className="zv" onClick={() => send({ type: 'zoom', d: 0 })} aria-label={'Page zoom ' + Math.round(tab.zoom * 100) + '%, reset to 100%'} title="Reset to 100% (` 0)">{Math.round(tab.zoom * 100)}%</button>
            <button type="button" className="z" onClick={() => send({ type: 'zoom', d: 1 })} aria-label="Zoom page in" title="Zoom in (` +)"><Glyph d="M5 12h14M12 5v14" size={10} /></button>
          </div>
        )}
        <button type="button" className={'envchip' + (env.disposable ? ' disp' : '')} onClick={p.onToggleEnv} onContextMenu={(e) => p.onMenu(e, { kind: 'route' })} aria-expanded={p.envOpen} title="Workspace environment (` v) · right-click to change the route"
          style={env.disposable ? undefined : { background: ws.color + '22', color: readable(ws.color) }}>
          <Glyph d={G.globe} size={12} stroke={2.2} />{chip}
        </button>
      </div>
      {tab?.loading && <div aria-hidden="true" className="loadbar" style={{ background: ws.color }} />}
    </div>
  );
});
