// WireGuard configs as the provider-agnostic VPN contract: one wg-quick style `.conf` per exit
// region, from any provider (NordVPN, Mullvad, Proton, a home box…). The pure half: parsing and
// the wireproxy config that turns a tunnel into a local SOCKS5 endpoint one workspace can use.

export interface WgConf {
  iface: Record<string, string>;
  peers: Array<Record<string, string>>;
}

/** Strict enough to catch a pasted web page, loose enough for every provider's export. */
export function parseWgConf(text: string): { ok: true; conf: WgConf } | { ok: false; error: string } {
  const conf: WgConf = { iface: {}, peers: [] };
  let cur: Record<string, string> | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/[#;].*$/, '').trim();
    if (!line) continue;
    const sec = /^\[(\w+)\]$/.exec(line);
    if (sec) {
      const name = sec[1]!.toLowerCase();
      if (name === 'interface') cur = conf.iface;
      else if (name === 'peer') { cur = {}; conf.peers.push(cur); }
      else cur = null;
      continue;
    }
    const kv = /^([A-Za-z]+)\s*=\s*(.+)$/.exec(line);
    if (!kv || !cur) return { ok: false, error: 'not a WireGuard config: "' + raw.trim().slice(0, 40) + '"' };
    cur[kv[1]!.toLowerCase()] = kv[2]!.trim();
  }
  if (!conf.iface.privatekey) return { ok: false, error: '[Interface] has no PrivateKey' };
  if (!conf.iface.address) return { ok: false, error: '[Interface] has no Address' };
  const peer = conf.peers[0];
  if (!peer) return { ok: false, error: 'no [Peer] section' };
  if (!peer.publickey) return { ok: false, error: '[Peer] has no PublicKey' };
  if (!peer.endpoint) return { ok: false, error: '[Peer] has no Endpoint' };
  return { ok: true, conf };
}

/** The region a file stands for: `Zurich, CH.conf` → `Zurich, CH`. */
export function regionOfFile(file: string): string | null {
  const m = /^(.+)\.conf$/i.exec(file);
  return m ? m[1]!.trim() : null;
}

/** wireproxy reads wg-quick keys plus a [Socks5] section; wg-quick-only keys it rejects are dropped. */
export function wireproxyConf(conf: WgConf, port: number): string {
  const drop = new Set(['table', 'fwmark', 'saveconfig', 'preup', 'postup', 'predown', 'postdown']);
  const section = (name: string, kv: Record<string, string>): string =>
    '[' + name + ']\n' + Object.entries(kv).filter(([k]) => !drop.has(k)).map(([k, v]) => KEYS[k] + ' = ' + v).join('\n') + '\n';
  const peers = conf.peers.map((p) => section('Peer', { persistentkeepalive: '25', ...p })).join('\n');
  return section('Interface', conf.iface) + '\n' + peers + '\n[Socks5]\nBindAddress = 127.0.0.1:' + port + '\n';
}

const KEYS: Record<string, string> = {
  privatekey: 'PrivateKey', address: 'Address', dns: 'DNS', mtu: 'MTU', listenport: 'ListenPort',
  publickey: 'PublicKey', presharedkey: 'PresharedKey', endpoint: 'Endpoint', allowedips: 'AllowedIPs', persistentkeepalive: 'PersistentKeepalive'
};

export type TunnelState = 'starting' | 'up' | 'down';
export interface TunnelStatus { state: TunnelState; detail: string; }
