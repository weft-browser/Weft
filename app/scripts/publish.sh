#!/usr/bin/env bash
#
# publish.sh — put a packaged release on the updates bucket (maintainer-run infrastructure),
# served at https://updates.weftbrowser.com/.
#
# Runs in the `release` CI job after `package`, with short-lived AWS credentials from GitHub OIDC
# (no stored keys). Reads dist/ as electron-builder left it: latest-mac.yml plus the arm64 .zip
# (the update payload), the .dmg (first installs) and their .blockmap files (delta downloads).
#
# Order matters, so a running Weft never sees a feed that points at a file that is not there:
#   1. downgrade guard: refuse unless the new version is strictly greater than the live feed's;
#   2. versioned files, each under an S3 Object Lock COMPLIANCE retention (a published build can
#      never be replaced or deleted, not even by the account root);
#   3. latest-mac.yml, which is the switch that makes running copies update (versioned, not locked,
#      since it changes every release; served no-cache);
#   4. Weft.dmg, the fixed download link the website points at (overwritten, so not locked).
#
# Env: WEFT_UPDATES_BUCKET (default weft-updates), OBJECT_LOCK_DAYS (default 730), DRY_RUN=1 to print
# the uploads without making them.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIST="$ROOT/dist"
BUCKET="${WEFT_UPDATES_BUCKET:-weft-updates}"
LOCK_DAYS="${OBJECT_LOCK_DAYS:-730}"
PUBLIC="${WEFT_UPDATES_URL:-https://updates.weftbrowser.com}"
FEED="$DIST/latest-mac.yml"
say() { echo "publish: $*"; }
run() { if [[ -n "${DRY_RUN:-}" ]]; then echo "+ $*"; else "$@"; fi; }

[[ -f "$FEED" ]] || { echo "error: $FEED missing; run package first" >&2; exit 1; }

# 1. Downgrade guard against what is live right now, read from the bucket itself (not the CDN, which
#    could serve a stale copy). The publish role may list the bucket, so a missing feed is NoSuchKey
#    (a first release); anything else is refused rather than published blind.
LIVE="$(mktemp)"; ERR="$(mktemp)"; trap 'rm -f "$LIVE" "$ERR"' EXIT
if [[ -n "${DRY_RUN:-}" ]]; then
  : > "$LIVE"
elif ! aws s3api get-object --bucket "$BUCKET" --key latest-mac.yml "$LIVE" >/dev/null 2>"$ERR"; then
  if grep -q NoSuchKey "$ERR"; then : > "$LIVE"; else cat "$ERR" >&2; echo "error: could not read the live feed; refusing to publish blind" >&2; exit 1; fi
fi
node "$ROOT/scripts/feed.mjs" guard "$FEED" "$LIVE"

RETAIN_UNTIL="$(date -u -v+"${LOCK_DAYS}"d '+%Y-%m-%dT%H:%M:%SZ' 2>/dev/null || date -u -d "+${LOCK_DAYS} days" '+%Y-%m-%dT%H:%M:%SZ')"

type_of() {
  case "$1" in
    *.dmg) echo application/x-apple-diskimage ;;
    *.zip) echo application/zip ;;
    *.yml) echo text/yaml ;;
    *) echo application/octet-stream ;;
  esac
}

# 2. Every file the feed names, plus its blockmap, locked.
DMG=""
while IFS= read -r f; do
  [[ -n "$f" ]] || continue
  for g in "$f" "$f.blockmap"; do
    [[ -f "$DIST/$g" ]] || { [[ "$g" == *.blockmap ]] && continue; echo "error: feed names $g, not in dist/" >&2; exit 1; }
    run aws s3 cp "$DIST/$g" "s3://$BUCKET/$g" --content-type "$(type_of "$g")" --cache-control 'public, max-age=31536000, immutable'
    run aws s3api put-object-retention --bucket "$BUCKET" --key "$g" --retention "Mode=COMPLIANCE,RetainUntilDate=$RETAIN_UNTIL"
  done
  [[ "$f" == *.dmg ]] && DMG="$f"
done < <(node "$ROOT/scripts/feed.mjs" files "$FEED")

# 3. The feed itself, last of the update files.
run aws s3 cp "$FEED" "s3://$BUCKET/latest-mac.yml" --content-type text/yaml --cache-control 'no-cache'

# 4. The website's download link.
[[ -n "$DMG" ]] || { echo "error: feed names no .dmg for the download link" >&2; exit 1; }
run aws s3 cp "$DIST/$DMG" "s3://$BUCKET/Weft.dmg" --content-type application/x-apple-diskimage --cache-control 'no-cache' \
  --content-disposition 'attachment; filename="Weft.dmg"'

say "published $(node "$ROOT/scripts/feed.mjs" version "$FEED") to $PUBLIC (locked until $RETAIN_UNTIL; download link $PUBLIC/Weft.dmg)"
