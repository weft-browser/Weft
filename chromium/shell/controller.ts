// The controller: it owns the model
// in the shell process and drives pages through the engine (engine.ts) instead of Electron's
// WebContentsView and session. The pure half (model, ops, env files, keys) is the app's, imported
// by path and unchanged. What Electron had and the fork does not yet: sessions per workspace
// tunnels, extensions, the HUD window, link hints, persistence, timezone emulation; each says so
// where it is reached, so the shell never claims more than the engine enforces.
import type { Command, Event, HudState, WeftApi } from '../../shell/src/shared/ipc';
import { MODIFIER_KEYS, leaderAction, type UiAction } from '../../shell/src/shared/keys';
import {
  DEFAULT_REGIONS, DISPOSABLE_COLOR, GROUP_COLORS, PALETTE, hostOf, mkEnv, newTab, newWorkspace, nextZoom, normHex, slug, titleFor, toNavigation,
  type BrowserState, type ClosedTab, type Env, type Group, type Tab, type Workspace
} from '../../shell/src/shared/model';
import { cfgIcon, colorFromFile, envFromFile, parse as parseEnv, serialize } from '../../shell/src/shared/envfile';
import { decodeSnapshot, encodeSnapshot } from '../../shell/src/shared/snapshot';
import * as ops from '../../shell/src/shared/ops';
import * as triage from '../../shell/src/shared/triage';
import { engine, type PageEvent, type PageMode } from './engine';
import { TRACKER_HOSTS } from '../../shell/src/shared/trackers';

const NOT_YET = ' is not in the fork yet';
const TOR = 'socks5://127.0.0.1:9050';

interface Page { embed: HTMLEmbedElement; ready: boolean; }

export class Controller {
  private ws: Workspace[] = [];
  private activeWs = 0;
  private closed: ClosedTab[] = [];
  private allow: Record<string, boolean> = {};
  private leader = false;
  private pendingClose: string | null = null;
  private renameGroup: string | null = null;
  private extensions: string[] = [];
  private uiScale = 1;
  private disposables = 0;
  private version = '';
  private dataDir = '';
  private hudState: HudState = { leader: false, toast: '', hover: '', hinting: false };
  private pages = new Map<string, Page>();
  private zoomMem = new Map<string, number>();
  private envFiles = new Map<string, { file: string; text: string }>();
  /** The tab in front and since when, while the window is visible (triage time-in-front). */
  private front: { tabId: string; since: number } | null = null;
  private listeners = new Set<(e: Event) => void>();
  private timers: { emit?: number; close?: number; toast?: number; save?: number } = {};
  private booted!: () => void;
  private ready = new Promise<void>((res) => { this.booted = res; });

  readonly api: WeftApi = {
    /** The first state the shell sees is the booted one: never an empty workspace list. */
    getState: () => this.ready.then(() => this.state()),
    send: (cmd) => this.dispatch(cmd),
    on: (cb) => { this.listeners.add(cb); return () => { this.listeners.delete(cb); }; }
  };

  // ── boot ────────────────────────────────────────────────────────────────

  async start(): Promise<void> {
    const boot = await engine.boot();
    this.version = boot.version;
    this.dataDir = boot.dataDir;
    engine.onPage((e) => this.onPage(e));
    this.extensions = (await engine.listExtensions()).names;
    // state.json, the same contract as the Electron app's (snapshot.ts). A file that does not parse
    // is logged and left alone, never silently dropped.
    const raw = (await engine.readFile('state.json')).text;
    if (raw !== null) {
      try {
        const d = decodeSnapshot(JSON.parse(raw), this.extensions);
        d.warnings.forEach((w) => console.warn('state.json: ' + w));
        this.ws = d.workspaces;
        this.activeWs = d.activeWs;
        this.closed = d.closed;
        this.allow = d.allow;
      } catch (e) {
        console.error('state.json could not be parsed: ' + (e as Error).message);
      }
    }
    if (!this.ws.length) {
      const w = newWorkspace('Workspace 1', PALETTE[0]!, mkEnv(null, this.extensions));
      w.tabs.push(newTab());
      this.ws = [w];
      this.activeWs = 0;
    }
    // chrome://weft?page=<url>: a tab with it in the active workspace (drive.mjs, smoke.sh). A URL
    // with a scheme is taken as is: toNavigation() is for what people type.
    const first = new URLSearchParams(location.search).get('page');
    const nav = !first ? null : /^[a-z][a-z0-9+.-]*:/i.test(first) ? { url: first, title: titleFor(first) } : toNavigation(first);
    if (nav) {
      const ws = this.cur();
      const t = this.tabOf(ws);
      if (t && !t.url) { t.url = nav.url; t.title = nav.title; } else { ws.tabs.push(newTab(nav.url, nav.title)); ws.active = ws.tabs.length - 1; }
    }
    this.booted();
    engine.setTrackers([...TRACKER_HOSTS]);
    engine.setAllow(Object.keys(this.allow));
    this.ws.forEach((x) => this.sessionFor(x));
    window.addEventListener('pagehide', () => this.flushSave());
    // Time in front counts while the window is visible. Not yet: window focus, sleep and lock (the
    // engine does not report them), sound, and typed text; triage.ts caps a stretch at 30 minutes.
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') this.startFront(); else this.endFront(); });
    this.showTab();
    this.emit();
  }

