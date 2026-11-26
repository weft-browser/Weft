// The controller: owns the model, the window, one session per workspace and one
// WebContentsView per tab. The renderer is a view over `state()` and talks in commands.
import { BrowserWindow, Menu, WebContentsView, clipboard, ipcMain, shell, type MenuItemConstructorOptions, type WebContents } from 'electron';
import { join } from 'node:path';
import { CH, type Command, type Event, type HudState, type Rect } from '../shared/ipc';
import { MODIFIER_KEYS, leaderAction, type UiAction } from '../shared/keys';
import {
  DEFAULT_REGIONS, DISPOSABLE_COLOR, GROUP_COLORS, PALETTE, activeTab, hostOf, mkEnv, newTab, newWorkspace, nextZoom, normHex, slug, titleFor, toNavigation,
  type BrowserState, type ClosedTab, type Env, type Group, type Icon, type Tab, type Workspace
} from '../shared/model';
import { cfgIcon, colorFromFile, envFromFile, parse as parseEnv, serialize } from '../shared/envfile';
import { decodeSnapshot, encodeSnapshot } from '../shared/snapshot';
import * as ops from '../shared/ops';
import { createHud, placeHud } from './hud';
import { installMenu } from './menu';
import { WsSession, privatePartition } from './sessions';
import { installFromWebStore } from './webstore';
import { Tunnels, findWireproxy } from './tunnels';
import { Updater, type UpdateEngine } from './updater';
import { ensureDirs, listExtensions, paths, readSnapshot, readVpn, removeEnvFile, writeEnvFile, writeSnapshot, type Paths } from './store';

interface Boot { shellPreload: string; tabPreload: string; version: string; updates: UpdateEngine | null; }

export class Browser {
  private p: Paths = paths();
  private ws: Workspace[] = [];
  private activeWs = 0;
  private closed: ClosedTab[] = [];
  private allow: Record<string, boolean> = {};
  private leader = false;
  private pendingClose: string | null = null;
  private renameGroup: string | null = null;
  private extensions: string[] = [];
  private vpn: Record<string, string> = {};
  private uiScale = 1;
  private rect: Rect = { x: 72, y: 96, w: 800, h: 600 };
  private overlay = false;
  private disposables = 0;
  private hudState: HudState = { leader: false, toast: '', hover: '', hinting: false };
  private win!: BrowserWindow;
  private hud!: BrowserWindow;
  private tunnels!: Tunnels;
  private updater!: Updater;
  private views = new Map<string, WebContentsView>();
  private loaded = new Set<string>();
  private sessions = new Map<string, WsSession>();
  private privSessions = new Map<string, WsSession>();
  private editable = new Set<number>();
  private topHost = new Map<number, string>();
  private wcTab = new Map<number, { wsId: string; tabId: string }>();
  private zoomMem = new Map<string, number>();
  private envFiles = new Map<string, { file: string; text: string }>();
  private timers: { emit?: NodeJS.Immediate; save?: NodeJS.Timeout; close?: NodeJS.Timeout; toast?: NodeJS.Timeout } = {};

  constructor(private boot: Boot) {}

  // ── boot ────────────────────────────────────────────────────────────────

  start(): void {
    ensureDirs(this.p);
    this.extensions = listExtensions(this.p);
    this.vpn = readVpn(this.p);
    this.tunnels = new Tunnels({
      dir: this.p.vpnDir,
      binary: findWireproxy([join(process.resourcesPath ?? '', 'bin', 'wireproxy'), join(this.p.root, 'bin', 'wireproxy')]),
      onStatus: (region, s) => { console.log('vpn ' + region + ': ' + s.state + ' (' + s.detail + ')'); this.emit(); },
      log: (l) => console.log(l)
    });
    this.updater = new Updater({
      engine: this.boot.updates, current: this.boot.version,
      onChange: (_s, note) => { if (note) this.toast(note); this.emit(); },
      log: (l) => console.log(l)
    });
    const raw = readSnapshot(this.p);
    if (raw !== null) {
      const d = decodeSnapshot(raw, this.extensions);
      d.warnings.forEach((w) => console.warn('state.json: ' + w));
      this.ws = d.workspaces;
      this.activeWs = d.activeWs;
      this.closed = d.closed;
      this.allow = d.allow;
    }
    if (!this.ws.length) {
      const w = newWorkspace('Workspace 1', PALETTE[0]!, mkEnv(null, this.extensions));
      w.tabs.push(newTab());
      this.ws = [w];
      this.activeWs = 0;
    }
    this.createWindow();
    installMenu((c) => this.dispatch(c), (a) => this.ui(a));
    this.wireIpc();
    this.ws.forEach((w) => this.sessionFor(w));
    this.syncTunnels();
    this.showTab();
    this.emit();
    this.updater.start();
  }

  /** Tunnels follow the workspaces: one per region in use, none for regions nobody uses. */
  private syncTunnels(): void {
    this.tunnels.sync(this.ws.filter((w) => w.env.network === 'vpn').map((w) => w.env.region)).catch((e: Error) => console.warn('vpn: ' + e.message));
  }

  shutdown(): void {
    this.flushSave();
    this.tunnels.stopAll();
    this.updater.stop();
  }

