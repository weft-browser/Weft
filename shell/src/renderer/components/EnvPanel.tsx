import type { JSX } from 'react';
import { useEffect, useRef, useState } from 'react';
import { serialize } from '../../shared/envfile';
import { FPS, FP_HELP, FP_NAMES, ICONS, LOCALES, NETS, NET_NAMES, SWATCHES, TIMEZONES, isHex, normHex, slug, type BrowserState, type Icon, type Tab, type Workspace } from '../../shared/model';
import { send } from '../api';
import { G, Glyph, IconView } from '../icons';

interface Props {
  state: BrowserState;
  ws: Workspace;
  tab: Tab | null;
  tabKind: 'settings' | 'config';
  cfgMsg: { ok: boolean; text: string } | null;
  extMsg: { ok: boolean; text: string } | null;
  customIcons: string[];
  onCustomIcon: (src: string) => void;
  onTab: (t: 'settings' | 'config') => void;
  onClose: () => void;
}

type IconOpt = { label: string; icon: Icon | null; on: boolean; pick: () => void; letter: string };

const sameIcon = (a: Icon | null | undefined, b: Icon | null | undefined): boolean => {
  const ka = a?.kind ?? 'letter', kb = b?.kind ?? 'letter';
  if (ka !== kb) return false;
  if (a?.kind === 'svg' && b?.kind === 'svg') return a.id === b.id;
  if (a?.kind === 'img' && b?.kind === 'img') return a.src === b.src;
  return true;
};

