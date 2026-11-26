# Weft on Chromium — Working Plan

> Moved into the single `weft` repository on 2026-11-26. Older entries name the GitLab repos
> (`weft-browser-app`, `weft-browser-core`, `weft-browser-chromium`); they are history. Paths are now `app/`, the repository root, and `chromium/`.

## Objective

Weft on its own Chromium fork, reaching parity with the Electron app and then past it: extension
popups, same-day security releases, shell chrome that paints over a live page. Pinned to stable
**158.0.8127.18** (2026-11-06).

## Status

- ✅ Repo scaffolded (Brave model): pin, bootstrap / apply / build / new-patch scripts, dev and
  release args, branding by key rewrite (name Weft, bundle `com.walnutlabs.weft.chromium`, team
  `DXJQ64BU3M`, the weft icon). CI checks scripts and patch syntax.
- ✅ **Fetched on the build Mac** (2026-11-07, `bootstrap.sh`, EXIT=0): `chromium/src` at 158.0.8127.18,
  48 GB on disk, no history.
- ✅ **`apply.sh` passes at 158** (5 s). The icon path moved: the bundle now carries a compiled
  `Assets.car` next to `app.icns` and `Info.plist` names it (`CFBundleIconName=AppIcon`), so
  macOS 26+ shows the catalogue icon and ignores `app.icns`. `apply.sh` recompiles the catalogue
  with `actool` from the upstream `.xcassets` and Weft's artwork (see Decisions).
- ✅ **Phase 0 dev build done** on the build Mac (2026-11-07, 11:27–13:44 UTC): **137 min** wall-clock
  for the clean component build, 10 cores, 32 GB, runner up but idle. Disk: 258 → 250 GB free;
  `out/dev` is 6.5 GB. First attempt failed in 47 s: Xcode 27.2 ships without the Metal Toolchain
  (ANGLE's shaders need it). Fixed on the machine (`xcodebuild -downloadComponent MetalToolchain`,
  then `xcrun --kill-cache`, which the stale xcrun lookup needs) and in the repo (`build.sh` checks
  up front, `AGENTS.md` lists it).
- ✅ **`smoke.sh dev` passes**: `Weft.app`, bundle `com.walnutlabs.weft.chromium`, `app.icns` and
  `Assets.car` are Weft's, the browser starts headless and `chrome://version` names Weft
  (158.0.8127.18). Two findings: headless Chrome swaps `chrome://` start URLs for the NTP unless
  `--allow-chrome-scheme-url` is passed (`smoke.sh` passes it), and the browser cannot start inside
  the Claude Code sandbox (crashpad mach port, singleton socket) — run `smoke.sh` unsandboxed.
- ✅ **Shell bundle for `chrome://weft`** (`scripts/build-shell.sh`, `shell/`): vite from the app's
  own `node_modules`, the React shell reused by path, `window.weft` provided by `shell/bridge.ts`
  over `chrome.send`. 300 KB, type-checks against the app's types.
- ✅ **Phase 2a: the Weft shell renders at `chrome://weft`** (2026-11-07 13:55 UTC), patch
  `0001-weft-shell-webui` (9 files): `chrome/browser/ui/webui/weft/` (controller + stub state
  handler), `chrome/browser/resources/weft/BUILD.gn` (grit of the bundle), and five upstream
  edits (resource ids 5240–5249, `chrome/browser/resources/BUILD.gn`, `chrome_paks.gni`,
  `webui/BUILD.gn`, `chrome_web_ui_configs.cc`). Incremental build 38 s; `smoke.sh` sees the
  rail, the tab strip and the address bar against the stub state (`out/dev/smoke/weft.png`).
  `apply.sh` re-applies it on a reset tree (it now cleans exactly the files a patch adds, never a
  blanket `git clean`: DEPS-managed dirs are untracked too). `new-patch.sh` numbering fixed for
  the zero-patches case.
