// One userspace WireGuard tunnel per exit region, each exposed as a local SOCKS5 port that a
// workspace's session points at. No TUN device, no root, no system-wide route: three workspaces
// can sit in three countries at once. The engine is wireproxy (wireguard-go + netstack); a
// workspace whose tunnel is not up fails closed, because its proxy port simply has no listener.
// Node only, so it is testable with a fake engine; the Electron side is in browser.ts.
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { connect, createServer } from 'node:net';
import { join } from 'node:path';
import { parseWgConf, regionOfFile, wireproxyConf, type TunnelStatus } from '../shared/wg';

export interface TunnelsOpts {
  dir: string;
  binary: string | null;
  onStatus: (region: string, status: TunnelStatus) => void;
  log?: (line: string) => void;
}

interface Tunnel { port: number; proc: ChildProcess | null; status: TunnelStatus; restarts: number; timer?: NodeJS.Timeout; wanted: boolean; }

const RETRIES = 5;
const READY_MS = 20_000;

export function findWireproxy(extra: string[] = []): string | null {
  const home = process.env.HOME ?? '';
  const candidates = [...extra, '/opt/homebrew/bin/wireproxy', '/usr/local/bin/wireproxy', join(home, 'go/bin/wireproxy'), join(home, '.local/bin/wireproxy')];
  return candidates.find((p) => p && existsSync(p)) ?? null;
}

export class Tunnels {
  private tunnels = new Map<string, Tunnel>();
  private runDir: string;

  constructor(private o: TunnelsOpts) {
    this.runDir = join(o.dir, '.run');
  }

  hasEngine(): boolean { return !!this.o.binary; }

  /** Regions with a config file: `<dir>/<Region>.conf`. */
  regions(): string[] {
    if (!existsSync(this.o.dir)) return [];
    return readdirSync(this.o.dir).map(regionOfFile).filter((r): r is string => !!r).sort();
  }

  statuses(): Record<string, TunnelStatus> {
    const out: Record<string, TunnelStatus> = {};
    for (const [r, t] of this.tunnels) out[r] = t.status;
    return out;
  }

  /** The proxy rules for a region, or null when it has no config. Allocating the port does not start the tunnel. */
  async endpoint(region: string): Promise<string | null> {
    if (!this.regions().includes(region)) return null;
    const t = await this.slot(region);
    return 'socks5://127.0.0.1:' + t.port;
  }

  /** Start what is wanted, stop what is not. Idempotent; call after any environment change. */
  async sync(wanted: Iterable<string>): Promise<void> {
    const want = new Set(wanted);
    for (const region of want) if (this.regions().includes(region)) { const t = await this.slot(region); t.wanted = true; if (!t.proc) this.start(region, t); }
    for (const [region, t] of this.tunnels) if (!want.has(region) && t.wanted) this.stop(region, t);
  }

  stopAll(): void {
    for (const [region, t] of this.tunnels) this.stop(region, t);
    rmSync(this.runDir, { recursive: true, force: true });
  }

  private async slot(region: string): Promise<Tunnel> {
    let t = this.tunnels.get(region);
    if (!t) {
      t = { port: await freePort(), proc: null, status: { state: 'down', detail: 'not started' }, restarts: 0, wanted: false };
      this.tunnels.set(region, t);
    }
    return t;
  }

  private set(region: string, t: Tunnel, status: TunnelStatus): void {
    t.status = status;
    this.o.onStatus(region, status);
  }

  private start(region: string, t: Tunnel): void {
    if (!this.o.binary) { this.set(region, t, { state: 'down', detail: 'wireproxy is not installed' }); return; }
    const parsed = parseWgConf(readFileSync(join(this.o.dir, region + '.conf'), 'utf8'));
    if (!parsed.ok) { this.set(region, t, { state: 'down', detail: parsed.error }); return; }
    mkdirSync(this.runDir, { recursive: true, mode: 0o700 });
    const conf = join(this.runDir, region + '.wireproxy.conf');
    writeFileSync(conf, wireproxyConf(parsed.conf, t.port), { mode: 0o600 });
    this.set(region, t, { state: 'starting', detail: 'starting tunnel' });
    const proc = spawn(this.o.binary, ['-c', conf], { stdio: ['ignore', 'pipe', 'pipe'] });
    t.proc = proc;
    let tail = '';
    const onOut = (b: Buffer): void => { tail = (tail + b.toString()).slice(-400); this.o.log?.('[' + region + '] ' + b.toString().trim()); };
    proc.stdout?.on('data', onOut);
    proc.stderr?.on('data', onOut);
    proc.on('exit', (code) => {
      if (t.proc !== proc) return;
      t.proc = null;
      rmSync(conf, { force: true });
      if (!t.wanted) { this.set(region, t, { state: 'down', detail: 'stopped' }); return; }
      const why = (tail.trim().split('\n').pop() ?? '').slice(0, 120) || ('exit ' + code);
      if (t.restarts >= RETRIES) { this.set(region, t, { state: 'down', detail: 'gave up: ' + why }); return; }
      t.restarts += 1;
      this.set(region, t, { state: 'starting', detail: 'restarting (' + t.restarts + '/' + RETRIES + '): ' + why });
      t.timer = setTimeout(() => { if (t.wanted && !t.proc) this.start(region, t); }, 1000 * 2 ** (t.restarts - 1));
    });
    waitForPort(t.port, READY_MS).then((up) => {
      if (t.proc !== proc) return;
      if (up) { t.restarts = 0; this.set(region, t, { state: 'up', detail: 'connected' }); }
      else this.set(region, t, { state: 'down', detail: 'tunnel did not come up in ' + READY_MS / 1000 + 's' });
    });
  }

  private stop(region: string, t: Tunnel): void {
    t.wanted = false;
    clearTimeout(t.timer);
    if (t.proc) { const p = t.proc; t.proc = null; p.kill(); }
    this.set(region, t, { state: 'down', detail: 'stopped' });
  }
}

function freePort(): Promise<number> {
  return new Promise((res, rej) => {
    const s = createServer();
    s.once('error', rej);
    s.listen(0, '127.0.0.1', () => { const a = s.address(); s.close(() => res(typeof a === 'object' && a ? a.port : 0)); });
  });
}

function waitForPort(port: number, ms: number): Promise<boolean> {
  const until = Date.now() + ms;
  return new Promise((res) => {
    const probe = (): void => {
      const c = connect({ port, host: '127.0.0.1' });
      c.once('connect', () => { c.destroy(); res(true); });
      c.once('error', () => { c.destroy(); if (Date.now() > until) res(false); else setTimeout(probe, 300); });
    };
    probe();
  });
}
