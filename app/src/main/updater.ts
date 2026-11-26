// Self-update. The engine is electron-updater's autoUpdater in a packaged build and null in dev;
// it is injected so the state machine is testable without Electron. The feed is a static file on
// the updates bucket (weft-browser-cdk): checking sends nothing but the request itself.
import type { UpdateState } from '../shared/model';

/** The slice of electron-updater's autoUpdater this module uses. */
export interface UpdateEngine {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  on(event: string, cb: (...args: any[]) => void): unknown;
  checkForUpdates(): Promise<unknown>;
  quitAndInstall(): void;
}

export interface UpdaterOpts {
  engine: UpdateEngine | null;
  current: string;
  /** Called on every change; `note` is set when the person should be told (a toast). */
  onChange: (s: UpdateState, note: string) => void;
  everyMs?: number;
  log?: (line: string) => void;
}

export const CHECK_EVERY_MS = 4 * 60 * 60 * 1000;

export class Updater {
  private s: UpdateState;
  private manual = false;
  private timer?: NodeJS.Timeout;

  constructor(private o: UpdaterOpts) {
    this.s = { phase: o.engine ? 'idle' : 'off', current: o.current, version: '', percent: 0, detail: '' };
  }

  state(): UpdateState { return this.s; }

  start(): void {
    const e = this.o.engine;
    if (!e) return;
    // Download in the background; install on the next quit, or now if the person asks.
    e.autoDownload = true;
    e.autoInstallOnAppQuit = true;
    e.on('checking-for-update', () => this.set({ phase: 'checking', detail: '' }));
    e.on('update-not-available', () => this.set({ phase: 'idle' }, this.manual ? 'Weft ' + this.o.current + ' is up to date' : ''));
    e.on('update-available', (info: { version?: string }) => this.set({ phase: 'downloading', version: info?.version ?? '', percent: 0 }, this.manual ? 'Downloading Weft ' + (info?.version ?? '') : ''));
    e.on('download-progress', (p: { percent?: number }) => this.set({ phase: 'downloading', percent: Math.round(p?.percent ?? 0) }));
    e.on('update-downloaded', (info: { version?: string }) => this.set({ phase: 'ready', version: info?.version ?? this.s.version, percent: 100 }, 'Weft ' + (info?.version ?? '') + ' is ready. Restart to update (palette)'));
    e.on('error', (err: Error) => {
      // Offline is normal for a background check; only a check the person asked for says so.
      this.o.log?.('update: ' + (err?.message ?? String(err)));
      this.set({ phase: this.s.phase === 'ready' ? 'ready' : 'error', detail: err?.message ?? String(err) }, this.manual ? 'Update check failed' : '');
    });
    this.check(false);
    this.timer = setInterval(() => this.check(false), this.o.everyMs ?? CHECK_EVERY_MS);
    this.timer.unref?.();
  }

  check(manual: boolean): void {
    const e = this.o.engine;
    if (!e) { if (manual) this.o.onChange(this.s, 'This build does not update itself'); return; }
    if (this.s.phase === 'ready') { if (manual) this.o.onChange(this.s, 'Weft ' + this.s.version + ' is ready. Restart to update'); return; }
    if (this.s.phase === 'checking' || this.s.phase === 'downloading') return;
    this.manual = manual;
    e.checkForUpdates().catch(() => { /* reported through the 'error' event */ });
  }

  install(): void {
    if (this.s.phase === 'ready') this.o.engine?.quitAndInstall();
  }

  stop(): void { clearInterval(this.timer); }

  private set(p: Partial<UpdateState>, note = ''): void {
    this.s = { ...this.s, ...p };
    // A check the person asked for stays theirs until it settles.
    this.manual = this.manual && (this.s.phase === 'checking' || this.s.phase === 'downloading');
    this.o.onChange(this.s, note);
  }
}
