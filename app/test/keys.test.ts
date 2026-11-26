import { describe, expect, it } from 'vitest';
import { KEY_GROUPS, leaderAction } from '../src/shared/keys';

describe('prefix keymap', () => {
  it('binds every key the help card documents', () => {
    const documented = KEY_GROUPS.flatMap((g) => g.keys.flatMap((k) => k.keys.split(' ')));
    for (const k of documented) {
      if (k === '1–9') { expect(leaderAction('1')).toBeTruthy(); expect(leaderAction('9')).toBeTruthy(); continue; }
      expect(leaderAction(k), k).not.toBeNull();
    }
  });
  it('leaves unbound keys alone', () => {
    expect(leaderAction('q')).toBeNull();
    expect(leaderAction('Enter')).toBeNull();
  });
  it('distinguishes case', () => {
    expect(leaderAction('x')).toMatchObject({ kind: 'cmd', cmd: { type: 'closeTab' } });
    expect(leaderAction('X')).toMatchObject({ kind: 'cmd', cmd: { type: 'closeWs' } });
    expect(leaderAction('p')).toMatchObject({ kind: 'ui', ui: 'privacy' });
    expect(leaderAction('P')).toMatchObject({ kind: 'cmd', cmd: { type: 'togglePin' } });
  });
});

describe('private tabs and the tab list', () => {
  it('shift-t opens a private tab, a opens the list', () => {
    expect(leaderAction('t')).toMatchObject({ kind: 'cmd', cmd: { type: 'newTab' } });
    expect(leaderAction('t')).not.toMatchObject({ cmd: { private: true } });
    expect(leaderAction('T')).toMatchObject({ kind: 'cmd', cmd: { type: 'newTab', private: true } });
    expect(leaderAction('a')).toMatchObject({ kind: 'ui', ui: 'tabs' });
  });
});

describe('triage keys', () => {
  it('c opens the tidy list, s saves the page as text', () => {
    expect(leaderAction('c')).toEqual({ kind: 'ui', ui: 'tidy' });
    expect(leaderAction('s')).toMatchObject({ kind: 'cmd', cmd: { type: 'savePage' } });
  });
});
