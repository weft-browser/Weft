// Runs inside every page (sandboxed, isolated world). Exposes nothing to the page.
// 1. Tells main whether an editable element has focus, so a backtick typed into a
//    textarea stays a backtick and only a bare backtick becomes the prefix key.
// 2. Draws link hints on request (` f) and follows the one the user types.
/// <reference lib="dom" />
import { ipcRenderer } from 'electron';

const EDITABLE = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

function isEditable(el: Element | null): boolean {
  if (!el || !(el instanceof HTMLElement)) return false;
  return el.isContentEditable || EDITABLE.has(el.tagName);
}

function report(): void {
  ipcRenderer.send('weft:editable', isEditable(document.activeElement));
}

document.addEventListener('focusin', report, true);
document.addEventListener('focusout', () => setTimeout(report, 0), true);
window.addEventListener('focus', report);

// ── link hints ──────────────────────────────────────────────────────────────

const LETTERS = 'asdfghjkl';

function labels(n: number): string[] {
  const out: string[] = [];
  if (n <= LETTERS.length) { for (let i = 0; i < n; i++) out.push(LETTERS[i]!); return out; }
  for (const a of LETTERS) for (const b of LETTERS) { if (out.length >= n) return out; out.push(a + b); }
  return out;
}

let overlay: HTMLDivElement | null = null;
let hints: Array<{ label: string; el: HTMLAnchorElement; box: HTMLSpanElement }> = [];
let typed = '';

function clearHints(): void {
  overlay?.remove();
  overlay = null;
  hints = [];
  typed = '';
  document.removeEventListener('keydown', onHintKey, true);
  ipcRenderer.send('weft:hints-done');
}

function onHintKey(e: KeyboardEvent): void {
  e.preventDefault();
  e.stopPropagation();
  if (e.key === 'Escape') { clearHints(); return; }
  if (e.key === 'Backspace') { typed = typed.slice(0, -1); } else if (e.key.length === 1) { typed += e.key.toLowerCase(); } else return;
  const match = hints.find((h) => h.label === typed);
  if (match) {
    const el = match.el;
    clearHints();
    // Shift: open in a new tab · Option: open in a new private tab · plain: follow here.
    if (e.altKey || e.shiftKey) { ipcRenderer.send('weft:open-link', { url: el.href, private: e.altKey }); return; }
    el.focus();
    el.click();
    return;
  }
  let alive = 0;
  for (const h of hints) {
    const on = h.label.startsWith(typed);
    h.box.style.display = on ? '' : 'none';
    if (on) alive += 1;
    h.box.textContent = on && typed ? h.label.slice(typed.length) : h.label;
  }
  if (!alive) clearHints();
}

function showHints(): void {
  clearHints();
  const vw = window.innerWidth, vh = window.innerHeight;
  const anchors = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]')).filter((a) => {
    const r = a.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < vh && r.left < vw;
  });
  if (!anchors.length) { ipcRenderer.send('weft:hints-done'); return; }
  overlay = document.createElement('div');
  overlay.setAttribute('aria-hidden', 'true');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none;font:600 12px/1 ui-monospace,Menlo,monospace';
  const ls = labels(anchors.length);
  hints = anchors.map((el, i) => {
    const r = el.getBoundingClientRect();
    const box = document.createElement('span');
    box.textContent = ls[i]!;
    box.style.cssText = `position:absolute;left:${Math.max(0, r.left)}px;top:${Math.max(0, r.top - 4)}px;padding:3px 5px;border-radius:4px;background:#e5c07b;color:#14171c;box-shadow:0 1px 3px rgba(0,0,0,.4)`;
    overlay!.appendChild(box);
    return { label: ls[i]!, el, box };
  });
  (document.documentElement || document.body).appendChild(overlay);
  document.addEventListener('keydown', onHintKey, true);
}

ipcRenderer.on('weft:hints', () => showHints());

// ── Option-click a link: new private tab (Chromium would download it) ───────

document.addEventListener('click', (e) => {
  if (!e.altKey || e.button !== 0 || e.shiftKey || e.metaKey || e.ctrlKey) return;
  const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
  if (!a || !/^https?:/i.test(a.href)) return;
  e.preventDefault();
  e.stopPropagation();
  ipcRenderer.send('weft:open-link', { url: a.href, private: true });
}, true);