  private createWindow(): void {
    this.win = new BrowserWindow({
      width: 1440, height: 900, minWidth: 900, minHeight: 560, show: false,
      backgroundColor: '#0e1014',
      titleBarStyle: process.platform === 'darwin' ? 'hidden' : 'default',
      trafficLightPosition: { x: 14, y: 16 },
      webPreferences: { preload: this.boot.shellPreload, sandbox: true, contextIsolation: true }
    });
    this.hud = createHud(this.win, this.boot.shellPreload);
    this.win.once('ready-to-show', () => this.win.show());
    this.win.on('resize', () => this.relayout());
    this.win.on('move', () => this.relayout());
    this.win.on('blur', () => { if (this.leader) this.setLeader(false); });
    this.win.on('closed', () => { this.flushSave(); });
    if (process.env.ELECTRON_RENDERER_URL) this.win.loadURL(process.env.ELECTRON_RENDERER_URL + '/index.html');
    else this.win.loadFile(join(__dirname, '../renderer/index.html'));
  }

  private wireIpc(): void {
    ipcMain.handle(CH.state, () => this.state());
    ipcMain.on(CH.command, (e, cmd: Command) => { if (e.sender === this.win.webContents) this.dispatch(cmd); });
    ipcMain.on('weft:editable', (e, on: boolean) => { if (on) this.editable.add(e.sender.id); else this.editable.delete(e.sender.id); });
    ipcMain.on('weft:hints-done', () => this.setHud({ hinting: false }));
    ipcMain.on('weft:open-link', (e, o: { url: string; private: boolean }) => {
      const ref = this.wcTab.get(e.sender.id);
      if (!ref || typeof o?.url !== 'string' || !/^https?:/i.test(o.url)) return;
      const wi = this.ws.findIndex((w) => w.id === ref.wsId);
      const tab = this.ws[wi]?.tabs.find((t) => t.id === ref.tabId);
      if (tab) this.openLink(o.url, { ws: wi, private: tab.private || !!o.private, activate: false });
    });
  }

  // ── state out ───────────────────────────────────────────────────────────

  state(): BrowserState {
    const configured = Array.from(new Set([...this.tunnels.regions(), ...Object.keys(this.vpn)])).sort();
    return {
      workspaces: this.ws, activeWs: this.activeWs, closed: this.closed, leader: this.leader, pendingCloseWs: this.pendingClose,
      extensions: this.extensions, vpnRegions: configured.length ? configured : DEFAULT_REGIONS, vpnConfigured: configured,
      vpnStatus: this.tunnels.statuses(), vpnEngine: this.tunnels.hasEngine(), vpnDir: this.p.vpnDir, allow: this.allow,
      renameGroup: this.renameGroup, uiScale: this.uiScale, dataDir: this.p.root, update: this.updater.state()
    };
  }

  private emit(): void {
    if (this.timers.emit) return;
    this.timers.emit = setImmediate(() => {
      this.timers.emit = undefined;
      this.send({ type: 'state', state: this.state() });
      this.scheduleSave();
    });
  }

  private send(e: Event): void {
    if (!this.win.isDestroyed()) this.win.webContents.send(CH.event, e);
  }

  /** Queued behind any pending state emit, so "focus the address bar" always lands on the tab that was just made current.
   *  Every UI action is the shell's to handle, so keyboard focus moves to the shell first: a page view keeps
   *  OS focus even when hidden, and the keys would otherwise go to a page nobody can see. */
  private ui(action: UiAction): void {
    this.win.webContents.focus();
    setImmediate(() => this.send({ type: 'ui', action }));
  }

  private toast(text: string): void {
    this.setHud({ toast: text });
    clearTimeout(this.timers.toast);
    this.timers.toast = setTimeout(() => this.setHud({ toast: '' }), 2600);
  }

  private setHud(patch: Partial<HudState>): void {
    this.hudState = { ...this.hudState, ...patch };
    const show = this.hudState.leader || !!this.hudState.toast || !!this.hudState.hover || this.hudState.hinting;
    if (!this.hud.isDestroyed()) {
      this.hud.webContents.send(CH.event, { type: 'hud', hud: this.hudState } satisfies Event);
      if (show && !this.hud.isVisible()) { placeHud(this.hud, this.win, this.scaled(this.rect)); this.hud.showInactive(); }
      if (!show && this.hud.isVisible()) this.hud.hide();
    }
  }

  // ── persistence ─────────────────────────────────────────────────────────

  private scheduleSave(): void {
    clearTimeout(this.timers.save);
    this.timers.save = setTimeout(() => this.flushSave(), 400);
  }

  private flushSave(): void {
    clearTimeout(this.timers.save);
    try {
      writeSnapshot(this.p, encodeSnapshot(this.ws, this.activeWs, this.closed, this.allow));
    } catch (e) {
      console.error('could not write state.json: ' + (e as Error).message);
    }
    const live = new Set<string>();
    for (const w of this.ws) {
      if (w.env.disposable) continue;
      live.add(w.id);
      const file = slug(w.name) + '.env.toml';
      const text = serialize(w);
      const prev = this.envFiles.get(w.id);
      if (prev && prev.file !== file) removeEnvFile(this.p, prev.file);
      if (!prev || prev.file !== file || prev.text !== text) {
        writeEnvFile(this.p, file, text);
        this.envFiles.set(w.id, { file, text });
      }
    }
    for (const [id, f] of this.envFiles) if (!live.has(id)) { removeEnvFile(this.p, f.file); this.envFiles.delete(id); }
  }