- ✅ **Phase 2b spike: a page paints inside the shell** (2026-11-07 14:30 UTC), patch
  `0002-weft-page-embed`: `chrome://weft?page=<url>` creates a browser-owned `WebContents`,
  the shell drops a surface-embed `<embed>` into `main.page`, and `drive.mjs` screenshots the
  orange test page in the page area (`out/dev/smoke/weft-page.png`). Three upstream one-liners
  (`webui_url_constants.h`, the surface-embed binder's WebUI check, the renderer plugin gate)
  plus `object-src 'self'`. Learned: a page nothing native holds must be seeded with a size and
  a visibility (`Resize`, `UpdateWebContentsVisibility`) or it never produces a frame; headless
  `--screenshot` shoots at the load event, before the embed has a frame, hence `drive.mjs`.
- ✅ **Phase 2b core: the shell drives the browser** (2026-11-07 14:50 UTC), patch
  `0003-weft-engine-pages` + `shell/controller.ts` + `shell/engine.ts`. The controller is a port
  of `browser.ts` that owns the model in the shell process (proposal (a) below, made real; the
  pure half is imported from the app unchanged) and drives pages through an engine protocol
  over `chrome.send`: `createPage(id, url) → contentId`, `page(id, navigate|back|forward|
  reload|stop|goToIndex|zoom|focus|destroy)`, and `page` / `crashed` / `hover` / `openLink`
  events from a `WebContentsObserver` + `WebContentsDelegate` per page. Driven with
  `drive.mjs`: typed address → Example Domain, `+` → Wikipedia, tab switch, titles, favicons
  (through `chrome://image`: a WebUI document that fetches https itself gets its renderer
  killed), back/forward state, the page strip. In memory only; what the shell still lacks says so
  in a toast: per-workspace storage, routes, locale, timezone (Phase 1), tracker blocking, link
  hints, the HUD window, extensions, updates, persistence.
- ✅ **Phase 1: workspaces are profiles** (2026-11-07 19:10 UTC), patch
  `0004-weft-workspace-profiles`. A workspace is a `Profile` at `<user data dir>/Weft-<wsId>`
  (`ProfileManager::CreateProfileAsync`); a disposable workspace is an off-the-record profile of
  the regular one (`OTRProfileID::CreateUnique("weft::disposable")`, destroyed on close, storage
  with it); a private tab is an off-the-record profile of its workspace's, destroyed with the
  tab. The environment is applied to the profile: route as the `proxy` pref (direct / fixed
  servers with `<local>` bypass: proxy, Tor, a tunnel endpoint), locale as
  `intl.selected_languages` + `intl.accept_languages` (the selected-languages pref is the source
  of truth, `LanguagePrefs` rewrites the other), third-party cookies off always. Verified with
  `drive.mjs --serve` (a local server logging headers and cookies): cookies stay inside a
  workspace, a second workspace and a private tab start empty, a dead proxy on one workspace
  breaks only that one (`ERR_PROXY_CONNECTION_FAILED`), Accept-Language follows the workspace
  (`de-CH,de;q=0.9`; a disposable one appends the regular profile's languages, Chromium's
  incognito rule). Not yet: timezone and locale emulation per page (the toast says so), tunnels,
  tracker blocking, extensions. `drive.mjs` now runs the shell in a persistent context: a
  Playwright `launch()` context is off-the-record, and only a regular profile can create and
  destroy off-the-record ones.
- ✅ **Emulation, page keys, persistence** (2026-11-07 19:40 UTC), patch
  `0005-weft-emulation-keys-files`. Each page holds an in-process DevTools session
  (`DevToolsAgentHostClient`) for `Emulation.setTimezoneOverride` / `setLocaleOverride`, as
  `browser.ts` does over Electron's `wc.debugger`; verified with `drive.mjs --serve` (the served
  page reports `Intl` timezone): `Asia/Singapore` and `Europe/Zurich` per workspace.
  `navigator.language` stays the UI language, as in Electron. The prefix key inside a page: the
  page delegate's `PreHandleKeyboardEvent` mirrors the shell's leader state and swallows the
  prefix and the key after it, reporting them as `key` events the controller handles. **Not
  driven**: keys injected over DevTools (Playwright) go to the shell's widget and reach the page
  without the page delegate, so this needs a screen; a code-path read says OS keys retarget to
  the focused inner widget and do pass there. Persistence: `state.json` and
  `workspaces/<slug>.env.toml` under `<user data dir>/Weft` through `readFile` / `writeFile` /
  `removeFile` / `listDir` engine messages (atomic writes on the thread pool), `snapshot.ts` and
  `envfile.ts` unchanged; verified: a second run on the same data dir restores two workspaces,
  their tabs and environments (`drive.mjs --data <dir>`).
