import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { mkEnv, newTab, newWorkspace } from '../src/shared/model';
import { SNAPSHOT_VERSION, decodeSnapshot, encodeSnapshot } from '../src/shared/snapshot';

const FIX = join(__dirname, 'fixtures');

describe('state.json contract', () => {
  for (const f of readdirSync(FIX).filter((n) => n.startsWith('state-'))) {
    it(`decodes ${f} without losing data`, () => {
      const d = decodeSnapshot(JSON.parse(readFileSync(join(FIX, f), 'utf8')), ['uBlock Origin Lite', 'Dark Reader']);
      expect(d.warnings).toEqual([]);
      expect(d.workspaces.length).toBeGreaterThan(0);
      const a = d.workspaces[0]!;
      expect(a.id).toBe('ws-a');
      expect(a.tabs.map((t) => t.id)).toEqual(['t1', 't2', 't3']);
      expect(a.tabs[0]!.pinned).toBe(true);
      expect(a.tabs[2]!.icon).toEqual({ kind: 'svg', id: 'book' });
      expect(a.groups[0]!.name).toBe('Atlassian');
      expect(a.env.ext).toEqual({ 'uBlock Origin Lite': true, 'Dark Reader': false });
      expect(d.activeWs).toBe(1);
      expect(d.closed[0]!.tab.url).toBe('https://example.com');
      expect(d.allow).toEqual({ 'ws-a|gitlab.com': true });
    });
  }

  it('round-trips through encode and decode', () => {
    const w = newWorkspace('Round', '#7fd6a6', mkEnv({ locale: 'it-IT' }, []));
    w.tabs.push(newTab('https://a.example', 'A', { blocked: 7, loading: true, zoom: 1.5 }));
    const snap = encodeSnapshot([w], 0, [{ wsId: w.id, tab: newTab('https://b.example', 'B') }], { [w.id + '|a.example']: true });
    expect(snap.v).toBe(SNAPSHOT_VERSION);
    expect(snap.workspaces[0]!.tabs[0]).toMatchObject({ blocked: 0, loading: false, zoom: 1 });
    const d = decodeSnapshot(JSON.parse(JSON.stringify(snap)), []);
    expect(d.warnings).toEqual([]);
    expect(d.workspaces[0]).toMatchObject({ id: w.id, name: 'Round', env: { locale: 'it-IT' } });
    expect(d.closed).toHaveLength(1);
    expect(d.allow).toEqual({ [w.id + '|a.example']: true });
  });

  it('keeps the triage timestamps and never writes the live-only signals', () => {
    const w = newWorkspace('Signals', '#6aa9ff', mkEnv(null, []));
    w.tabs.push(newTab('https://a.example', 'A', { lastActive: 1795000000000, activeMs: 42000, audible: true, edited: true }));
    const snap = encodeSnapshot([w], 0, [], {});
    expect(snap.workspaces[0]!.tabs[0]).toMatchObject({ lastActive: 1795000000000, activeMs: 42000, audible: false, edited: false });
    expect(decodeSnapshot(JSON.parse(JSON.stringify(snap)), []).workspaces[0]!.tabs[0]).toMatchObject({ lastActive: 1795000000000, activeMs: 42000 });
  });

  it('reads tabs from before the triage timestamps as used just now, so an upgrade suggests closing nothing', () => {
    const before = Date.now();
    const d = decodeSnapshot(JSON.parse(readFileSync(join(FIX, 'state-2026-11-06.json'), 'utf8')), []);
    const tabs = d.workspaces.flatMap((w) => w.tabs).concat(d.closed.map((c) => c.tab));
    expect(tabs.every((t) => t.lastActive >= before && t.activeMs === 0)).toBe(true);
  });

  it('clamps triage timestamps it cannot trust: a future time, a negative or non-number total', () => {
    const future = Date.now() + 9e9;
    const d = decodeSnapshot({ v: 1, workspaces: [{ name: 'Odd', tabs: [{ url: 'https://a.example', lastActive: future, activeMs: -5 }, { url: 'https://b.example', lastActive: 'x', activeMs: null }] }] }, []);
    const [a, b] = d.workspaces[0]!.tabs;
    expect(a!.lastActive).toBeLessThan(future);
    expect(a!.activeMs).toBe(0);
    expect(typeof b!.lastActive).toBe('number');
    expect(b!.activeMs).toBe(0);
    expect(d.warnings).toEqual([]);
  });

  it('never writes a disposable workspace', () => {
    const keep = newWorkspace('Keep', '#6aa9ff', mkEnv(null, []));
    const gone = newWorkspace('Gone', '#e5c07b', mkEnv({ disposable: true }, []));
    const snap = encodeSnapshot([gone, keep], 1, [{ wsId: gone.id, tab: newTab('https://x.example') }], {});
    expect(snap.workspaces.map((w) => w.name)).toEqual(['Keep']);
    expect(snap.activeWs).toBe(0);
    expect(snap.closed).toEqual([]);
  });

  it('never writes a private tab, and keeps the active tab pointing at the same public tab', () => {
    const w = newWorkspace('Mixed', '#6aa9ff', mkEnv(null, []));
    w.tabs.push(newTab('https://a.example', 'A'), newTab('https://p.example', '', { private: true }), newTab('https://b.example', 'B'), newTab('', '', { private: true }));
    w.active = 2;
    const snap = encodeSnapshot([w], 0, [{ wsId: w.id, tab: newTab('https://q.example', '', { private: true }) }, { wsId: w.id, tab: newTab('https://c.example', 'C') }], {});
    expect(snap.workspaces[0]!.tabs.map((t) => t.title)).toEqual(['A', 'B']);
    expect(snap.workspaces[0]!.active).toBe(1);
    expect(snap.closed.map((c) => c.tab.title)).toEqual(['C']);
    const d = decodeSnapshot(JSON.parse(JSON.stringify(snap)), []);
    expect(d.workspaces[0]!.tabs.every((t) => t.private === false && t.history.length === 0)).toBe(true);
  });

  it('clamps the active tab when the active one was private and last', () => {
    const w = newWorkspace('Edge', '#6aa9ff', mkEnv(null, []));
    w.tabs.push(newTab('https://a.example', 'A'), newTab('https://p.example', '', { private: true }));
    w.active = 1;
    expect(encodeSnapshot([w], 0, [], {}).workspaces[0]!.active).toBe(0);
  });

  it('drops a bad record with a warning instead of the whole file', () => {
    const d = decodeSnapshot({ v: 1, workspaces: [{ name: 'Ok', tabs: [{ url: 'https://a.example' }, 'junk', { title: 'no url is fine' }] }, 'junk', { tabs: [] }], activeWs: 7 }, []);
    expect(d.workspaces.map((w) => w.name)).toEqual(['Ok']);
    expect(d.workspaces[0]!.tabs).toHaveLength(2);
    expect(d.activeWs).toBe(0);
    expect(d.warnings.length).toBe(3);
  });

  it('reads a newer version for what it understands and says so', () => {
    const d = decodeSnapshot({ v: 99, workspaces: [{ name: 'Future', tabs: [], unknownField: 1 }] }, []);
    expect(d.workspaces[0]!.name).toBe('Future');
    expect(d.warnings[0]).toMatch(/newer than this build/);
  });

  it('tolerates garbage at the top level', () => {
    expect(decodeSnapshot('nope', []).workspaces).toEqual([]);
    expect(decodeSnapshot(null, []).warnings.length).toBe(1);
  });
});
