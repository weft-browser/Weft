// A small, readable tracker blocklist. Third-party requests to these hosts are cancelled
// while a site's protection is on. Deliberately a list, not a filter-list engine: it has to
// be explainable in the privacy panel.
//
// Shared, not main-only: the Electron controller decides requests in Node with isTracker(),
// but the Chromium fork decides them in the browser process and needs the list itself.

export const TRACKER_HOSTS: readonly string[] = [
  'google-analytics.com', 'googletagmanager.com', 'googlesyndication.com', 'googleadservices.com', 'doubleclick.net', '2mdn.net', 'adservice.google.com',
  'facebook.net', 'connect.facebook.net', 'analytics.twitter.com', 'ads-twitter.com', 'analytics.tiktok.com', 'tr.snapchat.com', 'sc-static.net',
  'ct.pinterest.com', 'px.ads.linkedin.com', 'snap.licdn.com', 'bat.bing.com', 'clarity.ms', 'mc.yandex.ru',
  'scorecardresearch.com', 'quantserve.com', 'chartbeat.com', 'parsely.com', 'moatads.com',
  'hotjar.com', 'mixpanel.com', 'segment.io', 'segment.com', 'amplitude.com', 'fullstory.com', 'mouseflow.com', 'crazyegg.com', 'optimizely.com',
  'nr-data.net', 'branch.io', 'appsflyer.com', 'adjust.com', 'kochava.com',
  'adnxs.com', 'criteo.com', 'criteo.net', 'taboola.com', 'outbrain.com', 'pubmatic.com', 'rubiconproject.com', 'openx.net', 'casalemedia.com', 'adsrvr.org', 'bidswitch.net', 'media.net', 'adform.net'
];

const SET = new Set(TRACKER_HOSTS);

export function isTracker(host: string): boolean {
  const parts = host.toLowerCase().split('.');
  for (let i = 0; i < parts.length - 1; i++) if (SET.has(parts.slice(i).join('.'))) return true;
  return false;
}

const SECOND_LEVEL = new Set(['co', 'com', 'org', 'net', 'gov', 'ac', 'edu']);

/** A rough registrable domain: `a.b.example.co.uk` → `example.co.uk`. Enough for first- vs third-party. */
export function siteOf(host: string): string {
  const parts = host.toLowerCase().split('.');
  if (parts.length <= 2) return parts.join('.');
  const n = SECOND_LEVEL.has(parts[parts.length - 2]!) && parts[parts.length - 1]!.length === 2 ? 3 : 2;
  return parts.slice(-n).join('.');
}

export function isThirdParty(requestHost: string, topHost: string): boolean {
  return !!topHost && siteOf(requestHost) !== siteOf(topHost);
}
