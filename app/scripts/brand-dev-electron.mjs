// In development the running binary is node_modules/electron/dist/Electron.app, and macOS takes
// the menu-bar title and the Dock label from THAT bundle's Info.plist, not from app.setName().
// This runs on postinstall and renames the dev bundle to Weft, with Weft's icon, then re-signs
// it ad hoc (Apple Silicon kills a bundle whose seal no longer matches). `npm ci` restores the
// pristine bundle, and the script runs again. Packaged builds never touch this.
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

if (process.platform !== 'darwin') process.exit(0);
const root = join(import.meta.dirname, '..');
const app = join(root, 'node_modules/electron/dist/Electron.app');
const plist = join(app, 'Contents/Info.plist');
const icns = join(root, 'build/icon.icns');
if (!existsSync(plist)) process.exit(0);

let text = readFileSync(plist, 'utf8');
if (text.includes('<string>Weft</string>')) process.exit(0);
const set = (key, value) => { text = text.replace(new RegExp(`(<key>${key}</key>\\s*<string>)[^<]*(</string>)`), `$1${value}$2`); };
set('CFBundleName', 'Weft');
set('CFBundleDisplayName', 'Weft');
set('CFBundleIdentifier', 'com.walnutlabs.weft.dev');
writeFileSync(plist, text);
if (existsSync(icns)) copyFileSync(icns, join(app, 'Contents/Resources/electron.icns'));
try {
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'ignore' });
  console.log('dev Electron.app rebranded as Weft');
} catch (e) {
  console.warn('could not re-sign the dev Electron.app: ' + e.message);
}
