# Weft app — Working Plan

Live working thread for `app/`. Terse and current; finished items are trimmed. The backlog is
GitHub Issues; the repository-wide thread is the root `plan.md`.

## Objective

Implement the **Workspace Browser** design as a real browser: workspaces ×
tabs, one Chromium session partition per workspace, a per-workspace environment, prefix-key
driving.

## Status

- ✅ Shell: rail, tab strip (pins, groups, chips, all-tabs panel), toolbar, privacy and environment
  panels, palette, HUD, right-click menus, link hints. Driven on screen and headless.
- ✅ Real tabs on `WebContentsView`s; environments enforced (partition, proxy / Tor / VPN endpoint,
  locale + timezone, tracker blocking, third-party `Set-Cookie` dropped, unpacked extensions).
- ✅ Private tabs, disposable workspaces, Chrome Web Store installs (Electron's extension support
  is partial; the UI says so).
- ✅ VPN per workspace: one wireproxy tunnel per region, fail closed. Tested with a fake engine;
  **not yet driven with a real WireGuard config**.
- ✅ Persistence: `state.json` v1 (+ fixtures), env files per workspace; private tabs never written.
- ✅ Releases: 0.1.2 is live (signed, notarized, self-updating from `updates.weftbrowser.com`).
  0.1.0 failed in packaging and 0.1.1 in publishing; neither shipped.

## Next

1. **Daily-driver gaps**: downloads, find in page, bookmarks, passwords and passkeys, printing.
2. **Self-update, proven**: watch an installed copy update itself to the next release.
3. **Security cadence**: a scheduled job that opens a pull request when Electron ships a security
   release.
4. **Fonts**: vendor Inter + JetBrains Mono woff2 under `resources/fonts/` (system fallback today).
5. **Fingerprint modes**: `randomized` / `strict` are stored and shown as *not applied yet*. Decide
   whether to implement canvas/audio noise in `tab.ts` or drop the options.
6. **VPN**: drive it with a real WireGuard config (`brew install wireproxy`); then an exit-IP
   check in the privacy panel so "This site sees" is measured, not inferred.
7. **Agent port** (`product.md` § AI-forward): spec first. MCP over a Unix socket,
   workspace-scoped tokens, HUD visibility.

## Decisions

- **Updates: electron-updater on our own host from day one** (2026-11-07). The feed URL is baked
  into every install, so it is `updates.weftbrowser.com`, never a raw bucket URL. The update
  payload is the zip (Squirrel.Mac), the DMG is for first installs. Free, so no licensing.

- **Electron now, Chromium fork later; build for the fork** — Electron is the engine without the
  browser; popups, same-day security and chrome-over-page need a fork. The seam (what a fork
  reuses vs. throws away) and the rules that keep it are in the root `AGENTS.md`; `test/seam.test.ts`
  enforces the import boundary; model mutations live in `src/shared/ops.ts`.
- **Model in main, view in renderer** — main owns the views and sessions anyway; one owner.
- **Nothing in the shell paints over a live page.** So: HUD as a transparent child window for
  what must float (leader help, toasts, hover URL); big panels and menus hide the page and show
  the backdrop; the unpinned rail fly-out shows a *still* of the page under itself; in-page
  right-click is a native menu.
- **Private tab = partition, not a flag.** Same environment as its workspace, extensions off (as
  Chrome incognito), wiped on close. Cheaper than a second session model and honest.
- **`WEFT_DATA_DIR` relocates `userData` wholesale** so the single-instance lock is per data
  dir: the driver and a dev instance coexist.
- **Prefix key from inside a page needs the page's cooperation** — `tab.ts` reports whether an
  editable element is focused so a backtick typed into a textarea stays a backtick.

## Open / parked

- `strict` fingerprint = "everyone looks the same" implies a fixed UA/screen/fonts profile; scope
  unclear, parked with item 3.
- History menu on a disabled back button does nothing (matches the design; Chromium swallows
  right-click on disabled buttons).
