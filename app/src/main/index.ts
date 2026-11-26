import { app, nativeImage } from 'electron';
import { autoUpdater } from 'electron-updater';
import { join, resolve } from 'node:path';
import { Browser } from './browser';

app.setName('Weft');
// Everything Chromium writes (partitions, caches) lives under one folder, which WEFT_DATA_DIR
// relocates wholesale: a second instance on another folder is a separate browser, not a duplicate.
// A dev run keeps its own folder, so it can sit next to an installed Weft.app instead of losing the
// single-instance lock to it and quitting silently.
app.setPath('userData', process.env.WEFT_DATA_DIR ? resolve(process.env.WEFT_DATA_DIR) : join(app.getPath('appData'), app.isPackaged ? 'Weft' : 'Weft Dev'));

if (!app.requestSingleInstanceLock()) app.quit();

// A packaged Weft.app carries its own icon and name; in dev the binary is still Electron.app, so
// the Dock gets the icon by hand (the Dock label stays "Electron" until packaged).
if (!app.isPackaged && process.platform === 'darwin') {
  const icon = nativeImage.createFromPath(join(app.getAppPath(), 'resources/icon.png'));
  if (!icon.isEmpty()) app.dock?.setIcon(icon);
}

app.whenReady().then(() => {
  const browser = new Browser({
    shellPreload: join(__dirname, '../preload/index.js'),
    tabPreload: join(__dirname, '../preload/tab.js'),
    version: app.getVersion(),
    // Only a packaged, signed macOS build has a feed (app-update.yml) and can swap itself in place.
    // WEFT_NO_UPDATES=1 turns it off, e.g. for a build under test.
    updates: app.isPackaged && process.platform === 'darwin' && !process.env.WEFT_NO_UPDATES ? autoUpdater : null
  });
  browser.start();
  app.on('will-quit', () => browser.shutdown());
});

app.on('window-all-closed', () => app.quit());
