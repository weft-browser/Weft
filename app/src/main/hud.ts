// A click-through, transparent child window laid over the page area. Child WebContentsViews
// always paint above the shell's own document, so anything that must float over a live
// page — leader help, toasts, the hover URL — lives here instead.
import { BrowserWindow } from 'electron';
import { join } from 'node:path';
import type { Rect } from '../shared/ipc';

export function createHud(parent: BrowserWindow, preload: string): BrowserWindow {
  const hud = new BrowserWindow({
    parent,
    show: false,
    frame: false,
    transparent: true,
    hasShadow: false,
    focusable: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    backgroundColor: '#00000000',
    webPreferences: { preload, sandbox: true, contextIsolation: true }
  });
  hud.setIgnoreMouseEvents(true);
  if (process.env.ELECTRON_RENDERER_URL) hud.loadURL(process.env.ELECTRON_RENDERER_URL + '/hud.html');
  else hud.loadFile(join(__dirname, '../renderer/hud.html'));
  return hud;
}

export function placeHud(hud: BrowserWindow, parent: BrowserWindow, rect: Rect): void {
  const b = parent.getContentBounds();
  hud.setBounds({ x: b.x + Math.round(rect.x), y: b.y + Math.round(rect.y), width: Math.max(1, Math.round(rect.w)), height: Math.max(1, Math.round(rect.h)) });
}
