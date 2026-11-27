// The prefix-key map. One place: the help card, the palette and both key handlers read it.
import type { Command } from './ipc';

export type UiAction = 'palette' | 'env' | 'rename' | 'pinRail' | 'address' | 'privacy' | 'menu' | 'uiScale' | 'tabs' | 'tidy';
export type LeaderAction = { kind: 'cmd'; cmd: Command; focusPage?: boolean } | { kind: 'ui'; ui: UiAction };

export interface KeyDoc { keys: string; label: string; cmdLabel: string; }
export const KEY_GROUPS: ReadonlyArray<{ title: string; keys: ReadonlyArray<KeyDoc> }> = [
  { title: 'Workspaces', keys: [
    { keys: '1–9', label: 'jump to', cmdLabel: '' },
    { keys: 'j k', label: 'next / prev', cmdLabel: '' },
    { keys: 'n', label: 'new', cmdLabel: 'New workspace' },
    { keys: 'd', label: 'new disposable', cmdLabel: 'New disposable workspace' },
    { keys: 'v', label: 'environment', cmdLabel: 'Workspace environment' },
    { keys: 'e', label: 'rename', cmdLabel: 'Rename workspace' },
    { keys: 'X', label: 'close', cmdLabel: 'Close workspace' }
  ] },
  { title: 'Tabs', keys: [
    { keys: 'h l', label: 'prev / next', cmdLabel: '' },
    { keys: 't', label: 'new tab', cmdLabel: 'New tab' },
    { keys: 'T', label: 'new private tab', cmdLabel: 'New private tab' },
    { keys: 'x', label: 'close tab', cmdLabel: 'Close tab' },
    { keys: 'u', label: 'reopen closed', cmdLabel: 'Reopen closed tab' },
    { keys: 'a', label: 'all tabs list', cmdLabel: 'Show all tabs' },
    { keys: 'c', label: 'tidy: tabs to close', cmdLabel: 'Tidy tabs' },
    { keys: 'P', label: 'pin / unpin', cmdLabel: 'Pin or unpin tab' },
    { keys: 'g', label: 'new group', cmdLabel: 'New group with this tab' },
    { keys: 'G', label: 'collapse group', cmdLabel: 'Collapse or expand group' },
    { keys: 'm', label: 'tab menu', cmdLabel: 'Tab menu' }
  ] },
  { title: 'Page', keys: [
    { keys: ':', label: 'command palette', cmdLabel: '' },
    { keys: 'o', label: 'address / search', cmdLabel: 'Address bar' },
    { keys: 'f', label: 'follow link', cmdLabel: 'Follow a link' },
    { keys: '[ ]', label: 'back / forward', cmdLabel: '' },
    { keys: '+ - 0', label: 'zoom page', cmdLabel: '' },
    { keys: 'z', label: 'interface size', cmdLabel: 'Cycle interface size' },
    { keys: 'r', label: 'reload', cmdLabel: 'Reload' },
    { keys: 's', label: 'save page as text', cmdLabel: 'Save page as text' },
    { keys: 'p', label: 'privacy', cmdLabel: 'Privacy panel' },
    { keys: 'b', label: 'pin sidebar', cmdLabel: 'Pin or unpin sidebar' }
  ] }
];

/** The key pressed after the prefix. `null` = no binding. */
export function leaderAction(key: string): LeaderAction | null {
  const cmd = (c: Command, focusPage = false): LeaderAction => ({ kind: 'cmd', cmd: c, focusPage });
  const ui = (u: UiAction): LeaderAction => ({ kind: 'ui', ui: u });
  if (key === ':' || key === ' ') return ui('palette');
  if (key === '=' || key === '+') return cmd({ type: 'zoom', d: 1 }, true);
  if (key === '-') return cmd({ type: 'zoom', d: -1 }, true);
  if (key === '0') return cmd({ type: 'zoom', d: 0 }, true);
  if (key === 'z') return ui('uiScale');
  if (key === 'P') return cmd({ type: 'togglePin' });
  if (key === 'g') return cmd({ type: 'newGroup' });
  if (key === 'G') return cmd({ type: 'toggleActiveGroup' });
  if (key === 'm') return ui('menu');
  if (/^[1-9]$/.test(key)) return cmd({ type: 'selectWs', i: Number(key) - 1 }, true);
  if (key === 'l' || key === 'ArrowRight') return cmd({ type: 'cycleTab', d: 1 }, true);
  if (key === 'h' || key === 'ArrowLeft') return cmd({ type: 'cycleTab', d: -1 }, true);
  if (key === 'j' || key === 'ArrowDown') return cmd({ type: 'cycleWs', d: 1 }, true);
  if (key === 'k' || key === 'ArrowUp') return cmd({ type: 'cycleWs', d: -1 }, true);
  if (key === 't') return cmd({ type: 'newTab' });
  if (key === 'T') return cmd({ type: 'newTab', private: true });
  if (key === 'a') return ui('tabs');
  if (key === 'c') return ui('tidy');
  if (key === 's') return cmd({ type: 'savePage' });
  if (key === 'x') return cmd({ type: 'closeTab' }, true);
  if (key === 'X') return cmd({ type: 'closeWs' }, true);
  if (key === 'u') return cmd({ type: 'reopen' }, true);
  if (key === 'n') return cmd({ type: 'addWs' });
  if (key === 'd') return cmd({ type: 'addDisposable' });
  if (key === 'v') return ui('env');
  if (key === 'e') return ui('rename');
  if (key === 'b') return ui('pinRail');
  if (key === 'o') return ui('address');
  if (key === '[') return cmd({ type: 'back' }, true);
  if (key === ']') return cmd({ type: 'forward' }, true);
  if (key === 'r') return cmd({ type: 'reload' }, true);
  if (key === 'p') return ui('privacy');
  if (key === 'f') return cmd({ type: 'hints' }, true);
  return null;
}

export const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta']);
