import type { JSX } from 'react';
import { hostOf, type BrowserState, type Tab, type Workspace } from '../../shared/model';
import { send } from '../api';
import { G, Glyph } from '../icons';

export function PrivacyPanel({ state, ws, tab, onClose }: { state: BrowserState; ws: Workspace; tab: Tab; onClose: () => void }): JSX.Element {
  const host = hostOf(tab.url);
  const isProtected = !state.allow[ws.id + '|' + host];
  return (
    <div role="dialog" aria-label="Privacy for this site" className="panel privacy">
      <div className="row">
        <span className="mono ellip" style={{ fontSize: 12.5, color: 'var(--text3)' }}>{host}</span>
        <button type="button" className="icon-btn" style={{ width: 28, height: 28 }} onClick={onClose} aria-label="Close privacy panel"><Glyph d={G.close} size={12} stroke={2.4} /></button>
      </div>
      <div className="row">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontWeight: 600 }}>Tracker blocking</span>
          <span className="hint">{isProtected ? tab.blocked : 0} blocked on this page</span>
        </div>
        <button type="button" className={'switch lg' + (isProtected ? ' on' : '')} onClick={() => send({ type: 'toggleProtection' })} aria-pressed={isProtected} aria-label="Tracker blocking for this site"><span aria-hidden="true" /></button>
      </div>
      <div className="partition" style={{ background: ws.color + '22' }}>
        <span style={{ fontWeight: 600, color: ws.color }}>Storage partition: {ws.name}</span>
        <span className="hint" style={{ color: 'var(--text2)' }}>Cookies, cache and logins for this site exist only in this workspace. Other workspaces can't see them.</span>
      </div>
      <button type="button" className="btn" onClick={() => { send({ type: 'clearSiteData' }); onClose(); }}>Clear site data in {ws.name}</button>
      <span style={{ color: 'var(--faint)', fontSize: 12 }}>Third-party cookies dropped · Telemetry off</span>
    </div>
  );
}
