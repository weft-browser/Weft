import { describe, expect, it } from 'vitest';
import { mkEnv, newTab, newWorkspace, type Workspace } from '../src/shared/model';
import { CLOSED_LIMIT, cycledTab, groupWith, insertTab, linkTab, remember, removeGroup, removeTab, removeWorkspace, reopenLast, togglePin } from '../src/shared/ops';

function ws(n: number, disposable = false): Workspace {
  const w = newWorkspace('W', '#6aa9ff', mkEnv({ disposable }, []));
  for (let i = 0; i < n; i++) w.tabs.push(newTab('https://' + i + '.example', 'T' + i));
  return w;
}

describe('placing tabs', () => {
  it('opens a link beside the opener and keeps the opener current', () => {
    const w = ws(3); w.active = 1;
    const t = linkTab(w, 'https://x.example', false, true);
    expect(insertTab(w, t, { beside: true, activate: false })).toBe(2);
    expect(w.tabs.map((x) => x.title)).toEqual(['T0', 'T1', 'x.example', 'T2']);
    expect(w.active).toBe(1);
  });
  it('activates when asked, appends when there is no opener', () => {
    const w = ws(2); w.active = 0;
    insertTab(w, newTab('https://a.example'), { beside: false, activate: true });
    expect(w.active).toBe(2);
    expect(w.tabs).toHaveLength(3);
  });
  it('inherits the opener group unless the new tab is private', () => {
    const w = ws(1); w.tabs[0]!.group = 'g1';
    expect(linkTab(w, 'https://a.example', false, true).group).toBe('g1');
    expect(linkTab(w, 'https://a.example', true, true).group).toBeNull();
    expect(linkTab(w, 'https://a.example', false, false).group).toBeNull();
  });
});

describe('removing tabs', () => {
  it('keeps the active tab active when another one closes', () => {
    const w = ws(3); w.active = 2;
    expect(removeTab(w, 0)!.title).toBe('T0');
    expect(w.active).toBe(1);
    expect(w.tabs[w.active]!.title).toBe('T2');
  });
  it('clamps when the last tab closes, and reports a bad index', () => {
    const w = ws(2); w.active = 1;
    removeTab(w, 1);
    expect(w.active).toBe(0);
    removeTab(w, 0);
    expect(w.active).toBe(0);
    expect(w.tabs).toHaveLength(0);
    expect(removeTab(w, 5)).toBeNull();
  });
  it('removes a whole group and keeps a surviving active tab', () => {
    const w = ws(4); w.active = 3;
    w.tabs[1]!.group = 'g'; w.tabs[2]!.group = 'g'; w.groups.push({ id: 'g', name: 'G', color: '#fff', collapsed: false });
    const gone = removeGroup(w, 'g');
    expect(gone.map((t) => t.title)).toEqual(['T1', 'T2']);
    expect(w.tabs[w.active]!.title).toBe('T3');
    expect(w.groups).toEqual([]);
  });
  it('closes workspaces but never the last one', () => {
    const list = [ws(1), ws(1), ws(1)];
    expect(removeWorkspace(list, 0, 2)).toBe(1);
    expect(list).toHaveLength(2);
    expect(removeWorkspace(list, 1, 1)).toBe(0);
    expect(removeWorkspace(list, 0, 0)).toBeNull();
  });
});

describe('remembering and reopening', () => {
  it('forgets private tabs, blanks and everything in a disposable workspace', () => {
    const w = ws(1);
    const tabs = [newTab('https://a.example', 'A'), newTab('https://p.example', '', { private: true }), newTab('', '')];
    const closed = remember([], w, tabs);
    expect(closed.map((c) => c.tab.title)).toEqual(['A']);
    expect(closed[0]!.tab.group).toBeNull();
    expect(remember([], ws(1, true), tabs)).toEqual([]);
  });
  it('keeps only the most recent ones', () => {
    const w = ws(1);
    const many = Array.from({ length: CLOSED_LIMIT + 5 }, (_, i) => newTab('https://' + i + '.example', String(i)));
    const closed = remember([], w, many);
    expect(closed).toHaveLength(CLOSED_LIMIT);
    expect(closed[closed.length - 1]!.tab.title).toBe(String(CLOSED_LIMIT + 4));
  });
  it('reopens into the workspace it came from, or the current one when that is gone', () => {
    const a = ws(1), b = ws(1);
    const closed = remember([], b, [newTab('https://z.example', 'Z', { pinned: true })]);
    const r = reopenLast(closed, [a, b], 0)!;
    expect(r.wi).toBe(1);
    expect(r.tab).toMatchObject({ title: 'Z', pinned: true });
    expect(r.closed).toEqual([]);
    expect(reopenLast(closed, [a], 0)!.wi).toBe(0);
    expect(reopenLast([], [a], 0)).toBeNull();
  });
});

describe('cycling, pinning, grouping', () => {
  it('cycles in strip order with pins first and wraps', () => {
    const w = ws(3); w.tabs[2]!.pinned = true; w.active = 2;
    expect(cycledTab(w, 1)).toBe(0);
    expect(cycledTab(w, -1)).toBe(1);
    expect(cycledTab(ws(0), 1)).toBe(0);
  });
  it('pinning leaves the group', () => {
    const w = ws(1); w.tabs[0]!.group = 'g';
    expect(togglePin(w, 0)).toMatchObject({ pinned: true, group: null });
    expect(togglePin(w, 7)).toBeNull();
  });
  it('grouping unpins and numbers groups', () => {
    const w = ws(2); w.tabs[0]!.pinned = true;
    const g = groupWith(w, 0, 'g1')!;
    expect(g.name).toBe('Group 1');
    expect(w.tabs[0]).toMatchObject({ pinned: false, group: 'g1' });
    expect(groupWith(w, 1, 'g2')!.name).toBe('Group 2');
    expect(groupWith(w, 9, 'g3')).toBeNull();
  });
});