  // ── persistence ─────────────────────────────────────────────────────────

  private scheduleSave(): void {
    window.clearTimeout(this.timers.save);
    this.timers.save = window.setTimeout(() => this.flushSave(), 400);
  }

  /** state.json and one <slug>.env.toml per workspace under workspaces/, as store.ts + browser.ts do. */
  private flushSave(): void {
    window.clearTimeout(this.timers.save);
    if (this.front) this.startFront();   // bank the running stretch, keep counting
    engine.writeFile('state.json', JSON.stringify(encodeSnapshot(this.ws, this.activeWs, this.closed, this.allow), null, 2));
    const live = new Set<string>();
    for (const w of this.ws) {
      if (w.env.disposable) continue;
      live.add(w.id);
      const file = slug(w.name) + '.env.toml';
      const text = serialize(w);
      const prev = this.envFiles.get(w.id);
      if (prev && prev.file !== file) engine.removeFile('workspaces/' + prev.file);
      if (!prev || prev.file !== file || prev.text !== text) {
        engine.writeFile('workspaces/' + file, text);
        this.envFiles.set(w.id, { file, text });
      }
    }
    for (const [id, f] of this.envFiles) if (!live.has(id)) { engine.removeFile('workspaces/' + f.file); this.envFiles.delete(id); }
  }

  /** A workspace's profile, with its environment applied (sessions.ts in Electron). Returns what could not be applied. */
  private sessionFor(ws: Workspace): string[] {
    const env = ws.env;
    const warnings: string[] = [];
    let rules = '';
    if (env.network === 'tor') rules = TOR;
    else if (env.network === 'proxy') {
      if (env.proxy) rules = env.proxy; else warnings.push('Proxy route chosen but no host:port set — traffic goes direct');
    } else if (env.network === 'vpn') {
      warnings.push('VPN tunnels' + NOT_YET + ' — traffic goes direct');
    }
    if (env.disposable && Object.values(env.ext).some(Boolean)) warnings.push('Extensions stay off in disposable workspaces' + NOT_YET.replace(' is', ':') + ' they share one in-memory profile');
    engine.setEnv(ws.id, env.disposable, { rules, locale: env.locale, tz: env.tz, ext: env.ext });
    return warnings;
  }

  state(): BrowserState {
    return {
      workspaces: this.ws, activeWs: this.activeWs, closed: this.closed, leader: this.leader, pendingCloseWs: this.pendingClose,
      extensions: this.extensions, vpnRegions: DEFAULT_REGIONS, vpnConfigured: [], vpnStatus: {}, vpnEngine: false, vpnDir: '', allow: this.allow,
      renameGroup: this.renameGroup, uiScale: this.uiScale, dataDir: this.dataDir,
      update: { phase: 'off', current: this.version, version: '', percent: 0, detail: '' }
    };
  }

  private emit(): void {
    if (this.timers.emit) return;
    this.timers.emit = window.setTimeout(() => { this.timers.emit = undefined; this.send({ type: 'state', state: this.state() }); this.scheduleSave(); }, 0);
  }

  private send(e: Event): void { this.listeners.forEach((cb) => cb(e)); }

  /** Queued behind any pending state emit; keyboard focus moves to the shell first, as in Electron. */
  private ui(action: UiAction): void {
    this.focusShell();
    window.setTimeout(() => this.send({ type: 'ui', action }), 0);
  }

  private toast(text: string): void {
    this.setHud({ toast: text });
    window.clearTimeout(this.timers.toast);
    this.timers.toast = window.setTimeout(() => this.setHud({ toast: '' }), 2600);
  }

  /** The HUD window is Electron's; here its state goes out as an event for the shell to paint (Phase 3). */
  private setHud(patch: Partial<HudState>): void {
    this.hudState = { ...this.hudState, ...patch };
    if (patch.toast) console.log('weft toast: ' + patch.toast);
    this.send({ type: 'hud', hud: this.hudState });
  }