- ✅ **HUD in the shell, clear site data** (2026-11-07 19:55 UTC), patch `0006-weft-clear-site`.
  The app's `Hud` component is mounted over the shell (`shell/main.tsx`): the page is an element
  of the document here, so the HUD needs no window of its own; driven: a toast, the prefix-key
  card, Escape. Clear site data: `BrowsingDataRemover::RemoveWithFilterAndReply` on the
  workspace's profile, scoped to the site's registrable domain (the shell's host carries a
  port, dropped), cookies + storage + cache; driven with `drive.mjs --serve`: the cookie set
  by `/set` is gone after the clear, the toast lands when the removal reports done.
- ✅ **Tracker blocking** (2026-11-07 20:20 UTC), patch `0007-weft-tracker-blocking`,
  `chrome/browser/weft/tracker_throttle.{h,cc}`. Chromium decides requests in two places, so
  two hooks share one rule set (`IsTracker` / `SiteOf` / `IsThirdParty`, the app's
  `trackers.ts` ported line for line): a `URLLoaderThrottle` from
  `CreateURLLoaderThrottles` for navigations, and a `SelfDeletingURLLoaderFactory` proxy from
  `WillCreateURLLoaderFactory` for a document's subresources (modelled on
  `GlicSubresourceProxyingURLLoaderFactory`), which completes a blocked request with
  `ERR_BLOCKED_BY_CLIENT`. The list and the per-site allow keys come from the shell
  (`setTrackers`, `setAllow`); a blocked request is a `blocked` event the tab counts, reset
  when a new document commits. Driven with `drive.mjs --serve` (`/track` embeds two tracker
  images): 2 blocked, protection off → 0, on again → 2. The list is a copy in
  `shell/trackers.ts` until app !3 (which exports it from `src/shared`) merges; see Next 2.
- ⚠️ **Extensions per workspace, half way** (2026-11-07 20:40 UTC), patch
  `0008-weft-extensions`. `<data dir>/extensions/<name>` (a folder with `manifest.json`, as the
  Electron app's) is listed at boot (`listExtensions`), and the environment's `ext` switches
  load it into the workspace's profile with `UnpackedInstaller` (after the profile's
  `ExtensionSystem` is ready, or the registry DCHECKs) and enable/disable it with
  `ExtensionRegistrar`; verified: the probe extension gets an id. **Not working**: its content
  script never runs in a page, with or without `ChromeExtensionWebContentsObserver` and a
  session tab id on the page. Suspects, in order: `extensions::TabHelper` and the rest of what
  `TabHelpers::AttachTabHelpers` gives a tab; whether `UserScriptLoader` reaches the page's
  process (`--vmodule=user_script_loader=2,script_injection*=2`); MV3 host permissions
  withheld for an unpacked load. The toast says so when a switch moves. Disposable workspaces:
  no extensions (they share one off-the-record profile). `drive.mjs` now launches without
  Playwright's `--disable-extensions`.
- 💡 **Chromium 158 ships its own WebUI browser frame** (`chrome/browser/ui/webui_browser/`,
  `chrome/browser/resources/webui_browser/`, flag in `ui_features.cc`): the tab strip, toolbar,
  bookmark bar and side panel as a WebUI, with tab contents attached as guests
  (`cr-webview`, `chrome.browser.attachIframeGuest`) or by surface embed. That is the host
  Phase 2b needs; evaluate it before building a views-side host by hand (see Next 3).
