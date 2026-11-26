#!/usr/bin/env bash
#
# build-shell.sh — bundle the Weft shell for chrome://weft.
#
# The shell is ../app/src/renderer, reused by path (root AGENTS.md: the fork
# reuses the shell, it does not port it). This bundles it with the app's own vite and
# dependencies into chromium/src/chrome/browser/resources/weft/dist/, which the Weft WebUI's GN
# target packs. apply.sh runs this; run it alone after editing the shell.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="$ROOT/../app"
[[ -d "$APP/src/renderer" ]] || { echo "error: $APP is missing; clone the whole weft repo" >&2; exit 1; }
[[ -x "$APP/node_modules/.bin/vite" ]] || { echo "error: $APP has no node_modules; run: (cd $APP && ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm ci)" >&2; exit 1; }

"$APP/node_modules/.bin/vite" build --config "$ROOT/shell/vite.config.mjs" --logLevel warn
out="$ROOT/chromium/src/chrome/browser/resources/weft/dist"
for f in index.html shell.js style.css; do [[ -f "$out/$f" ]] || { echo "error: expected $out/$f" >&2; exit 1; }; done
echo "shell bundled: $(du -sh "$out" | cut -f1) in chrome/browser/resources/weft/dist"
