# Weft — Working Plan

The repository-wide thread. `chromium/plan.md` and `shell/plan.md` hold each area's own; the
backlog is GitHub Issues.

## Objective

Ship Weft as its own Chromium fork: usable every day, updated within days of every Chromium
security release, and easy to contribute to for people and their agents.

## Status

- ✅ Public on GitHub (`weft-browser/Weft`, MPL-2.0), `main` protected, tasks in Issues.
- ✅ **Chromium fork only** (2026-11-27). The Electron app is removed from `main` and archived
  under the tag `electron-final`; `chromium/plan.md` lists what it did and where each piece was.
- ✅ The fork runs: the shell drives pages, a profile per workspace, routes, locale and timezone,
  tracker blocking, saved state. Built and driven headless on 2026-11-07.
- ❌ **No release.** The last published build is the Electron 0.1.2 (2026-11-08), now unmaintained.
- ⏳ The build Mac is offline, so nothing in `chromium/` can be built or driven right now.

## Next

1. Build Mac back; the checkout moved to `chromium/chromium/` in this repository; a build from
   `main` to prove the move broke nothing.
2. Extensions: page scripts, then popups.
3. The window (title bar, traffic lights, fullscreen), then a screen-driven pass.
4. Audit Chromium's own background requests; switch off or declare every one.
5. Release: official build, signing, notarization, an updater, the pipeline. First fork release.
6. Daily-driver features, VPN tunnels, the agent port, hooks: see Issues.

## Decisions

- **Chromium fork only** (2026-11-27): one customer, no installed base, and the features that
  matter first exist only on the fork. Recorded in `AGENTS.md` and `product.md`.
- **GitHub is the primary home, not a mirror** (2026-11-26).
- **One repository**: the interface and the engine change together in one pull request, and CI
  type-checks the controller against the model on every change.
- **Tasks in GitHub Issues**, not Jira and not a file.
- **MPL-2.0** (2026-11-27). The name and the mark are not licensed.
- **Signed by Walnut Labs LLC.** Where the code lives does not change who signs it.

## Open / parked

- The website still offers the Electron 0.1.2 download; it should say what is true.
- Comments inside `chromium/patches/` still name old paths (`weft-browser-app/…`); fix on the
  next patch refresh, when a checkout can prove they still apply.
- Whether `chromium/patches/` needs MPL headers: the patches apply to BSD-licensed Chromium files.
- H.264/AAC are off in the release args until their licensing is decided.
- A security contact address, beyond GitHub's private reporting.
