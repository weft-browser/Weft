import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import { Updater, type UpdateEngine } from '../src/main/updater';
import type { UpdateState } from '../src/shared/model';

class FakeEngine extends EventEmitter implements UpdateEngine {
  autoDownload = false;
  autoInstallOnAppQuit = false;
  checks = 0;
  installs = 0;
  checkForUpdates(): Promise<unknown> { this.checks++; return Promise.resolve(null); }
  quitAndInstall(): void { this.installs++; }
}

function rig(engine: FakeEngine | null) {
  const notes: string[] = [];
  const states: UpdateState[] = [];
  const u = new Updater({ engine, current: '0.1.0', everyMs: 1e9, onChange: (s, n) => { states.push(s); if (n) notes.push(n); } });
  return { u, notes, states };
}

describe('Updater', () => {
  it('is off without an engine, and says so only when asked', () => {
    const { u, notes } = rig(null);
    u.start();
    expect(u.state().phase).toBe('off');
    expect(notes).toEqual([]);
    u.check(true);
    expect(notes).toEqual(['This build does not update itself']);
  });

  it('checks on start, downloads in the background, and installs only once ready', () => {
    const e = new FakeEngine();
    const { u, notes } = rig(e);
    u.start();
    expect(e.checks).toBe(1);
    expect(e.autoDownload && e.autoInstallOnAppQuit).toBe(true);
    u.install();
    expect(e.installs).toBe(0);
    e.emit('checking-for-update');
    e.emit('update-available', { version: '0.2.0' });
    e.emit('download-progress', { percent: 41.6 });
    expect(u.state()).toMatchObject({ phase: 'downloading', version: '0.2.0', percent: 42 });
    expect(notes).toEqual([]);
    e.emit('update-downloaded', { version: '0.2.0' });
    expect(u.state().phase).toBe('ready');
    expect(notes).toEqual(['Weft 0.2.0 is ready. Restart to update (palette)']);
    u.install();
    expect(e.installs).toBe(1);
  });

  it('is quiet about a background "up to date" or failure, and tells a person who asked', () => {
    const e = new FakeEngine();
    const { u, notes } = rig(e);
    u.start();
    e.emit('checking-for-update');
    e.emit('update-not-available');
    e.emit('error', new Error('offline'));
    expect(notes).toEqual([]);
    u.check(true);
    e.emit('checking-for-update');
    e.emit('update-not-available');
    expect(notes).toEqual(['Weft 0.1.0 is up to date']);
    // The manual flag does not leak into the next background check.
    e.emit('checking-for-update');
    e.emit('update-not-available');
    expect(notes).toHaveLength(1);
    u.check(true);
    e.emit('error', new Error('offline'));
    expect(notes[1]).toBe('Update check failed');
  });

  it('does not start a second check while one is running, and a failure never loses a ready update', () => {
    const e = new FakeEngine();
    const { u } = rig(e);
    u.start();
    e.emit('checking-for-update');
    u.check(true);
    expect(e.checks).toBe(1);
    e.emit('update-available', { version: '0.2.0' });
    e.emit('update-downloaded', { version: '0.2.0' });
    e.emit('error', new Error('later check failed'));
    expect(u.state().phase).toBe('ready');
    u.check(true);
    expect(e.checks).toBe(1);
  });
});