  // ── helpers ─────────────────────────────────────────────────────────────

  private findTab(id: string): Tab | null {
    for (const w of this.ws) { const t = w.tabs.find((x) => x.id === id); if (t) return t; }
    return null;
  }
  private endFront(): void {
    if (!this.front) return;
    const t = this.findTab(this.front.tabId);
    if (t) triage.endStretch(t, this.front.since, Date.now());
    this.front = null;
  }
  private startFront(): void {
    this.endFront();
    if (document.visibilityState !== 'visible') return;
    const t = this.ws.length ? this.tabOf(this.cur()) : null;
    if (!t) return;
    const now = Date.now();
    t.lastActive = now;
    this.front = { tabId: t.id, since: now };
  }
  private cur(): Workspace { return this.ws[this.activeWs]!; }   // undefined before boot: dispatch() checks
  private tabOf(ws: Workspace, j?: number): Tab | null { return ws.tabs[j ?? ws.active] ?? null; }
  private allowKey(ws: Workspace, host: string): string { return ws.id + '|' + host; }
  private zoomKey(ws: Workspace, url: string): string { return ws.id + '|' + hostOf(url); }
  private find(tabId: string): { ws: Workspace; tab: Tab; wi: number } | null {
    for (let wi = 0; wi < this.ws.length; wi++) {
      const tab = this.ws[wi]!.tabs.find((t) => t.id === tabId);
      if (tab) return { ws: this.ws[wi]!, tab, wi };
    }
    return null;
  }
  private pageArea(): HTMLElement | null { return document.querySelector<HTMLElement>('main.page'); }
  /** The shell's page area, once React has rendered it (the first page is created before that). */
  private whenPageArea(): Promise<HTMLElement> {
    return new Promise((res) => {
      const now = this.pageArea();
      if (now) { res(now); return; }
      const mo = new MutationObserver(() => { const el = this.pageArea(); if (el) { mo.disconnect(); res(el); } });
      mo.observe(document.documentElement, { childList: true, subtree: true });
    });
  }
  private focusShell(): void { document.querySelector<HTMLElement>('.shell')?.focus(); }

  // ── pages ───────────────────────────────────────────────────────────────

  /** The page for a tab, created on first use: an embed in the page area painting a WebContents the engine
   *  owns, in the workspace's profile (or a private tab's own in-memory one). */
  private ensurePage(ws: Workspace, tab: Tab): Page {
    let page = this.pages.get(tab.id);
    if (page) return page;
    const embed = document.createElement('embed');
    embed.type = 'application/x-chromium-surface-embed';
    embed.className = 'page-embed';
    embed.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:0;visibility:hidden;';
    page = { embed, ready: false };
    this.pages.set(tab.id, page);
    const mode: PageMode = ws.env.disposable ? 'disposable' : tab.private ? 'private' : 'persist';
    void engine.createPage(tab.id, tab.url, ws.id, mode).then(async ({ contentId, error }) => {
      if (this.pages.get(tab.id) !== page) return;
      if (!contentId) { this.pages.delete(tab.id); this.toast(error ?? 'The page could not be created'); return; }
      const area = await this.whenPageArea();
      if (this.pages.get(tab.id) !== page) return;
      embed.dataset['contentId'] = contentId;
      page!.ready = true;
      area.appendChild(embed);
      this.showTab();
    });
    return page;
  }

  private load(ws: Workspace, tab: Tab): void { if (tab.url) this.ensurePage(ws, tab); }

  /** Show the active tab's page (loading it on first show), hide every other one. */
  private showTab(): void {
    const ws = this.cur();
    const tab = this.tabOf(ws);
    if (tab && tab.url) this.load(ws, tab);
    const active = tab && tab.url ? this.pages.get(tab.id) : undefined;
    const area = this.pageArea();
    for (const p of this.pages.values()) {
      if (p.ready && !p.embed.isConnected && area) area.appendChild(p.embed);
      const on = p === active;
      p.embed.style.visibility = on ? 'visible' : 'hidden';
      p.embed.style.zIndex = on ? '1' : '0';
      p.embed.style.pointerEvents = on ? 'auto' : 'none';
    }
    document.title = (tab?.title ? tab.title + ' — ' : '') + ws.name;
    if (this.front?.tabId !== tab?.id) this.startFront();
  }