- ✅ `scripts/smoke.sh`: checks a built app with no screen (bundle keys, icon hashes, headless
  `chrome://version` and `chrome://weft`, screenshot). Not yet run against a build.

## Next

1. **CR !3 on `feat/phase-1-environments`**: patches 0004–0008 and this plan (!2, Phase 0 to
   2b, merged 2026-11-08). A maintainer reviews and merges. Alongside it, two CRs from the decisions of 2026-11-08: the root docs
   (`docs/model-ownership-fork`: the fork reading of "the main process owns the model") and
   `app/` (`feat/shared-tracker-list`: `src/shared/trackers.ts` exports
   `TRACKER_HOSTS`).
2. **After app !3 merges**: delete `shell/trackers.ts` and import `TRACKER_HOSTS` from
   `../../app/src/shared/trackers` in `shell/controller.ts`; `build-shell.sh` then
   needs the app checkout at or past that merge.
3. **Phase 2b — finish.** Done: pages by surface embed, the engine over `chrome.send`, the
   controller, keys from pages (needs a screen to confirm), persistence. Left, in order:
   (i) the **window**: `Weft.app --app=chrome://weft` is a toolbar-less window today; a
   `WeftWindow` (views `Widget` + `views::WebView`, modelled on `WebUIBrowserWindow` without
   its `Browser`/`TabStripModel`) makes it the default and owns the macOS title bar, traffic
   lights and fullscreen; (ii) page **context menu**: `HandleContextMenu` on the page delegate
   → a native `ui::SimpleMenuModel` + `views::MenuRunner` with the Electron `pageMenu` items
   (open link here / in a new tab / private / in another workspace, copy link, search the
   selection, image, back/forward/reload, inspect), reporting through `openLink` and the page
   actions; needs a screen to drive; (iii) `chrome.send` → a `weft.mojom`
   `Engine`/`EngineClient` pair once the message set settles; (iv) **drive it on a screen**:
   `open out/dev/Weft.app --args --app=chrome://weft`, press the prefix key with a page
   focused, type, scroll, resize, right-click.
4. **Phase 1 — finish.** Done: profiles, route, locale header, cookies, timezone and locale
   emulation, clear site data, tracker blocking, extensions loaded per profile (patches
   0004–0008). Left: (i) **extension content scripts in pages** (see the ⚠️ above); (ii) the
   profile directory `Weft-<wsId>` shows up in Chrome's profile picker as "Person N": name its
   `ProfileAttributesEntry` after the workspace, or hide it; (iii) the `?page=` boot URL and
   `drive.mjs --serve` cover the engine; a unit test of the controller against a fake engine
   (vitest, in the fork repo) would cover the port of `browser.ts`; (iv) the tracker list
   import once app !3 merges (Next 2).
4. **Phase 2b — the shell drives the browser.** Replace the tab strip and toolbar views with the
   `chrome://weft` WebUI, and give it a real engine behind `WeftApi` (see the open decision on
   model ownership below). The Electron features to reach, from `app/`:
   workspaces × tabs (pins, groups, reopen), environments (proxy / Tor / VPN endpoint, locale,
   timezone, tracker blocking, third-party cookies off, extensions per workspace), private tabs,
   disposable workspaces, env files + `state.json`, prefix key + palette + HUD, link hints,
   page stills under the rail, page context menu, zoom per site, interface scale, Web Store
   installs, update state.
5. **Phase 3 — the prefix key, palette, HUD** on browser accelerators; HUD becomes a real views
   overlay (no more page stills).
6. **Phase 4 — VPN tunnels** in the browser process (wireproxy as a helper, or WireGuard via
   `net/` proxy delegate), extensions with full UI, Web Store install flow scoped per workspace.
7. **Phase 5 — release**: official build, Developer ID signing + notarization, update channel,
   and a version-bump routine that tracks stable within days.

## Decisions

- **Build on a dedicated Mac** (2026-11-06): M1 Max, 32 GB, ~100 GB for the checkout and output.
  Builds run in `tmux`; nothing else heavy runs on the machine during one.