export function EnvPanel(p: Props): JSX.Element {
  const { ws, tab, state } = p;
  const env = ws.env;
  const [hex, setHex] = useState<string | null>(null);
  const [iconMsg, setIconMsg] = useState('');
  const [draft, setDraft] = useState(() => serialize(ws));
  const [dirty, setDirty] = useState(false);
  const wsFile = useRef<HTMLInputElement>(null);
  const tabFile = useRef<HTMLInputElement>(null);
  const fileName = slug(ws.name) + '.env.toml';
  const current = serialize(ws);
  useEffect(() => { if (!dirty) setDraft(current); }, [current, dirty]);
  const [extRef, setExtRef] = useState('');
  useEffect(() => { setDirty(false); setDraft(serialize(ws)); setHex(null); setIconMsg(''); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [ws.id]);

  const importIcon = (ev: React.ChangeEvent<HTMLInputElement>, apply: (icon: Icon) => void): void => {
    const input = ev.target;
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > 1024 * 1024) { setIconMsg('That image is over 1 MB. Pick a smaller one.'); input.value = ''; return; }
    const reader = new FileReader();
    reader.onload = () => { const src = String(reader.result); setIconMsg(''); p.onCustomIcon(src); apply({ kind: 'img', src }); };
    reader.onerror = () => setIconMsg('Could not read that file.');
    reader.readAsDataURL(file);
    input.value = '';
  };
  const library: Array<{ label: string; icon: Icon }> = ICONS.map((i) => ({ label: i[1], icon: { kind: 'svg', id: i[0] } as Icon }))
    .concat(p.customIcons.map((src, n) => ({ label: 'Imported icon ' + (n + 1), icon: { kind: 'img', src } as Icon })));
  const hexValue = hex !== null ? hex : ws.color;
  const hexInvalid = hex !== null && !isHex(hex);
  const iconGrid = (opts: IconOpt[], fileRef: React.RefObject<HTMLInputElement | null>, label: string): JSX.Element => (
    <div role="group" aria-label={label} className="grid8">
      {opts.map((o) => (
        <button key={o.label} type="button" className={'icon-opt' + (o.on ? ' on' : '')} onClick={o.pick} aria-pressed={o.on} aria-label={o.label} title={o.label}>
          {o.icon ? <IconView icon={o.icon} letter={o.letter} size={18} /> : <span style={{ fontSize: o.letter.length > 1 ? 11 : 14, fontWeight: o.letter.length > 1 ? 600 : 700 }}>{o.letter}</span>}
        </button>
      ))}
      <button type="button" className="import" onClick={() => fileRef.current?.click()} title="Import an image (PNG, JPG, SVG, WebP, max 1 MB)">Import…</button>
    </div>
  );
  const letter = (ws.name.charAt(0) || '?').toUpperCase();
  const closeLabel = env.disposable ? 'Wipe and close workspace' : state.pendingCloseWs === ws.id ? 'Click again to close ' + ws.name : 'Close workspace';

  return (
    <div role="dialog" aria-label="Workspace environment" className="panel env">
      <div className="env-head">
        <span aria-hidden="true" className="dot" style={{ width: 10, height: 10, background: ws.color }} />
        <span className="ellip" style={{ fontWeight: 600, fontSize: 15, flex: 1 }}>{ws.name} environment</span>
        <button type="button" className="icon-btn" onClick={p.onClose} aria-label="Close environment panel"><Glyph d={G.close} size={12} stroke={2.4} /></button>
      </div>
      <div role="tablist" aria-label="Environment view" className="env-tabs">
        <button type="button" role="tab" aria-selected={p.tabKind === 'settings'} className={'env-tab' + (p.tabKind === 'settings' ? ' on' : '')} style={{ borderBottomColor: p.tabKind === 'settings' ? ws.color : undefined }} onClick={() => p.onTab('settings')}>Settings</button>
        <button type="button" role="tab" aria-selected={p.tabKind === 'config'} className={'env-tab mono' + (p.tabKind === 'config' ? ' on' : '')} style={{ fontSize: 12.5, borderBottomColor: p.tabKind === 'config' ? ws.color : undefined }} onClick={() => p.onTab('config')}>{fileName}</button>
      </div>

      {p.tabKind === 'settings' && (
        <div className="env-body">
          <div className="col">
            <span className="label">Appearance</span>
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
              <label htmlFor="wshex" className="hint" style={{ width: 52 }}>Color</label>
              <input type="color" value={normHex(ws.color)} onChange={(e) => { send({ type: 'setWsColor', hex: e.target.value }); setHex(null); }} aria-label="Open color picker" style={{ width: 44, height: 36, padding: 2, border: '1px solid var(--line2)', borderRadius: 8, background: 'var(--bg)', cursor: 'pointer' }} />
              <input id="wshex" type="text" className="field mono" value={hexValue} spellCheck={false} autoComplete="off" maxLength={7} style={{ width: 104, borderColor: hexInvalid ? 'var(--red)' : undefined, fontSize: 13 }}
                onChange={(e) => { let v = e.target.value.trim(); if (v && v.charAt(0) !== '#') v = '#' + v; setHex(v); if (isHex(v)) send({ type: 'setWsColor', hex: v }); }} onBlur={() => setHex(null)} />
              {hexInvalid && <span style={{ fontSize: 12, color: 'var(--red)' }}>Use #RGB or #RRGGBB</span>}
            </div>
            <div role="group" aria-label="Color presets" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, paddingLeft: 62 }}>
              {SWATCHES.map((h) => <button key={h} type="button" className={'swatch' + (ws.color === h ? ' on' : '')} style={{ background: h }} onClick={() => { send({ type: 'setWsColor', hex: h }); setHex(null); }} aria-label={'Use ' + h} aria-pressed={ws.color === h} title={h} />)}
            </div>
            <span className="hint" style={{ marginTop: 6 }}>Workspace icon</span>
            {iconGrid(([{ label: 'Letter', icon: null, on: sameIcon(ws.icon, null), pick: () => send({ type: 'setWsIcon', icon: null }), letter }] as IconOpt[])
              .concat(library.map((l) => ({ label: l.label, icon: l.icon, on: sameIcon(ws.icon, l.icon), pick: () => send({ type: 'setWsIcon', icon: l.icon }), letter: '' }))), wsFile, 'Workspace icon')}
            <input ref={wsFile} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp,image/gif" onChange={(e) => importIcon(e, (icon) => send({ type: 'setWsIcon', icon }))} aria-label="Import workspace icon" style={{ display: 'none' }} />
            {tab && (<>
              <span className="hint" style={{ marginTop: 6 }}>Icon for this tab · {tab.title}</span>
              {iconGrid(([{ label: 'Site icon', icon: null, on: sameIcon(tab.icon, null), pick: () => send({ type: 'setTabIcon', icon: null }), letter: 'Site' }] as IconOpt[])
                .concat(library.map((l) => ({ label: l.label, icon: l.icon, on: sameIcon(tab.icon, l.icon), pick: () => send({ type: 'setTabIcon', icon: l.icon }), letter: '' }))), tabFile, 'Tab icon')}
            </>)}
            <input ref={tabFile} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp,image/gif" onChange={(e) => importIcon(e, (icon) => send({ type: 'setTabIcon', icon }))} aria-label="Import tab icon" style={{ display: 'none' }} />
            {iconMsg && <span role="status" style={{ fontSize: 12.5, color: 'var(--red)' }}>{iconMsg}</span>}
          </div>

          <div className="col">
            <span className="label">Network route</span>
            <div role="group" aria-label="Network route" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 6 }}>
              {NETS.map((n) => <button key={n} type="button" className={'seg' + (env.network === n ? ' on' : '')} aria-pressed={env.network === n} onClick={() => send({ type: 'updateEnv', patch: { network: n } })}>{NET_NAMES[n]}</button>)}
            </div>
            {env.network === 'vpn' && (<>
              <div role="group" aria-label="VPN exit region" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {state.vpnRegions.map((r) => {
                  const s = state.vpnStatus[r];
                  const dot = !state.vpnConfigured.includes(r) ? 'var(--disabled)' : s?.state === 'up' ? 'var(--green)' : s?.state === 'starting' ? 'var(--key)' : 'var(--red)';
                  return <button key={r} type="button" className={'pill' + (env.region === r ? ' on' : '')} aria-pressed={env.region === r} onClick={() => send({ type: 'updateEnv', patch: { region: r } })}><span aria-hidden="true" className="dot" style={{ background: dot, marginRight: 6 }} />{r}</button>;
                })}
              </div>
              {(() => {
                const s = state.vpnStatus[env.region];
                const ok = state.vpnConfigured.includes(env.region);
                const text = !ok ? 'No WireGuard config for ' + env.region + ' yet. Until there is one, this workspace goes direct and the chip says so.'
                  : !state.vpnEngine ? 'wireproxy is not installed, so the tunnel cannot start and this workspace fails closed (nothing loads). Install it with `brew install wireproxy`, then switch the route off and on.'
                  : s ? s.state === 'up' ? 'Tunnel up: every page in this workspace exits in ' + env.region + '. DNS goes through the tunnel too.'
                  : s.state === 'starting' ? 'Connecting… pages fail until the tunnel is up (fail closed): ' + s.detail
                  : 'Tunnel down, failing closed: ' + s.detail
                  : 'Starting the tunnel…';
                return <span role="status" className="hint" style={{ color: ok && s?.state === 'up' ? 'var(--green)' : undefined }}>{text}</span>;
              })()}
              <div className="row" style={{ minHeight: 40 }}>
                <span className="hint">One WireGuard <span className="mono">.conf</span> per region, from any provider, named after the region: <span className="mono">Zurich, CH.conf</span>. It holds a private key; it never leaves this Mac.</span>
                <button type="button" className="btn sm" onClick={() => send({ type: 'openVpnDir' })}>Open VPN folder</button>
              </div>
            </>)}
            {env.network === 'vpn' && <span className="hint">Regions map to endpoints in <span className="mono">vpn.toml</span> in {state.dataDir}. A region without one goes direct, and the chip says so.</span>}
            {env.network === 'proxy' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label htmlFor="proxyhost" className="hint">Proxy (scheme://host:port — http, socks5)</label>
                <input id="proxyhost" type="text" className="field mono" value={env.proxy} placeholder="socks5://10.0.0.2:1080" onChange={(e) => send({ type: 'updateEnv', patch: { proxy: e.target.value } })} />
              </div>
            )}
            {env.network === 'tor' && <span className="hint">Traffic goes through a local Tor daemon on 127.0.0.1:9050. Expect slower pages and more CAPTCHAs.</span>}
          </div>

          <div className="col">
            <span className="label">Identity</span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label htmlFor="envlocale" className="hint">Language</label>
                <select id="envlocale" className="field" value={env.locale} onChange={(e) => send({ type: 'updateEnv', patch: { locale: e.target.value } })} style={{ padding: '0 8px' }}>{LOCALES.map((l) => <option key={l} value={l}>{l}</option>)}</select>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label htmlFor="envtz" className="hint">Timezone</label>
                <select id="envtz" className="field" value={env.tz} onChange={(e) => send({ type: 'updateEnv', patch: { tz: e.target.value } })} style={{ padding: '0 8px' }}>{TIMEZONES.map((t) => <option key={t} value={t}>{t}</option>)}</select>
              </div>
            </div>
            <span className="hint">Fingerprint</span>
            <div role="group" aria-label="Fingerprint" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6 }}>
              {FPS.map((f) => <button key={f} type="button" className={'seg' + (env.fp === f ? ' on' : '')} aria-pressed={env.fp === f} onClick={() => send({ type: 'updateEnv', patch: { fp: f } })}>{FP_NAMES[f]}</button>)}
            </div>
            <span className="hint">{FP_HELP[env.fp]}</span>
          </div>

          <div className="col" style={{ gap: 6 }}>
            <span className="label">Extensions in this workspace</span>
            {state.extensions.length === 0 && (
              <div className="row" style={{ minHeight: 40 }}>
                <span className="hint">Put unpacked Chrome extensions in <span className="mono">extensions/</span> inside {state.dataDir}; each folder becomes a switch here.</span>
                <button type="button" className="btn sm" onClick={() => send({ type: 'openExtensionsDir' })}>Open folder</button>
              </div>
            )}
            {state.extensions.map((n) => (
              <div key={n} className="row" style={{ minHeight: 40 }}>
                <span>{n}</span>
                <button type="button" className={'switch' + (env.ext[n] ? ' on' : '')} onClick={() => send({ type: 'toggleExt', name: n })} aria-pressed={!!env.ext[n]} aria-label={n + ' in this workspace'}><span aria-hidden="true" /></button>
              </div>
            ))}
            <form className="row" style={{ marginTop: 4 }} onSubmit={(e) => { e.preventDefault(); if (extRef.trim()) { send({ type: 'installExt', ref: extRef }); setExtRef(''); } }}>
              <label htmlFor="extref" className="sr">Chrome Web Store link or extension id</label>
              <input id="extref" type="text" className="field mono" style={{ flex: 1, minWidth: 0 }} value={extRef} spellCheck={false} autoComplete="off" placeholder="Chrome Web Store link or extension id" onChange={(e) => setExtRef(e.target.value)} />
              <button type="submit" className="btn sm" disabled={!extRef.trim()}>Install</button>
            </form>
            {p.extMsg && <span role="status" className="hint" style={{ color: p.extMsg.ok ? 'var(--green)' : 'var(--red)' }}>{p.extMsg.text}</span>}
            <span className="hint">Installs land in <span className="mono">extensions/</span> and can be switched per workspace. In this build an extension loads into the workspace, but its page scripts do not run yet and its toolbar popup has no place to open.</span>
          </div>

          <div className="col">
            <span className="label">Lifecycle</span>
            <div className="row">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontWeight: 600 }}>Disposable</span>
                <span className="hint">Wipe cookies, history and cache when it closes</span>
              </div>
              <button type="button" className={'switch amber' + (env.disposable ? ' on' : '')} onClick={() => send({ type: 'updateEnv', patch: { disposable: !env.disposable } })} aria-pressed={env.disposable} aria-label="Disposable workspace"><span aria-hidden="true" /></button>
            </div>
            <button type="button" className="btn danger" onClick={() => send({ type: 'closeWs' })}>{closeLabel}</button>
          </div>
        </div>
      )}

      {p.tabKind === 'config' && (
        <div className="env-cfg">
          <label htmlFor="envcfg" className="hint">Edit the file, then apply it here or create a new workspace from it. Keep it in git to rebuild this setup on another machine.</label>
          <textarea id="envcfg" spellCheck={false} value={draft} onChange={(e) => { setDraft(e.target.value); setDirty(true); }} />
          {p.cfgMsg && <span role="status" style={{ fontSize: 12.5, color: p.cfgMsg.ok ? 'var(--green)' : 'var(--red)' }}>{p.cfgMsg.text}</span>}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button type="button" className="btn sm primary" onClick={() => { send({ type: 'applyCfg', text: draft }); setDirty(false); }}>Apply to {ws.name}</button>
            <button type="button" className="btn sm" onClick={() => { send({ type: 'newWsFromCfg', text: draft }); setDirty(false); }}>New workspace from file</button>
            <button type="button" className="btn sm ghost" onClick={() => { setDraft(current); setDirty(false); }}>Revert</button>
          </div>
        </div>
      )}
    </div>
  );
}
