#!/usr/bin/env bash
#
# new-patch.sh — turn the uncommitted edits in chromium/src into patches/NNNN-<name>.patch.
#
#   (edit files in chromium/src)
#   ./scripts/new-patch.sh workspace-profiles
#
# Branding files and the bundled shell are excluded: apply.sh owns them. One patch = one Weft
# feature, so a version bump that breaks one feature names it. The diff is against HEAD, which
# apply.sh keeps at "the tag plus every patch so far" (one local commit per patch).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NAME="${1:?usage: new-patch.sh <name>}"
cd "$ROOT/chromium/src"
shopt -s nullglob
existing=("$ROOT"/patches/*.patch)   # not `ls | wc -l`: with no patches that pipeline fails and set -e exits silently
n=$(( ${#existing[@]} + 1 ))
out="$ROOT/patches/$(printf '%04d' "$n")-$NAME.patch"
# (':!chromium' guards against a stray nested checkout path from a tool run with the wrong cwd.)
git add -A -- . ':!chrome/app/theme/chromium' ':!chrome/browser/resources/weft/dist' ':!chromium'
git diff --cached --binary > "$out"
[[ -s "$out" ]] || { git reset -q; rm -f "$out"; echo "error: no changes to capture" >&2; exit 1; }
# Commit it locally, as apply.sh does for every patch, so the next new-patch.sh sees only what
# comes after this one. HEAD in chromium/src is always "the tag plus the patch series".
git -c user.name=Weft -c user.email=weft@walnutlabs.xyz commit -q --no-verify -m "$(basename "$out" .patch)"
echo "wrote $(basename "$out") ($(grep -c '^diff --git' "$out") files)"