- **macOS only** until parity with the Electron app; Linux and Windows per `product.md`.
- **Separate repo, not a worktree or branch** (2026-11-06, reconfirmed 2026-11-07): different
  toolchain, history and CI; shared code reached by path. A long-lived or orphan branch of the app
  was considered and rejected (endless merges from `main`; shared project settings). A `chromium/`
  folder inside the app was the runner-up: it would make seam-crossing changes one CR. See `AGENTS.md`.
- **Patches + scripted branding, not a long-lived fork branch.** A rebased branch of 30 GB of
  upstream is unworkable for one person; a patch series against a pin is what Brave and
  ungoogled-chromium do.
- **Stable channel only.** A browser behind on security is worse than no browser.
- **No proprietary codecs** in release until licensing is decided (H.264/AAC).
- **Icon: recompile the asset catalogue, keep the upstream `.xcassets`** (2026-11-07). Replacing
  `app.icns` alone leaves Chromium's icon on macOS 26+. `apply.sh` copies the upstream
  `Assets.xcassets`, swaps Weft's PNGs into `AppIcon.appiconset` and `Icon.iconset` (the badge on
  Weft's document types), and `actool` compiles `Assets.car`. Chromium's layered `AppIcon.icon`
  (Icon Composer) is not used; a Weft `.icon` with the Woven W on glass is a brand follow-up.
- **Shell before profiles** (2026-11-07): Phase 2a (`chrome://weft` renders the shell) is done
  before Phase 1 because it proves the resource pipeline and the reuse-by-path seam every later
  phase builds on, and it is visible. Phase 1 follows.
- **Pages are painted by surface embed, not guest views** (2026-11-07). Chromium 158 has two
  ways to put a `WebContents` inside a WebUI: `guest_contents` (iframe swap, gated to dev/canary
  by a `CHECK` on `kAttachUnownedInnerWebContents`) and `surface_embed` (compositor surface in an
  `<embed>`, on by default, the path Chromium's WebUI browser frame moved to). Surface embed is
  the one that can ship. Cost: two upstream one-liners (the renderer plugin gate, the browser
  binder's WebUI check) plus `object-src 'self'` on `chrome://weft`.
- **Do not build on `features::kWebium`** (2026-11-07). Its `WebUIBrowserWindow` is tied to a
  `Browser` + `TabStripModel`, i.e. one profile per window; Weft's window shows tabs from many
  profiles. Reuse its parts (window `.mm`, modal dialog host, find bar owner, zoom bubble, the
  `GuestHandler` shape) by reading, not by depending on the flag.
- **The shell bundle is build output, not a patch.** `apply.sh` bundles it into
  `chrome/browser/resources/weft/dist/`; `new-patch.sh` excludes that path. A patch that carried
  300 KB of minified React would make every shell change a binary diff.
- **The shell process owns the model** (2026-11-08). The root `AGENTS.md` says the main process
  owns it; in Electron that is Node. The fork keeps the TypeScript model, ops, formats and a port
  of `browser.ts` in the trusted `chrome://weft` process (`shell/controller.ts`, patch 0003), and
  the browser process is an engine for what Electron's `WebContentsView`/`session` gave
  (profiles, pages, navigation, keys, files, tunnels). The alternative, porting the model to C++
  and making the WebUI a pure view, duplicates tested logic against "reuse, don't port". A WebUI
  crash loses at most 400 ms of state. The engine protocol is engine-shaped either way, so the
  split could still move. Recorded in the root `AGENTS.md`.
- **The tracker list comes from the app** (2026-11-08): `src/shared/trackers.ts` exports
  it (app !3); the fork imports it by path like the rest of `src/shared`, no copy.

## Open / parked

- The shell bundle is not checked in CI (needs `../app` and Node on the runner); the
  `check` job still covers scripts and patches.
- Linux compile check once there are patches; Windows VM only on demand
  (root `product.md` § Platform bets).
- Whether the Electron app keeps shipping alongside the fork, and for how long.
