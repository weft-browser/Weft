// The per-workspace environment file: <slug>.env.toml. Persisted data — a versioned contract.
import { parse as parseToml } from 'smol-toml';
import { DEFAULT_REGIONS, FPS, ICONS, NETS, iconPath, isHex, mkEnv, normHex, type Env, type Fingerprint, type Icon, type Network, type Workspace } from './model';

export interface EnvFile {
  name?: string;
  color?: string;
  icon?: string;
  network?: Network;
  region?: string;
  proxy?: string;
  locale?: string;
  timezone?: string;
  fingerprint?: Fingerprint;
  disposable?: boolean;
  start?: string[];
  pinned?: string[];
  ext: Record<string, boolean>;
  groups: Record<string, string[]>;
}

export type ParseResult = { ok: true; data: EnvFile } | { ok: false; error: string };

const q = (v: string): string => '"' + String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';

export function iconName(icon: Icon | null | undefined): string {
  if (!icon || icon.kind === 'letter') return 'letter';
  return icon.kind === 'svg' ? icon.id : 'custom';
}

export function serialize(w: Workspace): string {
  const e = w.env;
  const urls = w.tabs.map((t) => t.url).filter(Boolean);
  const lines = [
    '# ' + w.name + ' workspace environment',
    'name = ' + q(w.name),
    'color = ' + q(w.color) + '   # any hex, #RGB or #RRGGBB',
    'icon = ' + q(iconName(w.icon)) + '   # letter | custom | ' + ICONS.map((i) => i[0]).join(' | '),
    'network = ' + q(e.network) + '   # direct | vpn | proxy | tor',
    'region = ' + q(e.region),
    'proxy = ' + q(e.proxy),
    'locale = ' + q(e.locale),
    'timezone = ' + q(e.tz),
    'fingerprint = ' + q(e.fp) + '   # standard | randomized | strict',
    'disposable = ' + (e.disposable ? 'true' : 'false'),
    'start = [' + urls.map(q).join(', ') + ']',
    'pinned = [' + w.tabs.filter((t) => t.pinned && t.url).map((t) => q(t.url)).join(', ') + ']',
    '',
    '[extensions]'
  ];
  Object.keys(e.ext).forEach((n) => lines.push(q(n) + ' = ' + (e.ext[n] ? 'true' : 'false')));
  const gs = w.groups.filter((g) => w.tabs.some((t) => t.group === g.id));
  if (gs.length) {
    lines.push('', '[groups]   # "Group name" = [tab urls]');
    gs.forEach((g) => lines.push(q(g.name) + ' = [' + w.tabs.filter((t) => t.group === g.id && t.url).map((t) => q(t.url)).join(', ') + ']'));
  }
  return lines.join('\n') + '\n';
}

const isStrList = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');

export function parse(text: string, vpnRegions: string[] = DEFAULT_REGIONS): ParseResult {
  let raw: Record<string, unknown>;
  try {
    raw = parseToml(text) as Record<string, unknown>;
  } catch (e) {
    return { ok: false, error: (e as Error).message.split('\n')[0] ?? 'Could not read the file' };
  }
  const out: EnvFile = { ext: {}, groups: {} };
  const str = (k: string): string | undefined => {
    const v = raw[k];
    if (v === undefined) return undefined;
    if (typeof v !== 'string') throw new Error(k + ' must be "text"');
    return v;
  };
  try {
    out.name = str('name');
    out.color = str('color');
    out.icon = str('icon');
    out.network = str('network') as Network | undefined;
    out.region = str('region');
    out.proxy = str('proxy');
    out.locale = str('locale');
    out.timezone = str('timezone');
    out.fingerprint = str('fingerprint') as Fingerprint | undefined;
    if (raw.disposable !== undefined) {
      if (typeof raw.disposable !== 'boolean') throw new Error('disposable must be true or false');
      out.disposable = raw.disposable;
    }
    if (raw.start !== undefined) {
      if (!isStrList(raw.start)) throw new Error('start must be a [list] of urls');
      out.start = raw.start;
    }
    if (raw.pinned !== undefined) {
      if (!isStrList(raw.pinned)) throw new Error('pinned must be a [list] of urls');
      out.pinned = raw.pinned;
    }
    const ext = raw.extensions;
    if (ext !== undefined) {
      if (typeof ext !== 'object' || ext === null || Array.isArray(ext)) throw new Error('[extensions] must be a table');
      for (const [k, v] of Object.entries(ext as Record<string, unknown>)) {
        if (typeof v !== 'boolean') throw new Error('extensions take true or false: ' + k);
        out.ext[k] = v;
      }
    }
    const groups = raw.groups;
    if (groups !== undefined) {
      if (typeof groups !== 'object' || groups === null || Array.isArray(groups)) throw new Error('[groups] must be a table');
      for (const [k, v] of Object.entries(groups as Record<string, unknown>)) {
        if (!isStrList(v)) throw new Error('a group takes a [list] of tab urls: ' + k);
        out.groups[k] = v;
      }
    }
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  if (out.network && !NETS.includes(out.network)) return { ok: false, error: 'network must be direct, vpn, proxy or tor' };
  if (out.fingerprint && !FPS.includes(out.fingerprint)) return { ok: false, error: 'fingerprint must be standard, randomized or strict' };
  if (out.color && !isHex(out.color)) return { ok: false, error: 'color must be a hex value like #6aa9ff or #6af' };
  if (out.icon && out.icon !== 'letter' && out.icon !== 'custom' && !iconPath(out.icon)) return { ok: false, error: 'icon must be letter, custom or one of: ' + ICONS.map((i) => i[0]).join(', ') };
  if (out.network === 'vpn' && out.region && !vpnRegions.includes(out.region)) return { ok: false, error: 'region must be one of: ' + vpnRegions.join(', ') };
  return { ok: true, data: out };
}

export function cfgIcon(v: string | undefined, prev: Icon | null): Icon | null {
  if (!v) return prev;
  if (v === 'letter') return null;
  if (v === 'custom') return prev && prev.kind === 'img' ? prev : null;
  return { kind: 'svg', id: v };
}

/** Merge a parsed file over an existing environment (or over the defaults when there is none). */
export function envFromFile(d: EnvFile, prev: Env | null, extNames: string[]): Env {
  const p = prev ?? mkEnv(null, extNames);
  const ext = { ...p.ext };
  if (Object.keys(d.ext).length) Object.keys(ext).forEach((k) => { if (d.ext[k] === undefined) ext[k] = false; });
  Object.keys(d.ext).forEach((k) => { ext[k] = d.ext[k]!; });
  return {
    network: d.network ?? p.network,
    region: d.region ?? p.region,
    proxy: typeof d.proxy === 'string' ? d.proxy : p.proxy,
    locale: d.locale ?? p.locale,
    tz: d.timezone ?? p.tz,
    fp: d.fingerprint ?? p.fp,
    disposable: typeof d.disposable === 'boolean' ? d.disposable : p.disposable,
    ext
  };
}

export function colorFromFile(d: EnvFile, fallback: string): string {
  return d.color ? normHex(d.color) : fallback;
}
