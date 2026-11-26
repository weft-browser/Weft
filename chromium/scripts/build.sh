#!/usr/bin/env bash
#
# build.sh — gn gen + autoninja for the Weft fork.
#
#   ./scripts/build.sh dev        # component build, no symbols: fastest edit-build loop
#   ./scripts/build.sh release    # official build: what ships, much slower
#
# Output: chromium/src/out/<profile>/Weft.app
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROFILE="${1:-dev}"
ARGS="$ROOT/args/$PROFILE.gn"
[[ -f "$ARGS" ]] || { echo "error: no args/$PROFILE.gn" >&2; exit 1; }
export PATH="$ROOT/depot_tools:$PATH"
export DEPOT_TOOLS_UPDATE=0
export DEPOT_TOOLS_METRICS=0   # no usage reporting to Google from a Weft build box

# Xcode 26+ ships without the Metal compiler; ANGLE's Metal shaders need it, and the build only
# finds out a minute in. Check up front (xcrun metal --version fails with "missing Metal Toolchain").
# After installing, xcrun still answers from its cache until it is cleared.
xcrun metal --version >/dev/null 2>&1 \
  || { echo "error: the Metal Toolchain is not installed; run: xcodebuild -downloadComponent MetalToolchain && xcrun --kill-cache" >&2; exit 1; }

cd "$ROOT/chromium/src"
mkdir -p "out/$PROFILE"
cp "$ARGS" "out/$PROFILE/args.gn"
gn gen "out/$PROFILE"
autoninja -C "out/$PROFILE" chrome
ls -d "out/$PROFILE"/*.app
