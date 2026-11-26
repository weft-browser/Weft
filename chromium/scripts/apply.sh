#!/usr/bin/env bash
#
# apply.sh — make a pristine chromium/src into Weft: reset it to the pinned tag, apply the
# branding, then every patch in patches/ in name order. Idempotent: it always starts clean,
# so the patch series is the only source of truth for what Weft changes in Chromium.
#
# Branding is applied by rewriting keys rather than replacing files, so a new upstream key in
# BRANDING does not get silently dropped on a version bump.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/chromium/src"
VERSION="$(tr -d '[:space:]' < "$ROOT/CHROMIUM_VERSION")"
[[ -d "$SRC/.git" ]] || { echo "error: no checkout; run ./scripts/bootstrap.sh first" >&2; exit 1; }

cd "$SRC"
git checkout -q --force "tags/$VERSION"
git clean -q -fd -- chrome/app/theme/chromium   # only our branding targets; never a blanket clean

# ── branding ────────────────────────────────────────────────────────────────
B=chrome/app/theme/chromium/BRANDING
set_key() { if grep -q "^$1=" "$B"; then sed -i '' "s|^$1=.*|$1=$2|" "$B"; else echo "$1=$2" >> "$B"; fi; }
set_key COMPANY_FULLNAME "Walnut Labs LLC"
set_key COMPANY_SHORTNAME "Walnut Labs"
set_key PRODUCT_FULLNAME "Weft"
set_key PRODUCT_SHORTNAME "Weft"
set_key PRODUCT_INSTALLER_FULLNAME "Weft Installer"
set_key PRODUCT_INSTALLER_SHORTNAME "Weft Installer"
set_key COPYRIGHT "Copyright @LASTCHANGE_YEAR@ Walnut Labs LLC. All rights reserved."
set_key MAC_BUNDLE_ID "com.walnutlabs.weft.chromium"
set_key MAC_TEAM_ID "DXJQ64BU3M"
cp "$ROOT/brand/app.icns" chrome/app/theme/chromium/mac/app.icns
for s in 16 22 24 32 48 64 128 256; do
  f="chrome/app/theme/chromium/product_logo_$s.png"
  [[ -f "$f" ]] && sips -z "$s" "$s" "$ROOT/brand/product_logo_1024.png" --out "$f" >/dev/null
done

# ── macOS asset catalogue ───────────────────────────────────────────────────
# Since 158 the app bundle carries a compiled Assets.car next to app.icns, and Info.plist names
# it (CFBundleIconName=AppIcon). macOS 26+ shows the catalogue icon and ignores app.icns, so the
# catalogue is recompiled from the upstream .xcassets with Weft's artwork in place of Chromium's.
# The catalogue also holds "Icon", the badge on Weft's document types. Chromium's layered
# AppIcon.icon (Icon Composer) is not used; a Weft one is a follow-up (plan.md).
MAC=chrome/app/theme/chromium/mac
target="$(sed -n 's/^ *mac_deployment_target = "\(.*\)"/\1/p' build/config/mac/mac_sdk.gni | head -1)"
work="$(mktemp -d)"
cp -R "$MAC/Assets.xcassets" "$work/"
for s in 16 32 64 128 256 512 1024; do
  sips -z "$s" "$s" "$ROOT/brand/product_logo_1024.png" --out "$work/Assets.xcassets/AppIcon.appiconset/appicon_$s.png" >/dev/null
done
sips -z 256 256 "$ROOT/brand/product_logo_1024.png" --out "$work/Assets.xcassets/Icon.iconset/icon_256x256.png" >/dev/null
sips -z 512 512 "$ROOT/brand/product_logo_1024.png" --out "$work/Assets.xcassets/Icon.iconset/icon_256x256@2x.png" >/dev/null
mkdir "$work/out"
xcrun actool --compile "$work/out" --platform macosx --minimum-deployment-target "${target:-13.0}" \
  --app-icon AppIcon --output-partial-info-plist "$work/partial.plist" \
  --output-format human-readable-text "$work/Assets.xcassets" >"$work/actool.log" 2>&1 \
  || { cat "$work/actool.log" >&2; echo "error: actool failed to compile the Weft asset catalogue" >&2; exit 1; }
cp "$work/out/Assets.car" "$MAC/Assets.car"
rm -rf "$work"

# ── the shell ───────────────────────────────────────────────────────────────
# chrome://weft serves the React shell from ../app, bundled into the checkout. The
# bundle is build output, not a patch: new-patch.sh leaves it out and this rebuilds it every time.
"$ROOT/scripts/build-shell.sh"

# ── patches ─────────────────────────────────────────────────────────────────
shopt -s nullglob
patches=("$ROOT"/patches/*.patch)
for p in "${patches[@]}"; do
  echo "applying $(basename "$p")"
  # Files a patch adds linger untracked from the previous apply (checkout --force only resets
  # tracked files) and would make it fail; remove exactly those. Never a blanket `git clean`:
  # DEPS-managed directories are untracked too.
  added=()
  while IFS= read -r f; do added+=("$f"); done < <(sed -n 's|^+++ b/||p' "$p")
  (( ${#added[@]} )) && git clean -q -fd -- "${added[@]}"
  git apply --3way --whitespace=nowarn "$p" || { echo "error: $(basename "$p") does not apply to $VERSION; rebase it" >&2; exit 1; }
  # Each patch becomes a local commit in the disposable checkout, so the working tree's diff
  # against HEAD is only what is not yet a patch: that is what new-patch.sh captures.
  git add -A -- . ':!chrome/app/theme/chromium' ':!chrome/browser/resources/weft/dist'
  git -c user.name=Weft -c user.email=weft@walnutlabs.xyz commit -q --no-verify -m "$(basename "$p" .patch)"
done
echo "chromium/src is Weft at $VERSION (${#patches[@]} patches)"
