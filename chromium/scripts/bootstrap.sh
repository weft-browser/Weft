#!/usr/bin/env bash
#
# bootstrap.sh — one-time setup: depot_tools, then a Chromium checkout at the pinned version.
#
# Puts depot_tools in ./depot_tools and the checkout in ./chromium/src (both git-ignored).
# Uses a no-history fetch (~35 GB instead of ~100 GB) because this repo only ever builds the
# pinned tag; history is fetched per-file when a patch needs it. Safe to re-run.
#
#   ./scripts/bootstrap.sh            # refuses with less than 100 GB free
#   WEFT_FORCE=1 ./scripts/bootstrap.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="$(tr -d '[:space:]' < "$ROOT/CHROMIUM_VERSION")"
NEED_GB=100

free_gb="$(df -g "$ROOT" | awk 'NR==2 {print $4}')"
if (( free_gb < NEED_GB )) && [[ -z "${WEFT_FORCE:-}" ]]; then
  echo "error: ${free_gb} GB free; a Chromium checkout plus one build needs about ${NEED_GB} GB." >&2
  echo "       free space, or set WEFT_FORCE=1 to try anyway." >&2
  exit 1
fi
xcode-select -p | grep -q Xcode.app || { echo "error: full Xcode is required (xcode-select -s /Applications/Xcode.app)" >&2; exit 1; }

if [[ ! -x "$ROOT/depot_tools/gclient" ]]; then
  git clone --depth 1 https://chromium.googlesource.com/chromium/tools/depot_tools.git "$ROOT/depot_tools"
fi
export PATH="$ROOT/depot_tools:$PATH"
# depot_tools installs its own python3, cipd and friends on first use, through its update step.
# Run that once explicitly, then switch self-updates off so every run uses the same tools.
# (Setting DEPOT_TOOLS_UPDATE=0 before this point skips the install too: "python3_bin_reldir.txt
# not found. need to initialize depot_tools".)
if [[ ! -f "$ROOT/depot_tools/python3_bin_reldir.txt" ]]; then
  "$ROOT/depot_tools/ensure_bootstrap"
fi
export DEPOT_TOOLS_UPDATE=0
export DEPOT_TOOLS_METRICS=0   # no usage reporting to Google from a Weft build box

mkdir -p "$ROOT/chromium"
cd "$ROOT/chromium"
if [[ ! -d src/.git ]]; then
  fetch --nohooks --no-history chromium
fi

cd src
echo "checking out $VERSION"
git fetch --depth 1 origin "refs/tags/$VERSION:refs/tags/$VERSION"
git checkout -q --force "tags/$VERSION"
gclient sync -D --force --with_branch_heads --with_tags --no-history
gclient runhooks

echo "ready: chromium/src at $VERSION — next: ./scripts/apply.sh && ./scripts/build.sh dev"
