import type { JSX } from 'react';
import { seenAs, stripScheme, type BrowserState, type Tab, type Workspace } from '../../shared/model';
import { send } from '../api';

/** What sits under the live page view: page facts when a panel hides the view, or the blank / no-tab states. */
export function PageBackdrop({ state, ws, tab }: { state: BrowserState; ws: Workspace; tab: Tab | null }): JSX.Element {
  if (!tab) {
    return (
      <div className="backdrop"><div className="center">
        <p style={{ fontSize: 15 }}>No tabs open in {ws.name}</p>
        <button type="button" className="btn" onClick={() => send({ type: 'newTab' })}>Open a tab <span className="mono" style={{ color: 'var(--muted)', marginLeft: 6 }}>` t</span></button>
      </div></div>
    );
  }
  if (!tab.url) {
    return (
      <div className="backdrop"><div className="center">
        <p className="big">{tab.private ? 'New private tab in ' : 'New tab in '}{ws.name}</p>
        <p>Type an address, or anything else to search privately.</p>
        {ws.env.disposable && <p className="disp-note">Disposable: nothing here is saved. Closing its last tab wipes cookies, history and cache.</p>}
        {tab.private && <p className="priv-note">Private tab: its history, cookies and cache are deleted when you close it. It won't show in reopen, and extensions stay off.</p>}
      </div></div>
    );
  }
  return (
    <div className="backdrop">
      <div style={{ maxWidth: 880, display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div className="crumbs"><span aria-hidden="true" className="dot" style={{ background: ws.color }} /><span>{ws.name}</span><span aria-hidden="true">/</span><span>tab {ws.active + 1} of {ws.tabs.length}</span></div>
        <h1>{tab.title}</h1>
        <p className="url">{stripScheme(tab.url)}</p>
        <p className="sees"><span style={{ color: 'var(--muted)' }}>This site sees:</span> {seenAs(ws.env, state.vpnConfigured, state.vpnStatus)}{tab.private && <> <span className="priv-chip">private tab</span></>}</p>
        {tab.private && <p className="priv-note">Private tab: its history, cookies and cache are deleted when you close it. It won't show in reopen.</p>}
      </div>
    </div>
  );
}