  // ── helpers ─────────────────────────────────────────────────────────────

  private cur(): Workspace { return this.ws[this.activeWs]!; }
  private tabOf(ws: Workspace, j?: number): Tab | null { return ws.tabs[j ?? ws.active] ?? null; }
  private viewOf(tab: Tab | null): WebContentsView | undefined { return tab ? this.views.get(tab.id) : undefined; }
  private wcOf(tab: Tab | null): WebContents | undefined { return this.viewOf(tab)?.webContents; }
  private allowKey(ws: Workspace, host: string): string { return ws.id + '|' + host; }
  private zoomKey(ws: Workspace, url: string): string { return ws.id + '|' + hostOf(url); }
  private scaled(r: Rect): Rect { return { x: r.x * this.uiScale, y: r.y * this.uiScale, w: r.w * this.uiScale, h: r.h * this.uiScale }; }

  private sessionFor(ws: Workspace): WsSession {
    let s = this.sessions.get(ws.id);
    if (!s) {
      s = new WsSession(ws, this.sessionCtx());
      this.sessions.set(ws.id, s);
      s.applyEnv(ws.env).then((warnings) => warnings.forEach((w) => console.warn(ws.name + ': ' + w)));
    }
    return s;
  }

  /** The session a tab's view runs in: the workspace's, or its own in-memory one when private. */
  private sessionForTab(ws: Workspace, tab: Tab): WsSession {
    if (!tab.private) return this.sessionFor(ws);
    let s = this.privSessions.get(tab.id);
    if (!s) {
      s = new WsSession(ws, this.sessionCtx(), privatePartition(tab.id));
      this.privSessions.set(tab.id, s);
      s.applyEnv({ ...ws.env, ext: {} }).then((warnings) => warnings.forEach((w) => console.warn(ws.name + ' (private tab): ' + w)));
    }
    return s;
  }

  private sessionCtx(): ConstructorParameters<typeof WsSession>[1] {
    return {
      tabPreload: this.boot.tabPreload,
      extensionsDir: this.p.extensions,
      vpn: this.vpn,
      tunnel: (region) => this.tunnels.endpoint(region),
      topHost: (wcId) => this.topHost.get(wcId) ?? '',
      isProtected: (wcId, top) => { const t = this.wcTab.get(wcId); return !t || !this.allow[t.wsId + '|' + top]; },
      onBlocked: (wcId) => this.bumpBlocked(wcId)
    };
  }

  private bumpBlocked(wcId: number): void {
    const ref = this.wcTab.get(wcId);
    if (!ref) return;
    const ws = this.ws.find((w) => w.id === ref.wsId);
    const tab = ws?.tabs.find((t) => t.id === ref.tabId);
    if (tab) { tab.blocked += 1; this.emit(); }
  }

  private ensureView(ws: Workspace, tab: Tab): WebContentsView {
    let view = this.views.get(tab.id);
    if (view) return view;
    const s = this.sessionForTab(ws, tab);
    view = new WebContentsView({ webPreferences: { session: s.ses, preload: this.boot.tabPreload, sandbox: true, contextIsolation: true, nodeIntegration: false } });
    view.setBackgroundColor('#ffffff');
    this.views.set(tab.id, view);
    const wc = view.webContents;
    this.wcTab.set(wc.id, { wsId: ws.id, tabId: tab.id });
    const find = (): { ws: Workspace; tab: Tab } | null => {
      const w = this.ws.find((x) => x.id === ws.id);
      const t = w?.tabs.find((x) => x.id === tab.id);
      return w && t ? { ws: w, tab: t } : null;
    };
    wc.on('page-title-updated', (_e, title) => { const f = find(); if (f) { f.tab.title = title || titleFor(f.tab.url); this.emit(); } });
    wc.on('page-favicon-updated', (_e, icons) => { const f = find(); if (f) { f.tab.favicon = icons[0] ?? null; this.emit(); } });
    wc.on('did-start-loading', () => { const f = find(); if (f) { f.tab.loading = true; this.emit(); } });
    wc.on('did-stop-loading', () => { const f = find(); if (f) { f.tab.loading = false; this.syncNav(f.tab, wc); this.emit(); } });
    wc.on('did-start-navigation', (details) => { if (details.isMainFrame && !details.isSameDocument) { const f = find(); if (f) { f.tab.blocked = 0; this.topHost.set(wc.id, hostOf(details.url)); } } });
    wc.on('did-navigate', (_e, url) => { const f = find(); if (f) { f.tab.url = url; this.topHost.set(wc.id, hostOf(url)); this.syncNav(f.tab, wc); this.applyZoom(f.ws, f.tab); this.emit(); } });
    wc.on('did-navigate-in-page', (_e, url, isMain) => { if (isMain) { const f = find(); if (f) { f.tab.url = url; this.syncNav(f.tab, wc); this.emit(); } } });
    wc.on('update-target-url', (_e, url) => this.setHud({ hover: url }));
    wc.on('before-input-event', (e, input) => {
      if (input.type !== 'keyDown') return;
      if (this.handleKey({ key: input.key, ctrl: input.control, meta: input.meta, alt: input.alt, code: input.code, inInput: this.editable.has(wc.id) })) e.preventDefault();
    });
    wc.on('render-process-gone', (_e, d) => { const f = find(); if (f) { f.tab.title = 'Page crashed (' + d.reason + ')'; f.tab.loading = false; this.emit(); } });
    wc.on('context-menu', (_e, params) => { const f = find(); if (f) this.pageMenu(f.ws, f.tab, params); });
    // target=_blank and modifier-clicks: a tab beside this one in the same workspace (and as private as this one).
    wc.setWindowOpenHandler(({ url, disposition }) => {
      const wi = this.ws.findIndex((w) => w.id === ws.id);
      if (wi >= 0 && /^https?:/i.test(url)) this.openLink(url, { ws: wi, private: tab.private, activate: disposition === 'foreground-tab' || disposition === 'default' });
      return { action: 'deny' };
    });
    wc.on('destroyed', () => { this.wcTab.delete(wc.id); this.topHost.delete(wc.id); this.editable.delete(wc.id); });
    this.applyEmulation(wc, ws.env);
    return view;
  }

