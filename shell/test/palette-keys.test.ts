import { describe, expect, it } from 'vitest';
import { moveSel } from '../src/shared/listnav';

describe('list navigation keys', () => {
  it('moves with arrows and the emacs pair, clamped', () => {
    expect(moveSel('ArrowDown', false, 0, 3)).toBe(1);
    expect(moveSel('ArrowDown', false, 2, 3)).toBe(2);
    expect(moveSel('ArrowUp', false, 0, 3)).toBe(0);
    expect(moveSel('n', true, 1, 3)).toBe(2);
    expect(moveSel('p', true, 1, 3)).toBe(0);
    expect(moveSel('n', false, 1, 3)).toBeNull();
  });
  it('jumps by page and to the ends', () => {
    expect(moveSel('PageDown', false, 0, 30)).toBe(8);
    expect(moveSel('PageUp', false, 3, 30)).toBe(0);
    expect(moveSel('Home', false, 20, 30)).toBe(0);
    expect(moveSel('End', false, 0, 30)).toBe(29);
  });
  it('does nothing on an empty list or an unrelated key', () => {
    expect(moveSel('ArrowDown', false, 0, 0)).toBeNull();
    expect(moveSel('a', false, 0, 5)).toBeNull();
  });
});
