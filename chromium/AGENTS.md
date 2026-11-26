# AGENTS.md — chromium

Weft as a **Chromium fork**. Product context, and the decision to build for this fork, are
in the root [`AGENTS.md`](../AGENTS.md) (§ "Electron now, a Chromium fork later"). The Electron
app in `../app` stays the shipping product until this repo reaches parity; this is the
side track.

## How this repo is shaped (the Brave model)

This repo does **not** contain Chromium. It contains what makes Chromium into Weft, plus the
scripts that fetch a pinned Chromium and apply it:

| Path | What |
|---|---|
| `CHROMIUM_VERSION` | the upstream tag everything here applies to (a stable release) |
| `scripts/bootstrap.sh` | depot_tools + a no-history checkout at that tag into `chromium/src` (git-ignored) |
| `scripts/apply.sh` | resets `chromium/src` to the tag, applies branding, then `patches/*.patch` in order |
| `scripts/build.sh dev\|release` | `gn gen` with `args/<profile>.gn`, then `autoninja chrome` |
| `scripts/smoke.sh dev\|release` | checks a built `Weft.app` without a screen: bundle keys, icon, headless launch, `chrome://weft` |
| `scripts/build-shell.sh` | bundles the React shell from `../app/src/renderer` into the checkout for `chrome://weft` (`apply.sh` runs it) |
| `scripts/drive.mjs [dev\|release] <url>` | opens a URL in the built app headless through Playwright (from the app's `node_modules`), waits, screenshots, prints console and CDP targets; `--eval js` runs a check in the page |
| `scripts/new-patch.sh <name>` | captures your edits in `chromium/src` as the next numbered patch |
| `patches/` | one patch per Weft feature |
| `shell/` | the `chrome://weft` entry: `index.html`, `main.tsx`, `bridge.ts` (`window.weft`), `controller.ts` (the port of the app's `browser.ts`: owns the model, drives pages) and `engine.ts` (the engine protocol over `chrome.send`, served by `chrome/browser/ui/webui/weft/`); the React shell and the pure model are the app's, imported by path |
| `brand/` | the app icon and logo, copied from the root `brand/` |

**Why its own directory, not a branch of the app:** a worktree shares one repo's history and toolchain;
the fork has neither in common with the Electron app (depot_tools, GN, a 35 GB checkout). What the
two share is code — the model, the formats, the shell — and that is reached by path,
`../app/src/shared` and `src/renderer`, which one repository guarantees.

## Rules of the road

- **`chromium/src` is disposable.** `apply.sh` resets it every time. An edit that is not in a
  patch does not exist. Capture with `new-patch.sh` before switching tasks.
- **Patches stay small and named for the feature.** Prefer new files under a `weft/` directory
  over editing upstream files: new files never conflict on a version bump.
- **Version bumps are a unit of work**: change `CHROMIUM_VERSION`, run `apply.sh`, fix whichever
  patch fails, rebuild, drive it. Stay on stable; security releases land every ~2 weeks and a
  browser that lags them is a liability (the root `AGENTS.md`'s reason for the fork).
- **Reuse, don't port, the shared code.** The model, `ops.ts`, the env-file and snapshot formats
  and the React shell come from `../app`. If the fork needs them different, change them
  there behind the seam, with tests, so both engines keep working.
- **Build output and the checkout never enter git** (`.gitignore`). Neither does anything signed.

## Build & run

```sh
./scripts/bootstrap.sh          # once: ~35 GB, an hour or more
./scripts/apply.sh              # after every version bump or patch change
./scripts/build.sh dev          # first build: hours; after that, minutes
./scripts/smoke.sh dev          # no screen needed: bundle, icon, headless launch
open chromium/src/out/dev/Weft.app
```

Requirements: full Xcode **with the Metal Toolchain** (Xcode 26+ ships without it:
`xcodebuild -downloadComponent MetalToolchain && xcrun --kill-cache`; `build.sh` checks), ~100 GB
free, 16 GB RAM or more, Node 22+ and `../app` with its `node_modules` installed
(`ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm ci` there) for the shell bundle. CI checks scripts and patch
syntax only; builds are local until a dedicated macOS build machine exists.