  private syncNav(tab: Tab, wc: WebContents): void {
    const h = wc.navigationHistory;
    tab.canBack = h.canGoBack();
    tab.canFwd = h.canGoForward();
    tab.history = h.getAllEntries().map((e) => ({ url: e.url, title: e.title || titleFor(e.url) }));
    tab.histPos = h.getActiveIndex();
  }

  /** Right-click inside a page. Native, because nothing in the shell can paint over a live page. */
  private pageMenu(ws: Workspace, tab: Tab, p: Electron.ContextMenuParams): void {
    const wi = this.ws.indexOf(ws);
    const wc = this.wcOf(tab);
    const items: MenuItemConstructorOptions[] = [];
    const link = /^https?:/i.test(p.linkURL) ? p.linkURL : '';
    if (link) {
      items.push({ label: link.length > 60 ? link.slice(0, 57) + '…' : link, enabled: false });
      items.push({ label: 'Open Link', click: () => wc?.loadURL(link) });
      items.push({ label: 'Open Link in New Tab', click: () => this.openLink(link, { ws: wi, private: tab.private, activate: false }) });
      items.push({ label: 'Open Link in New Private Tab', click: () => this.openLink(link, { ws: wi, private: true, activate: false }) });
      const others = this.ws.map((w, i) => ({ w, i })).filter((x) => x.i !== wi);
      if (others.length) items.push({ label: 'Open Link in Workspace', submenu: others.map((x) => ({ label: x.w.name, click: () => this.openLink(link, { ws: x.i, activate: false }) })) });
      items.push({ label: 'Copy Link', click: () => this.copyLink(link) });
      items.push({ type: 'separator' });
    }
    if (p.selectionText.trim()) {
      const q = p.selectionText.trim();
      items.push({ role: 'copy' });
      items.push({ label: 'Search for “' + (q.length > 30 ? q.slice(0, 27) + '…' : q) + '”', click: () => this.openLink(toNavigation(q)!.url, { ws: wi, private: tab.private, activate: true }) });
      items.push({ type: 'separator' });
    }
    if (p.isEditable) { items.push({ role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }, { type: 'separator' }); }
    if (p.mediaType === 'image' && p.srcURL) { items.push({ label: 'Open Image in New Tab', click: () => this.openLink(p.srcURL, { ws: wi, private: tab.private, activate: false }) }, { label: 'Copy Image Address', click: () => this.copyLink(p.srcURL) }, { type: 'separator' }); }
    items.push({ label: 'Back', enabled: tab.canBack, click: () => wc?.navigationHistory.goBack() });
    items.push({ label: 'Forward', enabled: tab.canFwd, click: () => wc?.navigationHistory.goForward() });
    items.push({ label: 'Reload', click: () => wc?.reload() });
    items.push({ type: 'separator' });
    items.push({ label: 'Inspect Element', click: () => wc?.inspectElement(p.x, p.y) });
    const r = this.scaled(this.rect);
    Menu.buildFromTemplate(items).popup({ window: this.win, x: Math.round(r.x + p.x), y: Math.round(r.y + p.y) });
  }

  private copyLink(url: string): void {
    clipboard.writeText(url);
    this.toast('Link copied');
  }

  private applyEmulation(wc: WebContents, env: Env): void {
    try {
      if (!wc.debugger.isAttached()) wc.debugger.attach('1.3');
      wc.debugger.sendCommand('Emulation.setTimezoneOverride', { timezoneId: env.tz }).catch(() => {});
      wc.debugger.sendCommand('Emulation.setLocaleOverride', { locale: env.locale }).catch(() => {});
    } catch (e) {
      console.warn('emulation not applied: ' + (e as Error).message);
    }
  }

  private applyZoom(ws: Workspace, tab: Tab): void {
    const z = this.zoomMem.get(this.zoomKey(ws, tab.url)) ?? 1;
    tab.zoom = z;
    this.wcOf(tab)?.setZoomFactor(z);
  }