  private focusPage(): void {
    const tab = this.tabOf(this.cur());
    const page = tab && tab.url ? this.pages.get(tab.id) : undefined;
    if (page?.ready) { page.embed.focus(); engine.page(tab!.id, 'focus'); } else this.focusShell();
  }

  private destroyTab(tab: Tab): void {
    const page = this.pages.get(tab.id);
    if (!page) return;
    page.embed.remove();
    this.pages.delete(tab.id);
    engine.page(tab.id, 'destroy');
  }

  private onPage(e: PageEvent): void {
    if (e.type === 'warn') { this.toast(e.text); return; }
    const f = this.find(e.id);
    if (!f) return;
    const { ws, tab, wi } = f;
    switch (e.type) {
      case 'page':
        if (e.navigated) tab.blocked = 0;   // a new document: the count starts over, as on did-start-navigation
        tab.url = e.url || tab.url;
        tab.title = e.title || titleFor(tab.url);
        tab.loading = e.loading;
        tab.canBack = e.canBack;
        tab.canFwd = e.canFwd;
        // A WebUI document cannot fetch the web itself (the WebUI loader kills the renderer for a
        // non-chrome:// request); chrome://image fetches and re-encodes the icon for it. A data:
        // icon is used as is: handed to chrome://image it would reach the network service, which
        // treats a data: fetch as a bad message and dies.
        tab.favicon = !e.favicon ? null : /^data:/i.test(e.favicon) ? e.favicon : /^https?:/i.test(e.favicon) ? 'chrome://image/?url=' + encodeURIComponent(e.favicon) : null;
        tab.history = e.history.map((h) => ({ url: h.url, title: h.title || titleFor(h.url) }));
        tab.histPos = e.histPos;
        this.applyZoom(ws, tab);
        if (ws === this.cur() && tab === this.tabOf(ws)) document.title = (tab.title ? tab.title + ' — ' : '') + ws.name;
        this.emit();
        break;
      case 'crashed': tab.title = 'Page crashed'; tab.loading = false; this.emit(); break;
      case 'hover': this.setHud({ hover: e.url }); break;
      case 'openLink': this.openLink(e.url, { ws: wi, private: tab.private, activate: e.activate }); break;
      case 'key': this.handleKey(e); break;
      case 'blocked': tab.blocked += 1; this.emit(); break;
    }
  }

  private applyZoom(ws: Workspace, tab: Tab): void {
    const z = this.zoomMem.get(this.zoomKey(ws, tab.url)) ?? 1;
    if (tab.zoom !== z) { tab.zoom = z; engine.page(tab.id, 'zoom', z); }
  }

  private setLeader(on: boolean): void {
    if (this.leader === on) return;
    this.leader = on;
    engine.setLeader(on);
    this.setHud({ leader: on });
    this.emit();
  }

  // ── keys ────────────────────────────────────────────────────────────────

