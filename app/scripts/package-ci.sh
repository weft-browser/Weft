#!/usr/bin/env bash
#
# package-ci.sh — the CI entry point for a signed, notarized release build of Weft.
#
# Runs on a macOS runner (.github/workflows/release.yml). Signing is headless and leaves nothing
# behind. This script imports the Developer ID certificate into a throwaway keychain
# (rules/engineering.md § Secrets and releases), points electron-builder at it with CSC_KEYCHAIN
# and the identity's hash, and deletes it on exit, even on failure. Not CSC_LINK: electron-builder
# 26's own keychain import passes the .p12 password to set-key-partition-list where macOS wants the
# keychain's, and fails with "SecKeychainUnlock: The user name or passphrase you entered is not
# correct" (v0.1.0, 2026-11-08). Notarization goes through notarytool with the App Store Connect key.
#
# Credentials (secrets on the GitHub `release` environment):
#   APPLE_DEVID_CERT_P12_B64   Developer ID Application cert + key, .p12, base64
#   APPLE_DEVID_CERT_PASSWORD  its password
#   ASC_KEY_ID / ASC_ISSUER_ID / ASC_KEY_P8   App Store Connect API key (id, issuer, PEM text)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

missing=()
for v in APPLE_DEVID_CERT_P12_B64 APPLE_DEVID_CERT_PASSWORD ASC_KEY_ID ASC_ISSUER_ID ASC_KEY_P8; do
  [[ -n "${!v:-}" ]] || missing+=("$v")
done
if (( ${#missing[@]} )); then
  echo "error: missing CI variable(s): ${missing[*]}" >&2
  exit 1
fi

WORK="$(mktemp -d)"
KEYCHAIN="$WORK/weft-ci.keychain-db"
KEYCHAIN_PASS="$(uuidgen)"
cleanup() {
  local code=$?
  set +e
  security delete-keychain "$KEYCHAIN" 2>/dev/null
  security list-keychains -d user -s login.keychain 2>/dev/null
  rm -rf "$WORK"
  exit $code
}
trap cleanup EXIT

# A variable of type "file" arrives as a path; a plain variable arrives as its contents.
contents_of() { if [[ -f "$1" ]]; then cat "$1"; else printf '%s' "$1"; fi; }

contents_of "$ASC_KEY_P8" > "$WORK/AuthKey_${ASC_KEY_ID}.p8"
chmod 600 "$WORK/AuthKey_${ASC_KEY_ID}.p8"

contents_of "$APPLE_DEVID_CERT_P12_B64" | base64 -d > "$WORK/devid.p12"
security create-keychain -p "$KEYCHAIN_PASS" "$KEYCHAIN"
security set-keychain-settings -lut 7200 "$KEYCHAIN"   # don't lock mid-build
security unlock-keychain -p "$KEYCHAIN_PASS" "$KEYCHAIN"
security import "$WORK/devid.p12" -k "$KEYCHAIN" -P "$APPLE_DEVID_CERT_PASSWORD" -T /usr/bin/codesign -T /usr/bin/security
rm -f "$WORK/devid.p12"
# Without this, codesign blocks on a keychain prompt nobody answers.
security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$KEYCHAIN_PASS" "$KEYCHAIN" >/dev/null
security list-keychains -d user -s "$KEYCHAIN" login.keychain
# Walnut Labs' team only: no other identity in the certificate may ever sign a release.
SIGN_HASH="$(security find-identity -v -p codesigning "$KEYCHAIN" | awk '/Developer ID Application: .*\(DXJQ64BU3M\)/ {print $2; exit}')"
[[ -n "$SIGN_HASH" ]] || { echo "error: the imported certificate has no Developer ID Application identity for team DXJQ64BU3M" >&2; exit 1; }
echo "signing with $(security find-identity -v -p codesigning "$KEYCHAIN" | grep "$SIGN_HASH" | sed -E 's/.*"(.*)"/\1/')"
unset CSC_LINK CSC_KEY_PASSWORD
export CSC_KEYCHAIN="$KEYCHAIN" CSC_NAME="$SIGN_HASH"
export APPLE_API_KEY="$WORK/AuthKey_${ASC_KEY_ID}.p8"
export APPLE_API_KEY_ID="$ASC_KEY_ID"
export APPLE_API_ISSUER="$ASC_ISSUER_ID"
export CSC_FOR_PULL_REQUEST=false

# Version from $VERSION (the workflow reads it from package.json), which must be semver: the updater compares it. The build
# number (CFBundleVersion) is 1000 + the commit count: monotonic, never hand-set, never reused. The
# offset keeps it above every build shipped before the repository's history restarted (2026-11-26).
VERSION="${VERSION:-}"
BUILD="${BUILD:-$(( 1000 + $(git -C "$ROOT" rev-list --count HEAD) ))}"
[[ -n "$VERSION" ]] || { echo "error: VERSION is not set" >&2; exit 1; }
node "$ROOT/scripts/feed.mjs" semver "$VERSION" || { echo "error: tag version '$VERSION' is not semver (want vX.Y.Z)" >&2; exit 1; }
echo "packaging Weft $VERSION ($BUILD)"

cd "$ROOT"
npm ci
npm version --no-git-tag-version --allow-same-version "$VERSION" >/dev/null
npm run check
npm test
npx electron-vite build
# Apple-silicon (arm64) DMG and zip, signed, notarized and stapled; latest-mac.yml names the zip
# as the update payload. Nothing is uploaded here: scripts/publish.sh does that in the release job.
npx electron-builder --mac --publish never -c.mac.notarize=true -c.buildVersion="$BUILD"
ls -la dist/*.dmg dist/*.zip dist/latest-mac.yml
spctl -a -vvv -t install dist/mac-arm64/Weft.app
