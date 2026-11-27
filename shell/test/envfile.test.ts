import { describe, expect, it } from 'vitest';
import { envFromFile, parse, serialize } from '../src/shared/envfile';
import { mkEnv, newTab, newWorkspace } from '../src/shared/model';

const EXT = ['1Password', 'uBlock Origin Lite'];

function sample() {
  const w = newWorkspace('Acme Rentals', '#f0a35e', mkEnv({ network: 'vpn', region: 'Seattle, US', ext: { '1Password': true } }, EXT), { icon: { kind: 'svg', id: 'home' } });
  w.groups.push({ id: 'g1', name: 'Smart locks', color: '#5fd3e0', collapsed: false });
  w.tabs.push(newTab('https://my.hospitable.com/inbox', 'Inbox', { pinned: true }));
  w.tabs.push(newTab('https://schlage.com/encode', 'Schlage', { group: 'g1' }));
  w.tabs.push(newTab('https://yale.com/assure', 'Yale', { group: 'g1' }));
  w.tabs.push(newTab());
  return w;
}

describe('env file', () => {
  it('round-trips through serialize and parse', () => {
    const text = serialize(sample());
    const r = parse(text);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.name).toBe('Acme Rentals');
    expect(r.data.color).toBe('#f0a35e');
    expect(r.data.icon).toBe('home');
    expect(r.data.network).toBe('vpn');
    expect(r.data.start).toEqual(['https://my.hospitable.com/inbox', 'https://schlage.com/encode', 'https://yale.com/assure']);
    expect(r.data.pinned).toEqual(['https://my.hospitable.com/inbox']);
    expect(r.data.ext).toEqual({ '1Password': true, 'uBlock Origin Lite': false });
    expect(r.data.groups).toEqual({ 'Smart locks': ['https://schlage.com/encode', 'https://yale.com/assure'] });
  });

  it('is plain TOML: comments, quoted keys, a hand-written file', () => {
    const r = parse(`# mine
name = "Work"   # trailing comment
color = "#6af"
network = "proxy"
proxy = "socks5://10.0.0.2:1080"
disposable = true
start = ["https://a.example", "https://b.example"]

[extensions]
"Dark Reader" = true

[groups]
"Reading" = ["https://b.example"]
`);
    expect(r).toMatchObject({ ok: true, data: { name: 'Work', color: '#6af', network: 'proxy', proxy: 'socks5://10.0.0.2:1080', disposable: true, ext: { 'Dark Reader': true }, groups: { Reading: ['https://b.example'] } } });
  });

  it('serialises names with quotes without producing an unreadable file', () => {
    const w = newWorkspace('Say "hi" \\ there', '#6aa9ff', mkEnv(null, []));
    const r = parse(serialize(w));
    expect(r.ok && r.data.name).toBe('Say "hi" \\ there');
  });

  it.each([
    ['network = "wifi"', /network must be/],
    ['color = "blue"', /color must be a hex/],
    ['fingerprint = "noisy"', /fingerprint must be/],
    ['icon = "dragon"', /icon must be/],
    ['network = "vpn"\nregion = "Moon"', /region must be one of/],
    ['disposable = "yes"', /disposable must be true or false/],
    ['start = "https://a.example"', /start must be a \[list\]/],
    ['[extensions]\n"X" = "on"', /extensions take true or false/],
    ['[groups]\n"G" = "https://a.example"', /a group takes a \[list\]/],
    ['name = oops', /./]
  ])('rejects %s with a readable error', (text, re) => {
    const r = parse(text);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(re);
  });

  it('merges over the previous environment, and an [extensions] table is authoritative', () => {
    const prev = mkEnv({ network: 'tor', locale: 'de-CH', ext: { '1Password': true, 'uBlock Origin Lite': true } }, EXT);
    const partial = parse('timezone = "UTC"');
    expect(partial.ok).toBe(true);
    if (!partial.ok) return;
    const a = envFromFile(partial.data, prev, EXT);
    expect(a).toMatchObject({ network: 'tor', locale: 'de-CH', tz: 'UTC', ext: { '1Password': true, 'uBlock Origin Lite': true } });
    const listed = parse('[extensions]\n"1Password" = true');
    if (!listed.ok) return;
    const b = envFromFile(listed.data, prev, EXT);
    expect(b.ext).toEqual({ '1Password': true, 'uBlock Origin Lite': false });
    const fresh = envFromFile(partial.data, null, EXT);
    expect(fresh.network).toBe('direct');
    expect(fresh.ext).toEqual({ '1Password': false, 'uBlock Origin Lite': false });
  });
});