  private load(ws: Workspace, tab: Tab): void {
    if (!tab.url) return;
    const view = this.ensureView(ws, tab);
    if (!this.loaded.has(tab.id)) {
      this.loaded.add(tab.id);
      view.webContents.loadURL(tab.url).catch((e: Error) => console.warn('load failed: ' + e.message));
    }
  }

  /** Attach the active tab's view (loading it on first show), hide every other one. */
  private showTab(): void {
    const ws = this.cur();
    const tab = this.tabOf(ws);
    if (tab && tab.url) this.load(ws, tab);
    const active = tab && tab.url ? this.views.get(tab.id) : undefined;
    for (const [id, v] of this.views) {
      if (v === active) continue;
      if (this.win.contentView.children.includes(v)) this.win.contentView.removeChildView(v);
      void id;
    }
    if (active) {
      if (!this.win.contentView.children.includes(active)) this.win.contentView.addChildView(active);
      this.relayout();
    }
    this.win.setTitle((tab?.title ? tab.title + ' — ' : '') + ws.name);
  }

  private relayout(): void {
    const tab = this.tabOf(this.cur());
    const view = tab && tab.url ? this.views.get(tab.id) : undefined;
    const r = this.scaled(this.rect);
    if (view && this.win.contentView.children.includes(view)) {
      view.setBounds({ x: Math.round(r.x), y: Math.round(r.y), width: Math.max(1, Math.round(r.w)), height: Math.max(1, Math.round(r.h)) });
      view.setVisible(!this.overlay);
    }
    if (!this.hud.isDestroyed() && this.hud.isVisible()) placeHud(this.hud, this.win, r);
  }

  private focusPage(): void {
    const tab = this.tabOf(this.cur());
    if (tab && tab.url && !this.overlay) this.wcOf(tab)?.focus();
    else this.win.webContents.focus();
  }

  private destroyTab(tab: Tab): void {
    const view = this.views.get(tab.id);
    if (!view) return;
    if (this.win.contentView.children.includes(view)) this.win.contentView.removeChildView(view);
    view.webContents.close();
    this.views.delete(tab.id);
    this.loaded.delete(tab.id);
    const ps = this.privSessions.get(tab.id);
    if (ps) { this.privSessions.delete(tab.id); ps.wipe().catch(() => {}); }
  }

  private setLeader(on: boolean): void {
    if (this.leader === on) return;
    this.leader = on;
    this.setHud({ leader: on });
    this.emit();
  }

  // ── keys ────────────────────────────────────────────────────────────────

  /** Both the shell and every page route key-downs here. Returns true when the key was consumed. */
  private handleKey(k: { key: string; ctrl: boolean; meta: boolean; alt: boolean; code: string; inInput: boolean }): boolean {
    if (MODIFIER_KEYS.has(k.key)) return this.leader;
    if (!this.leader) {
      const isLeader = (k.ctrl && k.code === 'Space') || (k.key === '`' && !k.inInput && !k.ctrl && !k.meta && !k.alt);
      if (!isLeader) return false;
      this.setLeader(true);
      return true;
    }
    this.setLeader(false);
    if (k.key === 'Escape') return true;
    const a = leaderAction(k.key);
    if (!a) return true;
    if (a.kind === 'ui') this.ui(a.ui);
    else { this.dispatch(a.cmd); if (a.focusPage) this.focusPage(); }
    return true;
  }

  // ── commands ────────────────────────────────────────────────────────────

