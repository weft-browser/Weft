// Install an extension from the Chrome Web Store into the unpacked-extensions folder.
// Chrome's update service hands out the CRX for an id; a CRX is a small header followed by a
// plain zip, so the archive is unpacked with the OS tool and loaded like any unpacked extension.
import { net } from 'electron';
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { crxToZip, crxUrl, extensionId, folderName, messageKey } from '../shared/crx';

const run = promisify(execFile);

/** manifest.json `name`, with the `__MSG_key__` indirection resolved from _locales. */
export function extensionName(dir: string): string {
  const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as { name?: string; default_locale?: string };
  const name = manifest.name ?? 'Extension';
  const key = messageKey(name);
  if (!key) return name.trim();
  for (const loc of [manifest.default_locale ?? 'en', 'en', 'en_US']) {
    const f = join(dir, '_locales', loc, 'messages.json');
    if (!existsSync(f)) continue;
    const msgs = JSON.parse(readFileSync(f, 'utf8')) as Record<string, { message?: string }>;
    const hit = msgs[key]?.message;
    if (hit) return hit.trim();
  }
  return name.trim();
}

async function unzip(zip: string, dest: string): Promise<void> {
  if (process.platform === 'darwin') await run('ditto', ['-x', '-k', zip, dest]);
  else await run('unzip', ['-q', '-o', zip, '-d', dest]);
}

/** Downloads, unpacks into `extensionsDir/<name>` and returns the folder name. Throws with a readable message. */
export async function installFromWebStore(ref: string, extensionsDir: string, chromeVersion: string): Promise<string> {
  const id = extensionId(ref);
  if (!id) throw new Error('That is not a Chrome Web Store link or extension id');
  const res = await net.fetch(crxUrl(id, chromeVersion), { redirect: 'follow' });
  if (!res.ok) throw new Error('The Web Store answered ' + res.status + ' for ' + id + (res.status === 204 ? ' (no such extension, or it is not published)' : ''));
  const crx = new Uint8Array(await res.arrayBuffer());
  if (!crx.length) throw new Error('The Web Store returned nothing for ' + id);
  const work = join(tmpdir(), 'weft-crx-' + id + '-' + Date.now());
  mkdirSync(work, { recursive: true });
  try {
    const zip = join(work, id + '.zip');
    writeFileSync(zip, crxToZip(crx));
    const unpacked = join(work, 'unpacked');
    mkdirSync(unpacked);
    await unzip(zip, unpacked);
    if (!existsSync(join(unpacked, 'manifest.json'))) throw new Error('The download had no manifest.json; not an extension');
    const name = folderName(extensionName(unpacked));
    const dest = join(extensionsDir, name);
    rmSync(dest, { recursive: true, force: true });
    mkdirSync(extensionsDir, { recursive: true });
    await run('cp', ['-R', unpacked, dest]);
    writeFileSync(join(dest, '.webstore-id'), id + '\n');
    return name;
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}
