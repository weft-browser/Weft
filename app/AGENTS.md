# AGENTS.md — app

The Weft browser: **Electron + TypeScript + React**, built with electron-vite. Product-wide
context (what Weft is, the invariants) is in the root [`AGENTS.md`](../AGENTS.md); this file
covers working in *this* repo. Architecture is in [README.md](README.md).

## Layout

- `src/shared/` — **pure** TypeScript shared by every process: the model (`model.ts`) and its
  mutations (`ops.ts`), the environment file format (`envfile.ts`), the persisted snapshot
  contract (`snapshot.ts`), the prefix-key map (`keys.ts`), the Web Store pure half (`crx.ts`),
  the tracker blocklist (`trackers.ts`) and the command/event protocol (`ipc.ts`). No Electron, no DOM — everything here is unit-tested
  headless, and `test/seam.test.ts` fails the build if Electron creeps in. This is the half a
  Chromium fork keeps (root `AGENTS.md`): put new behaviour here first, then wire it.
- `src/main/` — the **controller**. `browser.ts` owns the model and the `WebContentsView`s;
  `sessions.ts` turns an environment into a Chromium session; `tunnels.ts` runs one userspace
  WireGuard tunnel per VPN region (Node only, tested with a fake engine);
  `store.ts` is disk I/O; `hud.ts` is the transparent overlay window.
- `src/preload/index.ts` — the `window.weft` bridge (commands in, events out).
  `src/preload/tab.ts` runs inside every *page*: editable-focus tracking for the prefix key, and
  link hints.
- `src/renderer/` — the React shell. UI-only state (hover, panels, palette, menus) lives here; the
  browser model arrives as `state` events and changes only through commands.
- `test/` — vitest. `fixtures/` holds one file per historical on-disk shape; never delete one.

## Build, run & test

```sh
npm install
npm run dev        # electron-vite dev server + Electron, hot reload for the shell
npm run check      # tsc, both the node and the web config
npm test           # vitest
npm run build      # bundles to out/ (no packaging)
npm run start      # run the built bundle in Electron
```

**Build and drive it after a feature.** `npm run dev` and actually press the keys — the tests
prove the model, not that a tab shows up where the design says (`rules/engineering.md`: *a feature isn't
done until it's been driven*). Without a screen (an agent, CI on a Mac), drive the **built** app
through the Playwright driver and look at the PNGs it writes:

```sh
npm run build && node scripts/drive.mjs scripts/smoke.drive   # screenshots in .drive-shots/
node scripts/drive.mjs                                        # REPL: launch · ss · leader T · rclick .envchip …
```

Each driver run gets its own `WEFT_DATA_DIR`, so it never touches a running instance. A dev run
(`npm run dev`) lives in `~/Library/Application Support/Weft Dev`, an installed `Weft.app` in
`…/Weft`: the single-instance lock is per folder, so the two coexist. A dev run that exits with
code 0 right after "starting electron app" lost that lock to another instance on the same folder. Keys typed
by the driver go to the shell document, not the page view; `leader` focuses the shell first. A
screenshot of the shell never includes the live page (it is a separate view) — `page-ss` captures
that one on its own.

CI (`.github/workflows/ci.yml`) runs `check`, `test` and `build` on Linux with
`ELECTRON_SKIP_BINARY_DOWNLOAD=1`; those need no Electron binary. The release workflow also drives
the built app with `scripts/smoke.drive` on macOS before it signs anything.

## Rules of the road

- **The model lives in main.** Don't grow a second copy in the renderer; if the renderer needs a
  fact, put it on the state snapshot. If a command needs a UI reaction (focus the address bar,
  open the palette), main replies with a `ui` event rather than the renderer guessing.
- **A page never sees the shell.** Tab views get `src/preload/tab.ts` only, with sandbox +
  context isolation; it exposes nothing to page scripts. The shell's preload is never attached to
  a page.
- **Everything persisted is a contract**: `state.json` (`snapshot.ts`) and `<slug>.env.toml`
  (`envfile.ts`). New fields are optional-with-default on decode; unknown keys are kept or ignored,
  never fatal; a bad record is dropped with a log line, never the whole file. Add a fixture under
  `test/fixtures/` whenever the shape changes.
- **Say only what is enforced.** If you add an environment option Electron cannot apply, the UI
  must say so where the option is chosen. See the root `AGENTS.md` invariants.
- **Keep the keymap in one place** (`src/shared/keys.ts`); the leader help card and the palette
  both render from it, so a new binding appears everywhere or nowhere.
- **Two kinds of right-click menu, on purpose.** Shell chrome (rail, tabs, toolbar buttons) opens
  the styled React menu from `ContextMenu.tsx`. A right-click *inside a page* opens a native
  `Menu.popup` built in `browser.ts` (`pageMenu`), because nothing in the shell document can paint
  over a live `WebContentsView`; keep the two item lists saying the same things.
- **A private tab is its own in-memory partition** (`private-<tabId>`) with the workspace's
  environment applied and extensions off; it is wiped when the tab closes, never persisted, never
  reopenable. Anything that lists or saves tabs has to skip `tab.private`.
- **The hover rail shows a still, not the live page.** When the unpinned rail flies out, the shell
  asks main for `capturePage()` of the active tab, shows it under the rail and hides the live view;
  when the rail closes the live view returns. Keep it a JPEG sent as bytes (a PNG data URL of a
  retina page is slower than the rail transition) and keep the hover-intent delay in `App.tsx`,
  which is what lets the still land before the rail opens. The same trick is the answer for
  anything else that must float over a page for a moment. Pinned, the rail pushes the column and the page resizes.
- **Dev binary is rebranded on postinstall** (`scripts/brand-dev-electron.mjs`): macOS reads the
  menu-bar and Dock name from `Electron.app`'s Info.plist, so the script renames the dev bundle to
  Weft, drops the icon in and re-signs it ad hoc. `npm ci` restores and re-runs it.
- Match the file's density: compact TypeScript, no decorative comments, no emoji in code.
