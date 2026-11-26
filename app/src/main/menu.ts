import { Menu, app, type MenuItemConstructorOptions } from 'electron';
import type { Command } from '../shared/ipc';
import type { UiAction } from '../shared/keys';

export function installMenu(run: (cmd: Command) => void, ui: (a: UiAction) => void): void {
  const mac = process.platform === 'darwin';
  const tpl: MenuItemConstructorOptions[] = [
    ...(mac ? [{ label: app.name, submenu: [
      { role: 'about' as const },
      { label: 'Check for Updates…', click: () => run({ type: 'checkUpdates' }) },
      { type: 'separator' as const },
      { role: 'services' as const },
      { type: 'separator' as const },
      { role: 'hide' as const }, { role: 'hideOthers' as const }, { role: 'unhide' as const },
      { type: 'separator' as const },
      { role: 'quit' as const }
    ] }] : []),
    { label: 'File', submenu: [
      { label: 'New Tab', accelerator: 'CmdOrCtrl+T', click: () => run({ type: 'newTab' }) },
      { label: 'New Workspace', accelerator: 'CmdOrCtrl+Shift+N', click: () => run({ type: 'addWs' }) },
      { label: 'Reopen Closed Tab', accelerator: 'CmdOrCtrl+Shift+T', click: () => run({ type: 'reopen' }) },
      { type: 'separator' },
      { label: 'Close Tab', accelerator: 'CmdOrCtrl+W', click: () => run({ type: 'closeTab' }) },
      ...(mac ? [] : [{ role: 'quit' as const }])
    ] },
    { role: 'editMenu' },
    { label: 'View', submenu: [
      // Not Cmd+K: web apps (Slack, Notion, Jira) own it, and a browser must not take it from them.
      { label: 'Command Palette', accelerator: 'Alt+CmdOrCtrl+W', click: () => ui('palette') },
      { label: 'Address', accelerator: 'CmdOrCtrl+L', click: () => ui('address') },
      { label: 'Workspace Environment', accelerator: 'CmdOrCtrl+E', click: () => ui('env') },
      { type: 'separator' },
      { label: 'Reload', accelerator: 'CmdOrCtrl+R', click: () => run({ type: 'reload' }) },
      { label: 'Back', accelerator: 'CmdOrCtrl+[', click: () => run({ type: 'back' }) },
      { label: 'Forward', accelerator: 'CmdOrCtrl+]', click: () => run({ type: 'forward' }) },
      { type: 'separator' },
      { label: 'Zoom In', accelerator: 'CmdOrCtrl+=', click: () => run({ type: 'zoom', d: 1 }) },
      { label: 'Zoom Out', accelerator: 'CmdOrCtrl+-', click: () => run({ type: 'zoom', d: -1 }) },
      { label: 'Actual Size', accelerator: 'CmdOrCtrl+0', click: () => run({ type: 'zoom', d: 0 }) },
      { type: 'separator' },
      { role: 'togglefullscreen' },
      { role: 'toggleDevTools' }
    ] },
    { role: 'windowMenu' }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(tpl));
}