  dispatch(cmd: Command): void {
    const ws = this.cur();
    switch (cmd.type) {
      case 'selectWs': this.selectWs(cmd.i); break;
      case 'cycleWs': this.selectWs((this.activeWs + cmd.d + this.ws.length) % this.ws.length); break;
      case 'addWs': this.addWs(); break;
      case 'addDisposable': this.addDisposable(); break;
      case 'renameWs': { const w = this.ws[cmd.i]; const name = cmd.name.trim(); if (w && name) { w.name = name; this.showTab(); this.emit(); } break; }
      case 'closeWs': this.requestCloseWs(cmd.i ?? this.activeWs); break;
      case 'setWsColor': if (/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(cmd.hex)) { ws.color = normHex(cmd.hex); this.emit(); } break;
      case 'setWsIcon': ws.icon = cmd.icon; this.emit(); break;
      case 'updateEnv': { const w = cmd.ws === undefined ? ws : this.ws[cmd.ws]; if (w) this.updateEnv(w, { ...w.env, ...cmd.patch }); break; }
      case 'toggleExt': this.updateEnv(ws, { ...ws.env, ext: { ...ws.env.ext, [cmd.name]: !ws.env.ext[cmd.name] } }); break;
      case 'applyCfg': this.applyCfg(cmd.text); break;
      case 'newWsFromCfg': this.newWsFromCfg(cmd.text); break;
      case 'selectTab': this.selectTab(cmd.ws ?? this.activeWs, cmd.j); break;
      case 'cycleTab': this.cycleTab(cmd.d); break;
      case 'newTab': if (cmd.ws !== undefined && cmd.ws !== this.activeWs) this.selectWs(cmd.ws); this.newTab(cmd.url, !!cmd.private); break;
      case 'openLink': this.openLink(cmd.url, { ws: cmd.ws ?? this.activeWs, private: !!cmd.private, activate: false }); break;
      case 'jumpTo': { const wc = this.wcOf(this.tabOf(ws)); if (wc && cmd.p >= 0 && cmd.p < wc.navigationHistory.length()) wc.navigationHistory.goToIndex(cmd.p); break; }
      case 'copyLink': this.copyLink(cmd.url); break;
      case 'closeTab': this.closeTab(cmd.j ?? ws.active, cmd.ws); break;
      case 'reopen': this.reopen(); break;
      case 'togglePin': this.togglePin(cmd.j ?? ws.active); break;
      case 'setTabIcon': { const t = this.tabOf(ws, cmd.j); if (t) { t.icon = cmd.icon; this.emit(); } break; }
      case 'newGroup': this.newGroup(cmd.j ?? ws.active); break;
      case 'renameGroup': { const g = ws.groups.find((x) => x.id === cmd.gid); const name = cmd.name.trim(); if (g && name) g.name = name; if (this.renameGroup === cmd.gid) this.renameGroup = null; this.emit(); break; }
      case 'setTabGroup': { const t = ws.tabs[cmd.j]; if (t) { t.group = cmd.gid; if (cmd.gid) t.pinned = false; this.emit(); } break; }
      case 'updateGroup': { const g = ws.groups.find((x) => x.id === cmd.gid); if (g) Object.assign(g, cmd.patch); if (this.renameGroup === cmd.gid) this.renameGroup = null; this.emit(); break; }
      case 'ungroup': ws.tabs.forEach((t) => { if (t.group === cmd.gid) t.group = null; }); ws.groups = ws.groups.filter((g) => g.id !== cmd.gid); this.emit(); break;
      case 'closeGroup': this.closeGroup(cmd.gid); break;
      case 'toggleActiveGroup': {
        const t = this.tabOf(ws);
        const g = t?.group ? ws.groups.find((x) => x.id === t.group) : undefined;
        if (!g) this.toast('This tab isn’t in a group'); else { g.collapsed = !g.collapsed; this.emit(); }
        break;
      }
      case 'navigate': this.navigate(cmd.raw); break;
      case 'back': { const t = this.tabOf(ws); const wc = this.wcOf(t); if (wc?.navigationHistory.canGoBack()) wc.navigationHistory.goBack(); break; }
      case 'forward': { const t = this.tabOf(ws); const wc = this.wcOf(t); if (wc?.navigationHistory.canGoForward()) wc.navigationHistory.goForward(); break; }
      case 'reload': this.wcOf(this.tabOf(ws))?.reload(); break;
      case 'zoom': this.zoom(cmd.d); break;
      case 'toggleProtection': {
        const t = this.tabOf(ws);
        if (!t || !t.url) break;
        const key = this.allowKey(ws, hostOf(t.url));
        if (this.allow[key]) delete this.allow[key]; else this.allow[key] = true;
        this.emit();
        break;
      }
      case 'clearSiteData': {
        const t = this.tabOf(ws);
        if (!t || !t.url) break;
        const host = hostOf(t.url);
        this.sessionFor(ws).clearSite(host).then(() => { this.toast('Cleared cookies and cache for ' + host + ' in ' + ws.name); this.wcOf(t)?.reload(); });
        break;
      }
      case 'hints': {
        const t = this.tabOf(ws);
        const wc = this.wcOf(t);
        if (t && t.url && wc) { this.setHud({ hinting: true }); wc.send('weft:hints'); wc.focus(); }
        break;
      }
      case 'layout': this.rect = cmd.rect; this.relayout(); break;
      case 'overlay': this.overlay = cmd.on; this.relayout(); if (cmd.on) this.win.webContents.focus(); else this.focusPage(); break;
      case 'focusPage': this.focusPage(); break;
      case 'uiScale': this.uiScale = cmd.v; this.win.webContents.setZoomFactor(cmd.v); this.relayout(); this.emit(); this.toast('Interface size ' + Math.round(cmd.v * 100) + '% · pages keep their own zoom'); break;
      case 'key': this.handleKey(cmd); break;
      case 'toast': this.toast(cmd.text); break;
      case 'openExtensionsDir': shell.openPath(this.p.extensions); break;
      case 'openVpnDir': shell.openPath(this.p.vpnDir); break;
      case 'checkUpdates': this.updater.check(true); break;
      case 'installUpdate': this.flushSave(); this.updater.install(); break;
      case 'installExt': this.installExt(cmd.ref); break;
      case 'pageShot': {
        const wc = this.wcOf(this.tabOf(ws));
        if (!wc || wc.isDestroyed() || this.overlay) { this.send({ type: 'shot', jpeg: null }); break; }
        // JPEG, binary: a PNG data URL of a retina page is tens of MB of base64 and takes longer than the rail transition.
        wc.capturePage().then((img) => this.send({ type: 'shot', jpeg: img.isEmpty() ? null : new Uint8Array(img.toJPEG(78)) })).catch(() => this.send({ type: 'shot', jpeg: null }));
        break;
      }
    }
  }

