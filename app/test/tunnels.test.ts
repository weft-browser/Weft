import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Tunnels } from '../src/main/tunnels';

const FAKE = join(__dirname, 'fixtures', 'fake-wireproxy.mjs');
const CONF = '[Interface]\nPrivateKey = k=\nAddress = 10.0.0.2/32\n[Peer]\nPublicKey = p=\nEndpoint = 192.0.2.1:51820\nAllowedIPs = 0.0.0.0/0\n';

const until = (f: () => boolean, ms = 5000): Promise<void> => new Promise((res, rej) => {
  const t0 = Date.now();
  const tick = (): void => { if (f()) res(); else if (Date.now() - t0 > ms) rej(new Error('timeout')); else setTimeout(tick, 50); };
  tick();
});

let dir = '';
let made: Tunnels[] = [];
afterEach(() => { made.forEach((t) => t.stopAll()); made = []; if (dir) rmSync(dir, { recursive: true, force: true }); });

function setup(binary: string | null, env: Record<string, string> = {}): { t: Tunnels; log: Array<[string, string]> } {
  dir = mkdtempSync(join(tmpdir(), 'weft-vpn-'));
  writeFileSync(join(dir, 'Zurich, CH.conf'), CONF);
  writeFileSync(join(dir, 'notes.txt'), 'not a region');
  Object.assign(process.env, env);
  const log: Array<[string, string]> = [];
  const t = new Tunnels({ dir, binary: binary ? process.execPath : null, onStatus: (r, s) => log.push([r, s.state + ': ' + s.detail]) });
  made.push(t);
  return { t, log };
}

describe('tunnels', () => {
  it('lists regions from config files only', () => {
    const { t } = setup(null);
    expect(t.regions()).toEqual(['Zurich, CH']);
    expect(t.hasEngine()).toBe(false);
  });

  it('hands out a local SOCKS endpoint for a configured region, and nothing for an unknown one', async () => {
    const { t } = setup(null);
    expect(await t.endpoint('Zurich, CH')).toMatch(/^socks5:\/\/127\.0\.0\.1:\d+$/);
    expect(await t.endpoint('Mars')).toBeNull();
    expect(await t.endpoint('Zurich, CH')).toBe(await t.endpoint('Zurich, CH'));
  });

  it('fails closed without an engine: the port exists, nothing listens, the status says why', async () => {
    const { t, log } = setup(null);
    await t.sync(['Zurich, CH']);
    expect(t.statuses()['Zurich, CH']).toMatchObject({ state: 'down', detail: expect.stringContaining('not installed') });
    expect(log).toHaveLength(1);
  });
});

describe('tunnels with an engine', () => {
  // The fake engine is `node fake-wireproxy.mjs`; Tunnels spawns `binary -c conf`, so the binary is
  // node and the script rides in through a wrapper argument order: node <script> -c <conf>.
  function engine(die = false): { t: Tunnels; log: Array<[string, string]> } {
    dir = mkdtempSync(join(tmpdir(), 'weft-vpn-'));
    writeFileSync(join(dir, 'Zurich, CH.conf'), CONF);
    const log: Array<[string, string]> = [];
    const wrapper = join(dir, 'wireproxy');
    writeFileSync(wrapper, '#!/bin/sh\n' + (die ? 'FAKE_WIREPROXY_DIE=1 ' : '') + 'exec "' + process.execPath + '" "' + FAKE + '" "$@"\n', { mode: 0o755 });
    const t = new Tunnels({ dir, binary: wrapper, onStatus: (r, s) => log.push([r, s.state + ': ' + s.detail]) });
    made.push(t);
    return { t, log };
  }

  it('starts a wanted tunnel and reports it up once the port listens', async () => {
    const { t, log } = engine();
    await t.sync(['Zurich, CH']);
    await until(() => t.statuses()['Zurich, CH']?.state === 'up');
    expect(log.map((l) => l[1].split(':')[0])).toEqual(['starting', 'up']);
  });

  it('stops a tunnel nobody wants any more', async () => {
    const { t } = engine();
    await t.sync(['Zurich, CH']);
    await until(() => t.statuses()['Zurich, CH']?.state === 'up');
    await t.sync([]);
    expect(t.statuses()['Zurich, CH']).toMatchObject({ state: 'down', detail: 'stopped' });
  });

  it('restarts a tunnel that dies and gives up after the retries, saying what the engine said', async () => {
    const { t, log } = engine(true);
    await t.sync(['Zurich, CH']);
    await until(() => /gave up/.test(t.statuses()['Zurich, CH']?.detail ?? ''), 60_000);
    expect(log.some((l) => /restarting \(1\/5\): handshake failed/.test(l[1]))).toBe(true);
    expect(t.statuses()['Zurich, CH']!.detail).toContain('handshake failed');
  }, 70_000);
});
