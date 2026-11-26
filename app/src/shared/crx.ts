// The pure half of a Chrome Web Store install: id parsing, the update-service URL, CRX → zip.

const ID = /\b([a-p]{32})\b/;

/** A Web Store URL, or a bare 32-letter id. */
export function extensionId(ref: string): string | null {
  const m = ID.exec(ref.trim());
  return m ? m[1]! : null;
}

export function crxUrl(id: string, chromeVersion: string): string {
  return 'https://clients2.google.com/service/update2/crx?response=redirect&prodversion=' + encodeURIComponent(chromeVersion) + '&acceptformat=crx3&x=' + encodeURIComponent('id=' + id + '&uc');
}

/** The zip inside a CRX ("Cr24", version, lengths, header, zip). A bare zip is passed through. */
export function crxToZip(buf: Uint8Array): Uint8Array {
  if (buf.length < 16 || String.fromCharCode(buf[0]!, buf[1]!, buf[2]!, buf[3]!) !== 'Cr24') return buf;
  const u32 = (o: number): number => (buf[o]! | (buf[o + 1]! << 8) | (buf[o + 2]! << 16) | (buf[o + 3]! << 24)) >>> 0;
  const version = u32(4);
  if (version === 3) return buf.subarray(12 + u32(8));
  if (version === 2) return buf.subarray(16 + u32(8) + u32(12));
  return buf;
}

/** manifest `name` can point at a locale message: `__MSG_appName__`. */
export function messageKey(name: string): string | null {
  const m = /^__MSG_(.+)__$/.exec(name);
  return m ? m[1]! : null;
}

export function folderName(name: string): string {
  return name.replace(/[/\\:*?"<>|]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60) || 'Extension';
}