  private async installExt(ref: string): Promise<void> {
    const ws = this.cur();
    this.send({ type: 'ext', ok: true, text: 'Downloading from the Chrome Web Store…' });
    try {
      const name = await installFromWebStore(ref, this.p.extensions, process.versions.chrome ?? '130.0.0.0');
      this.extensions = listExtensions(this.p);
      this.ws.forEach((w) => { w.env = mkEnv({ ...w.env, ext: { ...w.env.ext, [name]: w.env.ext[name] ?? false } }, this.extensions); });
      ws.env.ext[name] = true;
      this.updateEnv(ws, ws.env);
      this.send({ type: 'ext', ok: true, text: 'Installed ' + name + ' and switched it on in ' + ws.name + '. Electron runs content scripts and background workers; toolbar popups are not supported.' });
    } catch (e) {
      this.send({ type: 'ext', ok: false, text: (e as Error).message });
    }
  }

  private selectWs(i: number): void {
    if (i < 0 || i >= this.ws.length) return;
    this.activeWs = i;
    this.pendingClose = null;
    this.showTab();
    this.emit();
  }

  private selectTab(wi: number, j: number): void {
    const w = this.ws[wi];
    if (!w || !w.tabs[j]) return;
    this.activeWs = wi;
    w.active = j;
    this.showTab();
    this.emit();
  }

  private cycleTab(d: 1 | -1): void {
    const ws = this.cur();
    ws.active = ops.cycledTab(ws, d);
    this.showTab();
    this.emit();
  }

  private addWs(): void {
    const w = newWorkspace('Workspace ' + (this.ws.length + 1), PALETTE[this.ws.length % PALETTE.length]!, mkEnv(null, this.extensions));
    w.tabs.push(newTab());
    this.ws.push(w);
    this.sessionFor(w);
    this.selectWs(this.ws.length - 1);
    this.ui('rename');
  }

  private addDisposable(): void {
    this.disposables += 1;
    const w = newWorkspace('Disposable ' + this.disposables, DISPOSABLE_COLOR, mkEnv({ disposable: true, tz: 'UTC' }, this.extensions));
    w.tabs.push(newTab());
    this.ws.push(w);
    this.sessionFor(w);
    this.selectWs(this.ws.length - 1);
    this.ui('address');
  }

  private requestCloseWs(i: number): void {
    const w = this.ws[i];
    if (!w) return;
    if (this.ws.length <= 1) { this.toast("Can't close the only workspace"); return; }
    if (w.env.disposable || this.pendingClose === w.id) { this.closeWs(i); return; }
    this.pendingClose = w.id;
    this.emit();
    this.toast('Press again to close ' + w.name + ' and its ' + w.tabs.length + ' tabs');
    clearTimeout(this.timers.close);
    this.timers.close = setTimeout(() => { this.pendingClose = null; this.emit(); }, 3000);
  }

  private closeWs(i: number): void {
    const w = this.ws[i];
    if (!w || this.ws.length <= 1) return;
    w.tabs.forEach((t) => this.destroyTab(t));
    const s = this.sessions.get(w.id);
    if (s && w.env.disposable) s.wipe().catch(() => {});
    this.sessions.delete(w.id);
    this.activeWs = ops.removeWorkspace(this.ws, i, this.activeWs) ?? this.activeWs;
    this.closed = this.closed.filter((c) => c.wsId !== w.id);
    this.pendingClose = null;
    this.syncTunnels();
    this.toast(w.env.disposable ? w.name + ' wiped: cookies, history and cache deleted' : 'Closed ' + w.name);
    this.showTab();
    this.emit();
  }

  private updateEnv(ws: Workspace, env: Env): void {
    ws.env = env;
    const s = this.sessionFor(ws);
    s.applyEnv(env).then((warnings) => { if (warnings.length) this.toast(warnings[0]!); });
    this.syncTunnels();
    ws.tabs.forEach((t) => {
      const ps = this.privSessions.get(t.id);
      if (ps) ps.applyEnv({ ...env, ext: {} }).catch(() => {});
      const wc = this.wcOf(t);
      if (wc) this.applyEmulation(wc, env);
    });
    this.emit();
  }

  private applyCfg(text: string): void {
    const ws = this.cur();
    const r = parseEnv(text, this.state().vpnRegions);
    if (!r.ok) { this.send({ type: 'cfg', ok: false, text: r.error }); return; }
    const d = r.data;
    if (d.name) ws.name = d.name;
    ws.color = colorFromFile(d, ws.color);
    ws.icon = cfgIcon(d.icon, ws.icon);
    this.updateEnv(ws, envFromFile(d, ws.env, this.extensions));
    this.showTab();
    this.send({ type: 'cfg', ok: true, text: 'Applied. Open tabs were kept.' });
  }

