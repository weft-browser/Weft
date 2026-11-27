import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import type { HudState } from '../../shared/ipc';
import { KEY_GROUPS } from '../../shared/keys';

export function Hud(): JSX.Element {
  const [hud, setHud] = useState<HudState>({ leader: false, toast: '', hover: '', hinting: false });
  useEffect(() => window.weft.on((e) => { if (e.type === 'hud') setHud(e.hud); }), []);
  return (
    <div className="hud">
      {hud.leader && (
        <div role="status" aria-label="Prefix keys" className="hud-card">
          {KEY_GROUPS.map((g) => (
            <div key={g.title} className="hud-col">
              <span className="label">{g.title}</span>
              {g.keys.map((k) => <div key={k.keys} className="hud-row"><b>{k.keys}</b><span>{k.label}</span></div>)}
            </div>
          ))}
          <div className="hud-col"><span className="label" style={{ color: 'var(--muted)' }}>&nbsp;</span><div className="hud-row"><b style={{ color: 'var(--muted)' }}>esc</b><span style={{ color: 'var(--muted)' }}>cancel</span></div></div>
        </div>
      )}
      {!hud.leader && hud.hinting && <div role="status" className="hud-toast hud-hint">Press a highlighted letter to follow that link · <span className="mono" style={{ color: 'var(--muted)' }}>esc</span> to cancel</div>}
      {!hud.leader && !hud.hinting && hud.toast && <div role="status" className="hud-toast">{hud.toast}</div>}
      {hud.hover && <div className="hud-url">{hud.hover}</div>}
    </div>
  );
}
