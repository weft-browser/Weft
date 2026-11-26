// The shell. The browser model comes from main as `state`; everything else here is UI-only.
import type { JSX } from 'react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Event } from '../shared/ipc';
import { MODIFIER_KEYS, type UiAction } from '../shared/keys';
import { UI_SCALES, activeTab } from '../shared/model';
import { send, useBrowserState } from './api';
import { paletteItems } from './palette-items';
import { ContextMenu, menuItems, type MenuTarget } from './components/ContextMenu';
import { EnvPanel } from './components/EnvPanel';
import { PageBackdrop } from './components/PageBackdrop';
import { Palette } from './components/Palette';
import { PrivacyPanel } from './components/PrivacyPanel';
import { Rail } from './components/Rail';
import { TabStrip } from './components/TabStrip';
import { TabsPanel, type Scope } from './components/TabsPanel';
import { Toolbar } from './components/Toolbar';

const RAIL = 72, RAIL_OPEN = 248;

export function App(): JSX.Element | null {
  const [intent, setIntent] = useState(false);
  const [hover, setHover] = useState(false);
  const [pinned, setPinned] = useState(() => { try { return localStorage.getItem('rail-pinned') === '1'; } catch { return false; } });
  const [renaming, setRenaming] = useState<number | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [envOpen, setEnvOpen] = useState(false);
  const [envTab, setEnvTab] = useState<'settings' | 'config'>('settings');
  const [cfgMsg, setCfgMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [customIcons, setCustomIcons] = useState<string[]>([]);
  const [menu, setMenu] = useState<{ target: MenuTarget; x: number; y: number } | null>(null);
  const [groupRenaming, setGroupRenaming] = useState<string | null>(null);
  const [groupDraft, setGroupDraft] = useState('');
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [pq, setPq] = useState('');
  const [tabsOpen, setTabsOpen] = useState(false);
  const [tabsScope, setTabsScope] = useState<Scope>('ws');
  const [shiftHeld, setShiftHeld] = useState(false);
  const [shot, setShot] = useState<string | null>(null);
  const [extMsg, setExtMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const shotWanted = useRef(false);
  const root = useRef<HTMLDivElement>(null);
  const page = useRef<HTMLElement>(null);
  const addr = useRef<HTMLInputElement>(null);
  const menuEl = useRef<HTMLDivElement>(null);
  const tabsBtn = useRef<HTMLButtonElement>(null);
  const tabsPanel = useRef<HTMLDivElement>(null);
  const handledGroup = useRef<string | null>(null);

  const ui = useRef<(a: UiAction) => void>(() => {});
  const onEvent = useCallback((e: Event) => {
    if (e.type === 'ui') ui.current(e.action);
    else if (e.type === 'cfg') { setCfgMsg({ ok: e.ok, text: e.text }); setEnvOpen(true); setEnvTab('config'); }
    else if (e.type === 'ext') setExtMsg({ ok: e.ok, text: e.text });
    else if (e.type === 'shot') { if (shotWanted.current) setShot((old) => { if (old) URL.revokeObjectURL(old); return e.jpeg ? URL.createObjectURL(new Blob([e.jpeg as unknown as BlobPart], { type: 'image/jpeg' })) : null; }); }
  }, []);
  const state = useBrowserState(onEvent);
  const ws = state?.workspaces[state.activeWs];
  const tab = activeTab(ws);

  const focusRoot = (): void => root.current?.focus({ preventScroll: true });
  const closePanels = (): void => { setPrivacyOpen(false); setEnvOpen(false); setMenu(null); setTabsOpen(false); };
  const closeTabs = (refocus: boolean): void => { setTabsOpen(false); if (refocus) focusRoot(); };
  const openTabs = (scope: Scope = 'ws'): void => { setTabsScope(scope); setTabsOpen(true); setMenu(null); setPaletteOpen(false); setPrivacyOpen(false); };
  const openPalette = (): void => { setPaletteOpen(true); setPq(''); closePanels(); };
  const closePalette = (): void => { setPaletteOpen(false); setPq(''); focusRoot(); };
  const startRename = (i: number): void => { if (state) { setRenaming(i); setRenameDraft(state.workspaces[i]?.name ?? ''); } };
  const endRename = (save: boolean): void => {
    if (renaming === null) return;
    if (save && renameDraft.trim()) send({ type: 'renameWs', i: renaming, name: renameDraft });
    setRenaming(null);
    focusRoot();
  };
  const startGroupRename = (gid: string, name: string): void => { setGroupRenaming(gid); setGroupDraft(name); };
  const endGroupRename = (save: boolean): void => {
    if (!groupRenaming) return;
    if (save && groupDraft.trim()) send({ type: 'renameGroup', gid: groupRenaming, name: groupDraft });
    else send({ type: 'updateGroup', gid: groupRenaming, patch: {} });
    setGroupRenaming(null);
    focusRoot();
  };
  const openEnv = (t: 'settings' | 'config', wsIndex?: number): void => {
    if (wsIndex !== undefined && state && wsIndex !== state.activeWs) send({ type: 'selectWs', i: wsIndex });
    setEnvOpen(true); setEnvTab(t); setPrivacyOpen(false); setMenu(null); setTabsOpen(false); setCfgMsg(null);
  };
  const openMenuAt = (e: React.MouseEvent, target: MenuTarget): void => {
    e.preventDefault();
    const r = root.current!.getBoundingClientRect();
    setMenu({ target, x: Math.max(8, Math.min(e.clientX - r.left, r.width - 280)), y: Math.max(8, Math.min(e.clientY - r.top + 4, r.height - 420)) });
    setPrivacyOpen(false);
    setTabsOpen(false);
  };
  const cycleUi = (): void => {
    if (!state) return;
    const i = UI_SCALES.indexOf(state.uiScale);
    send({ type: 'uiScale', v: UI_SCALES[(i + 1) % UI_SCALES.length]! });
  };

  ui.current = (a) => {
    switch (a) {
      case 'palette': if (paletteOpen) closePalette(); else openPalette(); break;
      case 'env': if (envOpen) { setEnvOpen(false); focusRoot(); } else openEnv('settings'); break;
      case 'privacy': if (tab?.url) { setPrivacyOpen((v) => !v); setEnvOpen(false); } break;
      case 'rename': if (state) startRename(state.activeWs); break;
      case 'pinRail': setPinned((v) => !v); break;
      case 'address': addr.current?.focus(); break;
      case 'menu': if (ws && tab) { setMenu({ target: { kind: 'tab', j: ws.active }, x: (pinned ? RAIL_OPEN : RAIL) + 140, y: 50 }); setPrivacyOpen(false); setTabsOpen(false); } break;
      case 'uiScale': cycleUi(); break;
      case 'tabs': if (tabsOpen && tabsScope !== 'tidy') closeTabs(true); else openTabs(); break;
      case 'tidy': if (tabsOpen && tabsScope === 'tidy') closeTabs(true); else openTabs('tidy'); break;
    }
  };

  // Shift turns the + button into "new private tab" while held.
  useEffect(() => {
    const up = (e: KeyboardEvent): void => { if (e.key === 'Shift') setShiftHeld(false); };
    const off = (): void => setShiftHeld(false);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', off);
    return () => { window.removeEventListener('keyup', up); window.removeEventListener('blur', off); };
  }, []);

  useEffect(() => { try { localStorage.setItem('rail-pinned', pinned ? '1' : '0'); } catch { /* per-viewer convenience only */ } }, [pinned]);

  // A group main just created: open its name for editing, once.
  useEffect(() => {
    const gid = state?.renameGroup ?? null;
    if (gid && handledGroup.current !== gid && ws) { handledGroup.current = gid; startGroupRename(gid, ws.groups.find((g) => g.id === gid)?.name ?? ''); }
    if (!gid) handledGroup.current = null;
  }, [state?.renameGroup, ws]);

  // Page views paint above this document: tell main where the page area is, and when something covers it.
  const report = useCallback((): void => {
    const el = page.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    send({ type: 'layout', rect: { x: r.left, y: r.top, w: r.width, h: r.height } });
  }, []);
  useLayoutEffect(() => {
    const el = page.current;
    if (!el) return;
    const ro = new ResizeObserver(report);
    ro.observe(el);
    window.addEventListener('resize', report);
    report();
    return () => { ro.disconnect(); window.removeEventListener('resize', report); };
  }, [state !== null, report]);
  // The unpinned rail flies out over the page, and nothing in this document can paint above a page
  // view. So while it is out, the page is a still: main sends a capture, the shell shows it under
  // the rail and hides the live view; letting go of the rail brings the live view back.
  // Hover intent: the capture is requested the moment the pointer enters the rail, and the rail
  // opens when the still is in place (or after 220 ms, whichever first), so it never expands under
  // a live page and then pops. A brush across the rail no longer opens it either.
  const hasPage = !!tab?.url;
  useEffect(() => {
    if (!intent || pinned) { setHover(false); return; }
    if (!hasPage) { setHover(true); return; }
    const t = setTimeout(() => setHover(true), 220);
    return () => clearTimeout(t);
  }, [intent, pinned, hasPage]);
  useEffect(() => { if (intent && shot) setHover(true); }, [intent, shot]);
  const railOpen = state !== null && (hover || pinned || state.leader || renaming !== null);
  const wantShot = state !== null && !pinned && hasPage && (intent || state.leader || renaming !== null);
  useEffect(() => {
    if (wantShot) { shotWanted.current = true; send({ type: 'pageShot' }); }
    else { shotWanted.current = false; setShot((old) => { if (old) URL.revokeObjectURL(old); return null; }); }
  }, [wantShot]);
  const flyout = railOpen && !pinned && hasPage;
  const overlay = paletteOpen || envOpen || privacyOpen || tabsOpen || !!menu || (flyout && shot !== null);
  useEffect(() => { send({ type: 'overlay', on: overlay }); }, [overlay]);
  useEffect(() => { if (!tab?.url) setPrivacyOpen(false); }, [tab?.url]);
  useEffect(() => { closePanels(); }, [state?.activeWs]);

  const onKey = (e: React.KeyboardEvent): void => {
    if (!state) return;
    const tag = (e.target as HTMLElement).tagName;
    const inInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    if (e.key === 'Escape') {
      // Esc leaves whatever is open, wherever focus is: the palette's own input handles it first,
      // but a stray focus (a hovered row, a panel button) must not swallow it.
      if (paletteOpen) { e.preventDefault(); closePalette(); return; }
      if (menu) { setMenu(null); focusRoot(); return; }
      if (tabsOpen) { closeTabs(true); return; }
      if (!inInput && (privacyOpen || envOpen)) { closePanels(); focusRoot(); return; }
    }
    if (e.key === 'Shift' && !shiftHeld) setShiftHeld(true);
    if (MODIFIER_KEYS.has(e.key)) return;
    const isLeader = (e.ctrlKey && e.code === 'Space') || (e.key === '`' && !inInput && !e.ctrlKey && !e.metaKey && !e.altKey);
    if (!state.leader && !isLeader) return;
    e.preventDefault();
    if (inInput) (e.target as HTMLElement).blur();
    send({ type: 'key', key: e.key, ctrl: e.ctrlKey, meta: e.metaKey, alt: e.altKey, code: e.code, inInput });
  };

  if (!state || !ws) return null;
  const items = paletteOpen ? paletteItems(pq, {
    state, pinned, send,
    ui: { env: openEnv, privacy: () => { if (tab?.url) { setPrivacyOpen(true); setEnvOpen(false); } }, rename: () => startRename(state.activeWs), pinRail: () => setPinned((v) => !v), menu: () => ui.current('menu'), uiScale: (v) => send({ type: 'uiScale', v }), tabs: () => ui.current('tabs'), tidy: () => ui.current('tidy') }
  }) : [];
  const openPrivacy = (): void => { if (tab?.url) { setPrivacyOpen(true); setEnvOpen(false); setTabsOpen(false); } };

  return (
    <div ref={root} className="shell" tabIndex={0} onKeyDown={onKey} aria-label="Workspace browser. Press backtick or Control Space for the prefix key."
      onMouseDown={(e) => {
        const at = e.target as Node;
        // A click anywhere outside the palette is an Escape.
        if (paletteOpen && !(at instanceof Element && at.closest('.palette'))) { e.preventDefault(); closePalette(); return; }
        if (menu && menuEl.current && !menuEl.current.contains(at)) setMenu(null);
        if (tabsOpen && tabsPanel.current && !tabsPanel.current.contains(at) && !tabsBtn.current?.contains(at)) closeTabs(false);
      }}>
      <Rail state={state} open={railOpen} pinned={pinned} paletteOpen={paletteOpen} renaming={renaming} renameDraft={renameDraft}
        onHover={setIntent} onRenameDraft={setRenameDraft} onRenameEnd={endRename} onStartRename={startRename} onMenu={openMenuAt}
        onTogglePalette={() => (paletteOpen ? closePalette() : openPalette())} onTogglePin={() => setPinned((v) => !v)} />
      <div className="column" style={{ marginLeft: pinned ? RAIL_OPEN : RAIL }}>
        <TabStrip ws={ws} groupRenaming={groupRenaming} groupDraft={groupDraft} shiftHeld={shiftHeld} tabsOpen={tabsOpen} tabsBtnRef={tabsBtn}
          onGroupDraft={setGroupDraft} onGroupRenameEnd={endGroupRename} onStartGroupRename={startGroupRename} onMenu={openMenuAt} onToggleTabs={() => (tabsOpen ? closeTabs(true) : openTabs())} />
        <Toolbar ref={addr} state={state} ws={ws} tab={tab} editing={editing} draft={draft} privacyOpen={privacyOpen} envOpen={envOpen} onMenu={openMenuAt}
          onDraft={setDraft} onEditing={setEditing} onTogglePrivacy={() => { setPrivacyOpen((v) => !v); setEnvOpen(false); }} onToggleEnv={() => (envOpen ? setEnvOpen(false) : openEnv('settings'))} />
        <main ref={page} className="page">
          <PageBackdrop state={state} ws={ws} tab={tab} />
          {flyout && shot && <img src={shot} alt="" aria-hidden="true" className="page-shot" />}
        </main>
        {privacyOpen && tab?.url && <PrivacyPanel state={state} ws={ws} tab={tab} onClose={() => { setPrivacyOpen(false); focusRoot(); }} />}
        {envOpen && <EnvPanel state={state} ws={ws} tab={tab} tabKind={envTab} cfgMsg={cfgMsg} extMsg={extMsg} customIcons={customIcons} onCustomIcon={(src) => setCustomIcons((c) => (c.includes(src) ? c : c.concat([src])))} onTab={(t) => { setEnvTab(t); setCfgMsg(null); }} onClose={() => { setEnvOpen(false); focusRoot(); }} />}
        {tabsOpen && <TabsPanel state={state} panelRef={tabsPanel} initial={tabsScope} onClose={closeTabs} />}
      </div>
      {menu && (
        <div ref={menuEl} style={{ position: 'absolute', left: menu.x, top: menu.y, zIndex: 9 }}>
          <ContextMenu kind={menu.target.kind} items={menuItems(ws, menu.target, { state, openIcons: () => openEnv('settings'), openEnv, openPrivacy, startGroupRename, startRename })} x={0} y={0} onClose={() => { setMenu(null); focusRoot(); }} />
        </div>
      )}
      {paletteOpen && <Palette items={items} query={pq} onQuery={setPq} onRun={(it) => { closePalette(); it.run(); }} onClose={closePalette} />}
    </div>
  );
}