  private newWsFromCfg(text: string): void {
    const r = parseEnv(text, this.state().vpnRegions);
    if (!r.ok) { this.send({ type: 'cfg', ok: false, text: r.error }); return; }
    const d = r.data;
    const env = envFromFile(d, null, this.extensions);
    const start = d.start && d.start.length ? d.start : [''];
    const pinned = d.pinned ?? [];
    const groups: Array<Group & { urls: string[] }> = Object.keys(d.groups).map((gname, gi) => ({ id: 'g' + Date.now().toString(36) + gi, name: gname, color: GROUP_COLORS[gi % GROUP_COLORS.length]!, collapsed: false, urls: d.groups[gname]! }));
    const tabs = start.map((u) => {
      const nav = u ? toNavigation(u) : null;
      const url = nav ? nav.url : '';
      const g = groups.find((x) => x.urls.includes(u));
      const isPinned = !!u && pinned.includes(u);
      return newTab(url, nav ? nav.title : '', { pinned: isPinned, group: g && !isPinned ? g.id : null });
    });
    const name = (d.name || 'Workspace') + ' (copy)';
    const w = newWorkspace(name, colorFromFile(d, env.disposable ? DISPOSABLE_COLOR : PALETTE[this.ws.length % PALETTE.length]!), env, {
      icon: cfgIcon(d.icon, null), tabs, groups: groups.map(({ urls: _u, ...g }) => g)
    });
    this.ws.push(w);
    this.sessionFor(w);
    this.selectWs(this.ws.length - 1);
    this.send({ type: 'cfg', ok: true, text: 'Created ' + name + ' with ' + tabs.length + ' tabs' });
  }

  private newTab(url?: string, priv = false): void {
    const ws = this.cur();
    const nav = url ? toNavigation(url) : null;
    const t = newTab(nav ? nav.url : '', nav ? nav.title : '', { private: priv });
    ws.tabs.push(t);
    ws.active = ws.tabs.length - 1;
    this.showTab();
    this.emit();
    if (nav) this.focusPage(); else this.ui('address');
  }

  /** A link opened from a page or a menu: next to the opener when it is in the current workspace, else appended there. */
  private openLink(url: string, o: { ws: number; private?: boolean; activate: boolean }): void {
    const ws = this.ws[o.ws];
    if (!ws) return;
    const here = o.ws === this.activeWs;
    const t = ops.linkTab(ws, url, !!o.private, here);
    ops.insertTab(ws, t, { beside: here, activate: o.activate });
    if (o.activate) this.activeWs = o.ws;
    else this.load(ws, t);
    this.showTab();
    this.emit();
    if (o.activate) this.focusPage();
    else this.toast('Opened ' + t.title + ' in ' + (here ? 'a new ' + (o.private ? 'private tab' : 'tab') : ws.name));
  }

  private closeTab(j: number, wi = this.activeWs): void {
    const ws = this.ws[wi];
    const t = ws?.tabs[j];
    if (!ws || !t) return;
    if (ws.env.disposable && ws.tabs.length === 1 && this.ws.length > 1) { this.closeWs(wi); return; }
    this.destroyTab(t);
    ops.removeTab(ws, j);
    this.closed = ops.remember(this.closed, ws, [t]);
    this.showTab();
    this.emit();
  }

  private reopen(): void {
    const r = ops.reopenLast(this.closed, this.ws, this.activeWs);
    if (!r) { this.toast('Nothing to reopen'); return; }
    this.closed = r.closed;
    ops.insertTab(this.ws[r.wi]!, r.tab, { beside: false, activate: true });
    this.activeWs = r.wi;
    this.showTab();
    this.emit();
  }

  private togglePin(j: number): void {
    const ws = this.cur();
    const t = ops.togglePin(ws, j);
    if (!t) return;
    this.toast(t.pinned ? 'Pinned to the left of ' + ws.name + '’s tabs' : 'Unpinned');
    this.emit();
  }

  private newGroup(j: number): void {
    const g = ops.groupWith(this.cur(), j, 'g' + Date.now().toString(36));
    if (!g) return;
    this.renameGroup = g.id;
    this.emit();
  }

  private closeGroup(gid: string): void {
    const ws = this.cur();
    const gone = ops.removeGroup(ws, gid);
    gone.forEach((t) => this.destroyTab(t));
    this.closed = ops.remember(this.closed, ws, gone);
    this.showTab();
    this.emit();
  }

  private navigate(raw: string): void {
    const nav = toNavigation(raw);
    if (!nav) return;
    const ws = this.cur();
    let t = this.tabOf(ws);
    if (!t) { t = newTab(); ws.tabs.push(t); ws.active = ws.tabs.length - 1; }
    t.url = nav.url;
    t.title = nav.title;
    t.favicon = null;
    const view = this.ensureView(ws, t);
    this.loaded.add(t.id);
    view.webContents.loadURL(nav.url).catch((e: Error) => console.warn('load failed: ' + e.message));
    this.showTab();
    this.emit();
    this.focusPage();
  }

  private zoom(d: 1 | -1 | 0): void {
    const ws = this.cur();
    const t = this.tabOf(ws);
    if (!t || !t.url) return;
    const key = this.zoomKey(ws, t.url);
    const next = nextZoom(this.zoomMem.get(key) ?? 1, d);
    this.zoomMem.set(key, next);
    ws.tabs.forEach((x) => { if (this.zoomKey(ws, x.url) === key) { x.zoom = next; this.wcOf(x)?.setZoomFactor(next); } });
    this.toast(hostOf(t.url) + ' at ' + Math.round(next * 100) + '% · sidebar and toolbar unchanged');
    this.emit();
  }
}

export { activeTab, type Icon };
