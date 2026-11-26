// The engine seam, enforced: everything a Chromium fork would reuse (the model, the formats, the
// shell) must not know Electron exists. Only src/main and src/preload may import it.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '..', 'src');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(n) ? [p] : []; });
}

const importsElectron = (p: string): boolean => /from\s+['"]electron['"]|require\(['"]electron['"]\)/.test(readFileSync(p, 'utf8'));

describe('engine seam', () => {
  it('keeps Electron out of src/shared and src/renderer', () => {
    const leaks = [...files(join(SRC, 'shared')), ...files(join(SRC, 'renderer'))].filter(importsElectron);
    expect(leaks).toEqual([]);
  });
  it('keeps the shell talking to the engine only through the preload bridge', () => {
    const direct = files(join(SRC, 'renderer')).filter((p) => /ipcRenderer|webContents|BrowserWindow/.test(readFileSync(p, 'utf8')));
    expect(direct).toEqual([]);
  });
  it('keeps src/shared free of engine and UI code', () => {
    const bad = files(join(SRC, 'shared')).filter((p) => /from\s+['"]\.\.\/(main|renderer|preload)\//.test(readFileSync(p, 'utf8')));
    expect(bad).toEqual([]);
  });
});