  /** The shell routes key-downs here (pages will, through the engine, in Phase 3). Returns true when consumed. */
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
    if (!ws) return;   // the shell mounts before boot finishes and sends layout/overlay at once; nothing to do yet
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
      case 'jumpTo': { const t = this.tabOf(ws); if (t && cmd.p >= 0 && cmd.p < t.history.length) engine.page(t.id, 'goToIndex', cmd.p); break; }
      case 'copyLink': this.copyLink(cmd.url); break;
      case 'closeTab': this.closeTab(cmd.j ?? ws.active, cmd.ws); break;
      case 'closeTabs': this.closeTabs(cmd.ids, cmd.ws ?? this.activeWs); break;
      case 'sortTabs': this.endFront(); triage.sortByImportance(ws, Date.now()); this.startFront(); this.showTab(); this.emit(); this.toast('Sorted ' + ws.name + ' by importance · pins stay where you put them'); break;
      case 'savePage': this.toast('Save page as text' + NOT_YET); break;
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
      case 'back': { const t = this.tabOf(ws); if (t?.canBack) engine.page(t.id, 'back'); break; }
      case 'forward': { const t = this.tabOf(ws); if (t?.canFwd) engine.page(t.id, 'forward'); break; }
      case 'reload': { const t = this.tabOf(ws); if (t && this.pages.has(t.id)) engine.page(t.id, 'reload'); break; }
      case 'zoom': this.zoom(cmd.d); break;
      case 'toggleProtection': {
        const t = this.tabOf(ws);
        if (!t || !t.url) break;
        const key = this.allowKey(ws, hostOf(t.url));
        if (this.allow[key]) delete this.allow[key]; else this.allow[key] = true;
        engine.setAllow(Object.keys(this.allow));
        this.emit();
        break;
      }
      case 'clearSiteData': {
        const t = this.tabOf(ws);
        if (!t || !t.url) break;
        const host = hostOf(t.url);
        void engine.clearSite(ws.id, host).then(() => {
          this.toast('Cleared cookies and cache for ' + host + ' in ' + ws.name);
          if (this.pages.has(t.id)) engine.page(t.id, 'reload');
        });
        break;
      }
      case 'hints': this.toast('Link hints' + (NOT_YET)); break;
      case 'layout': break;   // the page is an element of this document; nothing to place
      case 'overlay': if (!cmd.on) this.focusPage(); break;   // the shell paints over the embed on its own
      case 'focusPage': this.focusPage(); break;
      case 'uiScale': this.uiScale = cmd.v; (document.documentElement.style as unknown as { zoom: string }).zoom = String(cmd.v); this.emit(); this.toast('Interface size ' + Math.round(cmd.v * 100) + '% · pages keep their own zoom'); break;
      case 'key': this.handleKey(cmd); break;
      case 'toast': this.toast(cmd.text); break;
      case 'openExtensionsDir': this.toast('Unpacked extensions go in ' + this.dataDir + '/extensions/<name>'); break;
      case 'openVpnDir': this.toast('VPN tunnels' + NOT_YET); break;
      case 'checkUpdates': this.toast('This build does not update itself'); break;
      case 'installUpdate': break;
      case 'installExt': this.send({ type: 'ext', ok: false, text: 'Web Store installs' + NOT_YET }); break;
      case 'pageShot': this.send({ type: 'shot', jpeg: null }); break;   // no still needed: the rail paints over the embed
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
    window.clearTimeout(this.timers.close);
    this.timers.close = window.setTimeout(() => { this.pendingClose = null; this.emit(); }, 3000);
  }

  private closeWs(i: number): void {
    const w = this.ws[i];
    if (!w || this.ws.length <= 1) return;
    w.tabs.forEach((t) => this.destroyTab(t));
    engine.wipe(w.id);
    this.activeWs = ops.removeWorkspace(this.ws, i, this.activeWs) ?? this.activeWs;
    this.closed = this.closed.filter((c) => c.wsId !== w.id);
    this.pendingClose = null;
    this.toast(w.env.disposable ? w.name + ' wiped: cookies, history and cache deleted' : 'Closed ' + w.name);
    this.showTab();
    this.emit();
  }

  /** Applied to the workspace's profile and pages: route, locale, timezone; extensions not yet, and the toast says so. */
  private updateEnv(ws: Workspace, env: Env): void {
    const was = ws.env;
    ws.env = env;
    const warnings = this.sessionFor(ws);
    // Honest about the state of extensions in the fork: loaded into the workspace's profile,
    // switched on and off there, but their content scripts do not reach pages yet (plan.md).
    if (!env.disposable && Object.keys(env.ext).some((k) => env.ext[k] !== was.ext[k])) warnings.push('Extension switched in this workspace; its content scripts do not reach pages yet in the fork');
    if (warnings.length) this.toast(warnings[0]!);
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

  private closeTabs(ids: string[], wi: number): void {
    const ws = this.ws[wi];
    if (!ws) return;
    let n = 0;
    for (const id of ids) {
      if (this.ws[wi] !== ws) break;   // a disposable workspace closed with its last tab
      const j = ws.tabs.findIndex((t) => t.id === id);
      if (j < 0) continue;
      this.closeTab(j, wi);
      n += 1;
    }
    if (n) this.toast('Closed ' + n + (n === 1 ? ' tab' : ' tabs') + ' · ` u reopens');
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
    if (this.pages.has(t.id)) engine.page(t.id, 'navigate', nav.url); else this.ensurePage(ws, t);
    this.showTab();
    this.emit();
    this.focusPage();
  }

  private copyLink(url: string): void {
    void navigator.clipboard.writeText(url).then(() => this.toast('Link copied'), () => this.toast('Could not copy the link'));
  }

  private zoom(d: 1 | -1 | 0): void {
    const ws = this.cur();
    const t = this.tabOf(ws);
    if (!t || !t.url) return;
    const key = this.zoomKey(ws, t.url);
    const next = nextZoom(this.zoomMem.get(key) ?? 1, d);
    this.zoomMem.set(key, next);
    ws.tabs.forEach((x) => { if (this.zoomKey(ws, x.url) === key) { x.zoom = next; if (this.pages.has(x.id)) engine.page(x.id, 'zoom', next); } });
    this.toast(hostOf(t.url) + ' at ' + Math.round(next * 100) + '% · sidebar and toolbar unchanged');
    this.emit();
  }
}
