// One Chromium session per workspace, with the environment applied to it.
import { app, session, type Session } from 'electron';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { hostOf, type Env, type Workspace } from '../shared/model';
import { isThirdParty, isTracker } from '../shared/trackers';

export interface SessionCtx {
  tabPreload: string;
  extensionsDir: string;
  /** Legacy `vpn.toml`: region → proxy endpoint. */
  vpn: Record<string, string>;
  /** A WireGuard tunnel's local SOCKS endpoint for a region, or null when it has no config. */
  tunnel(region: string): Promise<string | null>;
  topHost(wcId: number): string;
  isProtected(wcId: number, topHost: string): boolean;
  onBlocked(wcId: number): void;
}

const TOR = 'socks5://127.0.0.1:9050';

export function partitionFor(ws: Workspace): string {
  return (ws.env.disposable ? '' : 'persist:') + 'ws-' + ws.id;
}

/** A private tab: the workspace's environment on its own in-memory partition, gone when the tab closes. */
export function privatePartition(tabId: string): string {
  return 'private-' + tabId;
}

export function cleanUserAgent(): string {
  return app.userAgentFallback.replace(/ ?Electron\/\S+/, '').replace(/ ?weft-browser\/\S+/i, '');
}

export class WsSession {
  readonly ses: Session;
  readonly partition: string;
  private env: Env;
  private loaded = new Map<string, string>();

  constructor(ws: Workspace, private ctx: SessionCtx, partition = partitionFor(ws)) {
    this.partition = partition;
    this.env = ws.env;
    this.ses = session.fromPartition(this.partition, { cache: partition.startsWith('persist:') });
    this.ses.setUserAgent(cleanUserAgent());
    this.ses.registerPreloadScript({ type: 'frame', filePath: ctx.tabPreload });
    this.ses.setPermissionRequestHandler((_wc, _permission, cb) => cb(false));
    this.installRequestHooks();
  }

  private installRequestHooks(): void {
    const filter = { urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] };
    this.ses.webRequest.onBeforeRequest(filter, (details, cb) => {
      const wcId = details.webContentsId;
      if (wcId === undefined) return cb({});
      const top = this.ctx.topHost(wcId);
      const host = hostOf(details.url);
      if (top && isThirdParty(host, top) && isTracker(host) && this.ctx.isProtected(wcId, top)) {
        this.ctx.onBlocked(wcId);
        return cb({ cancel: true });
      }
      cb({});
    });
    this.ses.webRequest.onBeforeSendHeaders(filter, (details, cb) => {
      const headers = { ...details.requestHeaders, 'Accept-Language': this.env.locale + ',' + this.env.locale.split('-')[0] + ';q=0.9' };
      cb({ requestHeaders: headers });
    });
    this.ses.webRequest.onHeadersReceived(filter, (details, cb) => {
      const wcId = details.webContentsId;
      const top = wcId === undefined ? '' : this.ctx.topHost(wcId);
      if (!top || !isThirdParty(hostOf(details.url), top) || !details.responseHeaders) return cb({});
      const headers: Record<string, string[]> = {};
      for (const [k, v] of Object.entries(details.responseHeaders)) if (k.toLowerCase() !== 'set-cookie') headers[k] = v;
      cb({ responseHeaders: headers });
    });
  }

  /** Apply an environment. Returns human-readable warnings for what could not be applied. */
  async applyEnv(env: Env): Promise<string[]> {
    this.env = env;
    const warnings: string[] = [];
    let rules = '';
    if (env.network === 'tor') rules = TOR;
    else if (env.network === 'proxy') {
      if (env.proxy) rules = env.proxy; else warnings.push('Proxy route chosen but no host:port set — traffic goes direct');
    } else if (env.network === 'vpn') {
      // A tunnel endpoint is handed out before the tunnel is up: until then nothing listens on it
      // and every connection fails. That is the point — a VPN workspace never goes direct by accident.
      const ep = (await this.ctx.tunnel(env.region)) ?? this.ctx.vpn[env.region];
      if (ep) rules = ep; else warnings.push('No WireGuard config for ' + env.region + ' in the vpn folder — traffic goes direct');
    }
    await this.ses.setProxy(rules ? { mode: 'fixed_servers', proxyRules: rules, proxyBypassRules: '<local>' } : { mode: 'direct' });
    this.ses.closeAllConnections().catch(() => {});
    warnings.push(...(await this.syncExtensions(env)));
    return warnings;
  }

  private async syncExtensions(env: Env): Promise<string[]> {
    const warnings: string[] = [];
    for (const [name, on] of Object.entries(env.ext)) {
      const id = this.loaded.get(name);
      if (on && !id) {
        const dir = join(this.ctx.extensionsDir, name);
        if (!existsSync(join(dir, 'manifest.json'))) { warnings.push('Extension "' + name + '" is not in the extensions folder'); continue; }
        try {
          const ext = await this.ses.extensions.loadExtension(dir, { allowFileAccess: false });
          this.loaded.set(name, ext.id);
        } catch (e) {
          warnings.push('Could not load "' + name + '": ' + (e as Error).message);
        }
      } else if (!on && id) {
        this.ses.extensions.removeExtension(id);
        this.loaded.delete(name);
      }
    }
    return warnings;
  }

  async clearSite(host: string): Promise<void> {
    for (const origin of ['https://' + host, 'http://' + host]) await this.ses.clearStorageData({ origin });
    await this.ses.clearCache();
  }

  /** Disposable: wipe everything the partition holds. */
  async wipe(): Promise<void> {
    await this.ses.clearStorageData();
    await this.ses.clearCache();
    await this.ses.clearAuthCache();
  }
}
