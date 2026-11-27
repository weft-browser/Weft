// The engine seam, enforced. The model and the formats (src/shared) are pure: no DOM, no engine,
// no UI. The shell (src/renderer) reaches the engine only through window.weft. That is what let
// the same code run on Electron first and on the Chromium fork now, and what keeps it testable.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '..', 'src');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(n) ? [p] : []; });
}
const read = (p: string): string => readFileSync(p, 'utf8');

describe('engine seam', () => {
  it('keeps src/shared free of engine and UI code', () => {
    const bad = files(join(SRC, 'shared')).filter((p) => /from\s+['"](\.\.\/(renderer|main|preload)\/|electron|react)/.test(read(p)) || /\bchrome\.send\b|\bdocument\.|\bwindow\./.test(read(p)));
    expect(bad).toEqual([]);
  });
  it('keeps the shell talking to the engine only through window.weft', () => {
    const direct = files(join(SRC, 'renderer')).filter((p) => /\bchrome\.send\b|from\s+['"]electron['"]|ipcRenderer/.test(read(p)));
    expect(direct).toEqual([]);
    const bridge = files(join(SRC, 'renderer')).filter((p) => /window\.weft/.test(read(p))).map((p) => p.slice(SRC.length + 1));
    // The two places that hold the bridge; anything else goes through api.ts.
    expect(bridge.sort()).toEqual(['renderer/api.ts', 'renderer/components/Hud.tsx']);
  });
});
