import { describe, expect, it } from 'vitest';
import { parseWgConf, regionOfFile, wireproxyConf } from '../src/shared/wg';

const CONF = `# NordLynx export
[Interface]
PrivateKey = aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa=
Address = 10.5.0.2/32
DNS = 103.86.96.100
PostUp = iptables -I OUTPUT ! -o %i -m mark ! --mark $(wg show %i fwmark) -j REJECT

[Peer]
PublicKey = bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb=
AllowedIPs = 0.0.0.0/0, ::/0
Endpoint = 192.0.2.10:51820  ; the exit
PersistentKeepalive = 25
`;

describe('WireGuard configs', () => {
  it('parses a provider export, ignoring comments and case', () => {
    const r = parseWgConf(CONF);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.conf.iface.address).toBe('10.5.0.2/32');
    expect(r.conf.peers[0]!.endpoint).toBe('192.0.2.10:51820');
    expect(r.conf.peers[0]!.allowedips).toBe('0.0.0.0/0, ::/0');
  });
  it('names what is missing', () => {
    expect(parseWgConf('[Interface]\nAddress = 10.0.0.2/32\n[Peer]\nPublicKey = x\nEndpoint = y')).toMatchObject({ ok: false, error: expect.stringContaining('PrivateKey') });
    expect(parseWgConf('[Interface]\nPrivateKey = k\nAddress = a\n')).toMatchObject({ ok: false, error: expect.stringContaining('[Peer]') });
    expect(parseWgConf('<html>')).toMatchObject({ ok: false, error: expect.stringContaining('not a WireGuard config') });
    expect(parseWgConf('PrivateKey = k')).toMatchObject({ ok: false });
  });
  it('turns a config into a wireproxy one on a local SOCKS port, without wg-quick-only keys', () => {
    const r = parseWgConf(CONF);
    if (!r.ok) throw new Error(r.error);
    const out = wireproxyConf(r.conf, 40123);
    expect(out).toContain('[Socks5]\nBindAddress = 127.0.0.1:40123');
    expect(out).toContain('PrivateKey = aaaa');
    expect(out).toContain('Endpoint = 192.0.2.10:51820');
    expect(out).toContain('PersistentKeepalive = 25');
    expect(out).not.toContain('PostUp');
    expect(out).not.toContain('iptables');
  });
  it('keeps every peer and adds keepalive when a peer has none', () => {
    const r = parseWgConf('[Interface]\nPrivateKey = k\nAddress = a\n[Peer]\nPublicKey = p\nEndpoint = e\n[Peer]\nPublicKey = q\nEndpoint = f\n');
    if (!r.ok) throw new Error(r.error);
    const out = wireproxyConf(r.conf, 1);
    expect(out.match(/\[Peer\]/g)).toHaveLength(2);
    expect(out.match(/PersistentKeepalive = 25/g)).toHaveLength(2);
  });
  it('maps file names to regions', () => {
    expect(regionOfFile('Zurich, CH.conf')).toBe('Zurich, CH');
    expect(regionOfFile('seattle.CONF')).toBe('seattle');
    expect(regionOfFile('notes.txt')).toBeNull();
  });
});
