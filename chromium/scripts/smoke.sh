#!/usr/bin/env bash
#
# smoke.sh — check a built Weft.app without a screen: bundle metadata, the icon, and that the
# browser starts, by running it headless and reading chrome://version and chrome://weft.
#
#   ./scripts/smoke.sh dev          # after ./scripts/build.sh dev
#
# Writes <out>/smoke/ (version.html, weft.png, weft.html). Exits non-zero on the first failure.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROFILE="${1:-dev}"
APP="$ROOT/chromium/src/out/$PROFILE/Weft.app"
[[ -d "$APP" ]] || { echo "error: no $APP; run ./scripts/build.sh $PROFILE" >&2; exit 1; }
PLIST="$APP/Contents/Info.plist"
BIN="$APP/Contents/MacOS/Weft"
OUT="$ROOT/chromium/src/out/$PROFILE/smoke"
mkdir -p "$OUT"
fail=0
check() { # <label> <actual> <expected>
  if [[ "$2" == "$3" ]]; then echo "ok    $1 = $2"; else echo "FAIL  $1 = $2 (expected $3)"; fail=1; fi
}
plist() { /usr/libexec/PlistBuddy -c "Print :$1" "$PLIST" 2>/dev/null || echo "<missing>"; }

echo "== bundle"
check CFBundleName          "$(plist CFBundleName)"          "Weft"
check CFBundleDisplayName   "$(plist CFBundleDisplayName)"   "Weft"
check CFBundleIdentifier    "$(plist CFBundleIdentifier)"    "com.walnutlabs.weft.chromium"
check CFBundleIconFile      "$(plist CFBundleIconFile)"      "app.icns"
check CFBundleIconName      "$(plist CFBundleIconName)"      "AppIcon"
check CFBundleExecutable    "$(plist CFBundleExecutable)"    "Weft"
echo "      CFBundleShortVersionString = $(plist CFBundleShortVersionString)"

echo "== icon"
R="$APP/Contents/Resources"
check "app.icns is Weft's"  "$(shasum -a 256 < "$R/app.icns" | cut -c1-16)" "$(shasum -a 256 < "$ROOT/brand/app.icns" | cut -c1-16)"
icons=$(assetutil --info "$R/Assets.car" 2>/dev/null | grep -c '"Name" : "AppIcon"' || true)
if (( icons > 0 )); then echo "ok    Assets.car carries AppIcon ($icons images)"; else echo "FAIL  Assets.car has no AppIcon"; fail=1; fi

echo "== launch (headless)"
# --allow-chrome-scheme-url: headless Chrome replaces chrome:// start URLs with the NTP without it.
# MacAppCodeSignClone off: a component build cannot run from the code-sign clone Chrome makes of
# its bundle (the dylibs live next to the bundle, not in it), and a launch occasionally did.
common=(--headless=new --allow-chrome-scheme-url --disable-features=MacAppCodeSignClone --no-first-run --no-default-browser-check --disable-gpu "--user-data-dir=$OUT/profile" --virtual-time-budget=4000 --window-size=1440,900)
if "$BIN" "${common[@]}" --dump-dom chrome://version > "$OUT/version.html" 2> "$OUT/version.log"; then
  product=$(sed -n 's/.*id="company">\([^<]*\)<.*/\1/p' "$OUT/version.html" | head -1)
  ua=$(sed -n 's/.*id="useragent">\([^<]*\)<.*/\1/p' "$OUT/version.html" | head -1)
  grep -q "Weft" "$OUT/version.html" && echo "ok    chrome://version names Weft (company: ${product:-?})" || { echo "FAIL  chrome://version does not say Weft"; fail=1; }
  echo "      user agent: ${ua:-?}"
else
  echo "FAIL  the browser did not start headless (see $OUT/version.log)"; fail=1
fi
if "$BIN" "${common[@]}" --dump-dom chrome://weft > "$OUT/weft.html" 2> "$OUT/weft.log"; then
  if grep -q 'class="shell' "$OUT/weft.html"; then echo "ok    chrome://weft rendered the shell"; else echo "note  chrome://weft is not registered in this build (expected before the shell patch)"; fi
  "$BIN" "${common[@]}" "--screenshot=$OUT/weft.png" chrome://weft >/dev/null 2>&1 || true
  [[ -f "$OUT/weft.png" ]] && echo "      screenshot: $OUT/weft.png"
fi
# Phase 2b: ?page=<url> makes the shell embed that page through surface embed. The screenshot
# is the proof: the page area shows the orange test page instead of the empty tab. It is taken
# by drive.mjs, because headless --screenshot shoots at the load event, before an embedded page
# has produced a frame. (No '#' in the data URL: GURL would read it as a fragment.)
spike='chrome://weft/?page=data:text/html,%3Cbody%20style%3D%22margin%3A0%3Bbackground%3Aorange%3Bcolor%3Ablack%3Bfont%3A48px%20sans-serif%22%3Eembedded%20page%3C%2Fbody%3E'
if "$BIN" "${common[@]}" --dump-dom "$spike" > "$OUT/weft-page.html" 2> "$OUT/weft-page.log" \
   && grep -q 'x-chromium-surface-embed' "$OUT/weft-page.html"; then
  echo "ok    chrome://weft?page= embeds a page (surface embed)"
  if [[ -d "$ROOT/../app/node_modules/playwright-core" ]] && command -v node >/dev/null; then
    node "$ROOT/scripts/drive.mjs" "$PROFILE" "$spike" --wait 3000 --out "$OUT/weft-page.png" >/dev/null 2>&1 \
      && echo "      screenshot: $OUT/weft-page.png (the page area should be orange)" \
      || { echo "FAIL  drive.mjs could not screenshot the embedded page"; fail=1; }
  else
    echo "note  no playwright-core in ../app; skipped the embed screenshot"
  fi
else
  echo "FAIL  chrome://weft?page= did not embed a page"; fail=1
fi
rm -rf "$OUT/profile"
(( fail == 0 )) && echo "smoke: all checks passed" || { echo "smoke: FAILED" >&2; exit 1; }
