import { describe, expect, it } from 'vitest';
import { crxToZip, crxUrl, extensionId, folderName, messageKey } from '../src/shared/crx';

describe('Chrome Web Store references', () => {
  it('finds the id in a store link, a bare id, or nothing', () => {
    expect(extensionId('https://chromewebstore.google.com/detail/ublock-origin-lite/ddkjiahejlhfcafbddmgiahcphecmpfh')).toBe('ddkjiahejlhfcafbddmgiahcphecmpfh');
    expect(extensionId('https://chromewebstore.google.com/detail/ddkjiahejlhfcafbddmgiahcphecmpfh?hl=en')).toBe('ddkjiahejlhfcafbddmgiahcphecmpfh');
    expect(extensionId('  ddkjiahejlhfcafbddmgiahcphecmpfh ')).toBe('ddkjiahejlhfcafbddmgiahcphecmpfh');
    expect(extensionId('https://example.com/not-an-extension')).toBeNull();
    expect(extensionId('zzkjiahejlhfcafbddmgiahcphecmpfh')).toBeNull();
  });
  it('asks the update service for a CRX3 of that id', () => {
    const u = crxUrl('ddkjiahejlhfcafbddmgiahcphecmpfh', '130.0.0.0');
    expect(u).toContain('acceptformat=crx3');
    expect(u).toContain('prodversion=130.0.0.0');
    expect(decodeURIComponent(u)).toContain('id=ddkjiahejlhfcafbddmgiahcphecmpfh&uc');
  });
});

describe('CRX unpacking', () => {
  const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 9, 9, 9]);
  const le = (n: number): number[] => [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255];
  it('strips a CRX3 header', () => {
    const header = new Uint8Array([1, 2, 3, 4, 5]);
    const crx = new Uint8Array([...'Cr24'].map((c) => c.charCodeAt(0)).concat(le(3), le(header.length), [...header], [...zip]));
    expect([...crxToZip(crx)]).toEqual([...zip]);
  });
  it('strips a CRX2 header', () => {
    const key = [7, 7], sig = [8, 8, 8];
    const crx = new Uint8Array([...'Cr24'].map((c) => c.charCodeAt(0)).concat(le(2), le(key.length), le(sig.length), key, sig, [...zip]));
    expect([...crxToZip(crx)]).toEqual([...zip]);
  });
  it('passes a bare zip and junk through untouched', () => {
    expect(crxToZip(zip)).toBe(zip);
    const tiny = new Uint8Array([1, 2]);
    expect(crxToZip(tiny)).toBe(tiny);
  });
});

describe('extension names', () => {
  it('spots a localized manifest name', () => {
    expect(messageKey('__MSG_appName__')).toBe('appName');
    expect(messageKey('Dark Reader')).toBeNull();
  });
  it('makes a safe folder name', () => {
    expect(folderName('uBlock Origin Lite')).toBe('uBlock Origin Lite');
    expect(folderName('  a/b:c*d?e"f<g>h|i  ')).toBe('abcdefghi');
    expect(folderName('')).toBe('Extension');
    expect(folderName('x'.repeat(100))).toHaveLength(60);
  });
});
