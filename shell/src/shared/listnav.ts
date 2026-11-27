// Keyboard model for every list in the shell, VS Code style: ↑ ↓ (also ⌃N ⌃P), Home End,
// PageUp PageDown. Returns the new selection, or null when the key is not a navigation key.
export const PAGE = 8;

export function moveSel(key: string, ctrl: boolean, sel: number, count: number): number | null {
  if (!count) return null;
  const last = count - 1;
  if (key === 'ArrowDown' || (ctrl && key === 'n')) return Math.min(sel + 1, last);
  if (key === 'ArrowUp' || (ctrl && key === 'p')) return Math.max(sel - 1, 0);
  if (key === 'PageDown') return Math.min(sel + PAGE, last);
  if (key === 'PageUp') return Math.max(sel - PAGE, 0);
  if (key === 'Home') return 0;
  if (key === 'End') return last;
  return null;
}
