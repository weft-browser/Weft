import { describe, expect, it } from 'vitest';
import { FakeEngine, titleOf, type KV } from '../dev/fake-engine';

function harness() {
  const replies = new Map<string, unknown>();
  const events: any[] = [];
  const data = new Map<string, string>();
  const store: KV = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v); }, removeItem: (k) => { data.delete(k); }, key: (i) => Array.from(data.keys())[i] ?? null, get length() { return data.size; } };
  const e = new FakeEngine(() => ({ resolve: (id, r) => { replies.set(id, r); }, event: (x) => { events.push(x); } }), store, (fn) => fn());
  return { e, replies, events, data };
}

describe('fake engine (shell dev mode)', () => {
  it('boots, lists sample extensions, and keeps files in the storage it is given', () => {
    const { e, replies } = harness();
    e.send('getBoot', ['r1']);
    e.send('listExtensions', ['r2']);
    e.send('writeFile', ['state.json', '{"v":1}']);
    e.send('writeFile', ['workspaces/a.env.toml', 'x']);
    e.send('writeFile', ['workspaces/b.env.toml', 'y']);
    e.send('removeFile', ['workspaces/a.env.toml']);
    e.send('readFile', ['r3', 'state.json']);
    e.send('readFile', ['r4', 'missing']);
    e.send('listDir', ['r5', 'workspaces']);
    expect(replies.get('r1')).toMatchObject({ version: expect.stringContaining('fake') });
    expect((replies.get('r2') as any).names.length).toBeGreaterThan(0);
    expect(replies.get('r3')).toEqual({ text: '{"v":1}' });
    expect(replies.get('r4')).toEqual({ text: null });
    expect(replies.get('r5')).toEqual({ names: ['b.env.toml'] });
  });

  it('keeps a history per page: navigate truncates forward entries, back and forward move, bounds hold', () => {
    const { e, replies, events } = harness();
    e.send('createPage', ['r1', 't1', 'https://a.example/', 'ws', 'persist']);
    expect(replies.get('r1')).toEqual({ contentId: 'fake-t1' });
    e.send('page', ['t1', 'navigate', 'https://b.example/x']);
    e.send('page', ['t1', 'navigate', 'https://c.example/']);
    e.send('page', ['t1', 'back', null]);
    e.send('page', ['t1', 'back', null]);
    e.send('page', ['t1', 'back', null]);   // already at the start: no event
    const last = () => events[events.length - 1];
    expect(last()).toMatchObject({ url: 'https://a.example/', canBack: false, canFwd: true, histPos: 0, loading: false });
    e.send('page', ['t1', 'navigate', 'https://d.example/']);
    expect(last().history.map((h: any) => h.url)).toEqual(['https://a.example/', 'https://d.example/']);
    expect(last()).toMatchObject({ canBack: true, canFwd: false, title: 'd.example' });
    e.send('page', ['t1', 'goToIndex', 9]);
    expect(last().histPos).toBe(1);
    const n = events.length;
    e.send('page', ['t1', 'destroy', null]);
    e.send('page', ['t1', 'reload', null]);
    e.send('page', ['nope', 'reload', null]);
    expect(events.length).toBe(n);
  });

  it('reports a load as two events, loading then loaded, and accepts what it does not enforce', () => {
    const { e, events } = harness();
    e.send('createPage', ['r1', 't1', 'https://a.example/', 'ws', 'private']);
    expect(events.map((x) => [x.loading, x.navigated])).toEqual([[true, true], [false, false]]);
    for (const m of ['setEnv', 'wipe', 'setTrackers', 'setAllow', 'setLeader', 'somethingNew']) expect(() => e.send(m, [1, 2])).not.toThrow();
    expect(e.log.at(-1)).toEqual({ message: 'somethingNew', args: [1, 2] });
  });

  it('titles a page from its address', () => {
    expect(titleOf('https://www.example.com/')).toBe('example.com');
    expect(titleOf('https://example.com/docs/a')).toBe('example.com/docs/a');
    expect(titleOf('https://duckduckgo.com/?q=weft')).toBe('weft — search');
    expect(titleOf('not a url')).toBe('not a url');
  });
});
