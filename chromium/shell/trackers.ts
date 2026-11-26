// The tracker blocklist the engine enforces. A copy of HOSTS in app/src/main/trackers.ts,
// which does not export it (the Electron controller only needs isTracker()). The fork needs the
// list itself, to hand it to the browser process where requests are decided; the right fix is a
// CR to the app moving the list to src/shared and exporting it (weft-browser-app !3), then this
// file goes and controller.ts imports it by path. Until then: keep the two in step.
export const TRACKER_HOSTS = [
  'google-analytics.com', 'googletagmanager.com', 'googlesyndication.com', 'googleadservices.com', 'doubleclick.net', '2mdn.net', 'adservice.google.com',
  'facebook.net', 'connect.facebook.net', 'analytics.twitter.com', 'ads-twitter.com', 'analytics.tiktok.com', 'tr.snapchat.com', 'sc-static.net',
  'ct.pinterest.com', 'px.ads.linkedin.com', 'snap.licdn.com', 'bat.bing.com', 'clarity.ms', 'mc.yandex.ru',
  'scorecardresearch.com', 'quantserve.com', 'chartbeat.com', 'parsely.com', 'moatads.com',
  'hotjar.com', 'mixpanel.com', 'segment.io', 'segment.com', 'amplitude.com', 'fullstory.com', 'mouseflow.com', 'crazyegg.com', 'optimizely.com',
  'nr-data.net', 'branch.io', 'appsflyer.com', 'adjust.com', 'kochava.com',
  'adnxs.com', 'criteo.com', 'criteo.net', 'taboola.com', 'outbrain.com', 'pubmatic.com', 'rubiconproject.com', 'openx.net', 'casalemedia.com', 'adsrvr.org', 'bidswitch.net', 'media.net', 'adform.net'
];
