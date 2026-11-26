import { describe, expect, it } from 'vitest';
import { mkEnv, navOrder, netLabel, newTab, newWorkspace, nextZoom, readable, seenAs, slug, stripOrder, toNavigation } from '../src/shared/model';

function ws() {
  const w = newWorkspace('W', '#6aa9ff', mkEnv(null, []));
  w.groups.push({ id: 'g', name: 'G', color: '#5fd3e0', collapsed: false });
  w.tabs.push(newTab('https://a.example', 'A'));                       // 0 plain
  w.tabs.push(newTab('https://p.example', 'P', { pinned: true }));     // 1 pinned
  w.tabs.push(newTab('https://g1.example', 'G1', { group: 'g' }));     // 2 grouped
  w.tabs.push(newTab('https://b.example', 'B'));                       // 3 plain
  w.tabs.push(newTab('https://g2.example', 'G2', { group: 'g' }));     // 4 grouped
  return w;
}

describe('tab strip order', () => {
  it('puts pins first and keeps a group contiguous behind its chip', () => {
    const items = stripOrder(ws()).map((o) => (o.type === 'chip' ? 'chip:' + o.g.name : o.type + ':' + o.j));
    expect(items).toEqual(['pin:1', 'tab:0', 'chip:G', 'tab:2', 'tab:4', 'tab:3']);
  });
  it('folds a collapsed group except for the active tab', () => {
    const w = ws();
    w.groups[0]!.collapsed = true;
    w.active = 4;
    expect(navOrder(w)).toEqual([1, 0, 4, 3]);
    w.active = 0;
    expect(navOrder(w)).toEqual([1, 0, 3]);
  });
  it('ignores a dangling group id', () => {
    const w = ws();
    w.tabs[2]!.group = 'gone';
    expect(navOrder(w)).toEqual([1, 0, 2, 3, 4]);
  });
});

describe('address bar', () => {
  it('searches text and loads addresses', () => {
    expect(toNavigation('')).toBeNull();
    expect(toNavigation('   ')).toBeNull();
    expect(toNavigation('smart locks')).toMatchObject({ url: 'https://duckduckgo.com/?q=smart%20locks', title: 'Search: smart locks' });
    expect(toNavigation('example.com/x')).toMatchObject({ url: 'https://example.com/x', title: 'example.com' });
    expect(toNavigation('http://localhost:8123')).toMatchObject({ url: 'http://localhost:8123' });
    expect(toNavigation('localhost')).toMatchObject({ url: 'https://localhost' });
    expect(toNavigation('www.example.com')).toMatchObject({ title: 'example.com' });
  });
});

describe('small helpers', () => {
  it('keeps badge text readable on dark colors', () => {
    expect(readable('#6aa9ff')).toBe('#6aa9ff');
    expect(readable('#111')).toBe('#e8eaed');
  });
  it('slugs names for file paths', () => {
    expect(slug('Acme Rentals')).toBe('acme-rentals');
    expect(slug('  ---  ')).toBe('workspace');
  });
  it('steps zoom through the fixed ladder', () => {
    expect(nextZoom(1, 1)).toBe(1.1);
    expect(nextZoom(2, 1)).toBe(2);
    expect(nextZoom(0.5, -1)).toBe(0.5);
    expect(nextZoom(1.33, 1)).toBe(1.1);
    expect(nextZoom(1.75, 0)).toBe(1);
  });
  it('never claims a route that is not configured', () => {
    const vpn = mkEnv({ network: 'vpn', region: 'Zurich, CH' }, []);
    const up = { 'Zurich, CH': { state: 'up' as const, detail: 'connected' } };
    const starting = { 'Zurich, CH': { state: 'starting' as const, detail: 'starting tunnel' } };
    expect(netLabel(vpn, [])).toBe('VPN · Zurich · not configured');
    expect(netLabel(vpn, ['Zurich, CH'])).toBe('VPN · Zurich · down');
    expect(netLabel(vpn, ['Zurich, CH'], starting)).toBe('VPN · Zurich · connecting');
    expect(netLabel(vpn, ['Zurich, CH'], up)).toBe('VPN · Zurich');
    expect(seenAs(vpn, [])).toContain('your real IP');
    expect(seenAs(vpn, ['Zurich, CH'])).toContain('connections fail rather than leak');
    expect(seenAs(vpn, ['Zurich, CH'], up)).toContain('Zurich, CH exit');
    expect(seenAs(mkEnv({ fp: 'strict' }, []), [])).toContain('not applied yet');
    expect(netLabel(mkEnv({ network: 'proxy' }, []), [])).toBe('Proxy · not set');
  });
});
