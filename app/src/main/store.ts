// Disk I/O for the main process: state.json, env files, vpn.toml, the extensions folder.
import { app } from 'electron';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parse as parseToml } from 'smol-toml';

export interface Paths { root: string; state: string; workspaces: string; extensions: string; vpn: string; vpnDir: string; }

export function paths(): Paths {
  const env = process.env.WEFT_DATA_DIR;
  const root = env ? resolve(env) : app.getPath('userData');
  return { root, state: join(root, 'state.json'), workspaces: join(root, 'workspaces'), extensions: join(root, 'extensions'), vpn: join(root, 'vpn.toml'), vpnDir: join(root, 'vpn') };
}

export function ensureDirs(p: Paths): void {
  for (const d of [p.root, p.workspaces, p.extensions]) mkdirSync(d, { recursive: true });
  mkdirSync(p.vpnDir, { recursive: true, mode: 0o700 });
}

/** The raw JSON, or null when there is none. A file that does not parse is set aside, never silently dropped. */
export function readSnapshot(p: Paths): unknown | null {
  if (!existsSync(p.state)) return null;
  const text = readFileSync(p.state, 'utf8');
  try {
    return JSON.parse(text);
  } catch (e) {
    const aside = p.state + '.corrupt-' + Date.now();
    renameSync(p.state, aside);
    console.error(`state.json could not be parsed (${(e as Error).message}); moved to ${aside}`);
    return null;
  }
}

export function writeSnapshot(p: Paths, snapshot: unknown): void {
  const tmp = p.state + '.tmp';
  writeFileSync(tmp, JSON.stringify(snapshot, null, 2));
  renameSync(tmp, p.state);
}

/** `"Zurich, CH" = "socks5://host:port"` per line. Missing file = no regions configured. */
export function readVpn(p: Paths): Record<string, string> {
  if (!existsSync(p.vpn)) return {};
  try {
    const raw = parseToml(readFileSync(p.vpn, 'utf8'));
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw)) if (typeof v === 'string' && v) out[k] = v;
    return out;
  } catch (e) {
    console.error(`vpn.toml could not be parsed: ${(e as Error).message}`);
    return {};
  }
}

/** Unpacked extensions: every folder under extensions/ that has a manifest.json. */
export function listExtensions(p: Paths): string[] {
  if (!existsSync(p.extensions)) return [];
  return readdirSync(p.extensions, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(p.extensions, d.name, 'manifest.json')))
    .map((d) => d.name)
    .sort();
}

export function writeEnvFile(p: Paths, file: string, text: string): void {
  writeFileSync(join(p.workspaces, file), text);
}

export function removeEnvFile(p: Paths, file: string): void {
  rmSync(join(p.workspaces, file), { force: true });
}
