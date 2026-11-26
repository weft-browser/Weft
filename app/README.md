# Weft app

A keyboard-first desktop browser organised as **workspaces × tabs**. Each workspace is its own
Chromium storage partition with its own **environment**: network route (direct / VPN region /
proxy / Tor), locale, timezone, extensions, and a *disposable* lifecycle that wipes everything on
close. A prefix key (`` ` `` or Ctrl+Space) drives it like tmux. A
[Walnut Labs](https://walnutlabs.xyz) product.

## Run

```sh
npm install
npm run dev
```

Requires Node 22+ and macOS 14+ (it should run elsewhere, but the window chrome is tuned for
macOS traffic lights).

## Keys

Press `` ` `` (or Ctrl+Space) then one of the keys below. `⌥⌘W` opens the command palette from
anywhere, shell or page, without the prefix.

| Workspaces | | Tabs | | Page | |
|---|---|---|---|---|---|
| `1–9` | jump to | `h` `l` | prev / next | `:` | command palette |
| `j` `k` | next / prev | `t` | new tab | `o` | address / search |
| `n` | new | `T` | new private tab | `f` | follow link (`⇧` new tab · `⌥` private) |
| `d` | new disposable | `x` | close tab | `[` `]` | back / forward |
| `v` | environment | `u` | reopen closed | `+` `-` `0` | zoom page |
| `e` | rename | `a` | all tabs list | `z` | interface size |
| `X` | close | `P` | pin / unpin | `r` | reload |
| | | `g` | new group | `p` | privacy |
| | | `G` | collapse group | `b` | pin sidebar |
| | | `m` | tab menu | `s` | save page as text |
| | | `c` | tidy: tabs to close | | |

In the palette and the all-tabs list: `↑` `↓` or `⌃N` `⌃P` move, `Home` `End` and `PageUp`
`PageDown` jump, `Enter` runs, `Esc` closes; `⌘⌫` in the tabs list closes the selected tab.

**Tab triage** works from local signals only, with no page content and no model (`src/shared/triage.ts`):
when each tab was last in front, its total time in front (one stretch counts for at most 30 min,
and nothing counts while Weft is in the background, the Mac sleeps or is locked), and whether it is
playing sound or holds text typed since it last navigated. In the all-tabs list, `⌃I` orders by
importance and says why under each tab; the palette's *Sort tabs by importance* reorders the strip
(pins keep their order, a group moves with its most important tab). `` ` c `` opens **Tidy**: empty
tabs, duplicates, search results unused for an hour, tabs not opened in 3 days, and tabs opened a
day ago but in front for under 30 s, each with its reason. Nothing closes until you press `⌘⌫` or
`⌘↩` (all); `` ` u `` reopens. The current tab, pins, tabs playing sound or holding typed text and
private tabs are never suggested.

**Save page as text** (`` ` s ``) writes the page's readable part as Markdown (title, source URL,
time and workspace in front matter), to a place you choose in the Save sheet. The reader
(`src/shared/readable.ts`) runs in the page's preload, keeps headings, paragraphs, links,
emphasis, lists, quotes, code and tables, and drops navigation, footers, sidebars, scripts and
anything hidden.

Extensions: paste a Chrome Web Store link (or a 32-letter id) into the Environment panel and
press Install; the extension lands in `extensions/` and is switched on in that workspace. Electron
runs content scripts and background workers, so blockers, dark mode and password-filling content
scripts work; an extension's toolbar popup has nowhere to open.

Right-click is a second layer: workspaces in the rail, the `+` button, back/forward (this tab's
history), the shield, the environment chip, and links inside pages. `⇧`-click / `⌘`-click a link
for a new tab, `⌥`-click for a new private tab.

## How it is put together

```
src/shared/     pure model, env-file format, snapshot contract, keymap, IPC types   (tested)
src/main/       Electron main: Browser controller, sessions, tracker blocking, store, HUD
src/preload/    index.ts → window.weft bridge · tab.ts → runs inside every page
src/renderer/   React shell (rail, tab strip, toolbar, panels, palette, menus, HUD)
test/           vitest + on-disk fixtures
```

- **One `WebContentsView` per tab**, attached to the window and laid over the shell's page area.
  The shell reports the page-area rectangle; main positions the active view there. When a panel,
  the palette or a menu opens, the live view is hidden and the shell shows the page backdrop
  (title, URL, what the site sees) underneath — the design's page mock, made useful.
- **One `session` per workspace**: `persist:ws-<id>`, or a non-persisted partition for disposable
  workspaces. The environment is applied to the session: proxy rules, `Accept-Language`, tracker
  blocking, third-party `Set-Cookie` dropped, unpacked extensions from
  `<userData>/extensions/<name>/`. Locale and timezone are applied per tab through the DevTools
  protocol (`Emulation.setLocaleOverride` / `setTimezoneOverride`).
- **VPN regions** are a lookup into `<userData>/vpn.toml` (`"Zurich, CH" = "socks5://…"`). With no
  endpoint configured the chip says so and traffic goes direct. **Tor** expects a local daemon on
  `127.0.0.1:9050`.
- **Fingerprint** `randomized` / `strict` are stored and shown as *not applied yet*.
- **Environment file.** The env panel's second tab is the workspace's `<slug>.env.toml`; edit it
  and *Apply*, or *New workspace from file*. The same files are written to
  `<userData>/workspaces/` so a setup can live in git.

`<userData>` is `~/Library/Application Support/Weft` (or `.weft-data/` in the repo when
`WEFT_DATA_DIR=.weft-data`).

## Scripts

| | |
|---|---|
| `npm run dev` | dev server + Electron, hot reload |
| `npm run check` | `tsc --noEmit` for the node and web configs |
| `npm test` | vitest |
| `npm run build` | bundles to `out/` |
| `npm run start` | run the built bundle |
| `npm run package` | unsigned `dist/mac-arm64/Weft.app` for a local look (name + icon as shipped) |
| `npm run package:release` | signed + notarized arm64 DMG, zip and `latest-mac.yml`; needs the Developer ID identity, see below |
| `node scripts/drive.mjs scripts/smoke.drive` | drive the built app headless and screenshot it |

## Signing and notarization

Weft ships off-store, signed with the **Developer ID Application** identity of Walnut Labs LLC
(team `DXJQ64BU3M`) and notarized, so Gatekeeper opens it without a warning. electron-builder
does the signing; `build/entitlements.mac.plist` holds the hardened-runtime entitlements an
Electron app needs (JIT, unsigned executable memory, no library validation; no App Sandbox).

- **Locally**, with the identity in the login keychain, `npm run package:release` signs
  automatically. Notarize too by exporting the App Store Connect key trio before running it:
  `APPLE_API_KEY=/path/AuthKey_XXXX.p8 APPLE_API_KEY_ID=XXXX APPLE_API_ISSUER=<issuer uuid>`.
- **In CI** (the release workflow, on a GitHub-hosted Mac), `scripts/package-ci.sh` imports the
  certificate into a throwaway keychain for the job and notarizes with the App Store Connect key.
  The credentials are secrets on the `release` environment (`APPLE_DEVID_CERT_P12_B64`,
  `APPLE_DEVID_CERT_PASSWORD`, `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8`), which only a run on
  `main` can read.

## Releases and updates

**To release, bump `version` in `package.json` and merge.** `.github/workflows/release.yml` runs
on that merge; a merge that leaves the version alone, or names a version that already has a tag,
releases nothing. A bug fix reaches installed copies this way, typically within the hour.

1. **Drive**: the built app is launched on macOS and walked through `scripts/smoke.drive`. A
   release that cannot open a page stops here, before anything is signed.
2. **Package**: `scripts/package-ci.sh` builds an Apple-silicon (arm64) DMG and zip for macOS 14+,
   signed and notarized, with 1000 + the commit count as the build number.
3. **Publish**: assumes the publish role over GitHub OIDC (no AWS keys) and runs
   `scripts/publish.sh`, which uploads to `updates.weftbrowser.com` in this order:
   - the downgrade guard (`scripts/feed.mjs`: the new version must beat the live feed's);
   - the versioned files, under S3 Object Lock;
   - `latest-mac.yml`, which is what makes running copies update;
   - `Weft.dmg`, the website's download link.
4. **Tag**: `vX.Y.Z` and a GitHub release, created only once the feed is live.

`DRY_RUN=1 ./scripts/publish.sh` prints the uploads without making them. The workflow needs the
repository variable `AWS_PUBLISH_ROLE_ARN`; without it the package and publish jobs are skipped.

In the app, `src/main/updater.ts` (electron-updater) checks at launch and every 4 hours in a packaged
macOS build, downloads in the background, says so in a toast, and installs on quit. The palette
also offers **Restart to update**, plus **Check for updates**, which is in the app menu too.
`WEFT_NO_UPDATES=1` turns it off. A dev run never updates itself.

**Security cadence:** a release follows every Electron security release within days. Bump
`electron` and the version, merge, ship.

## VPN per workspace

A workspace on the VPN route exits through a WireGuard tunnel of its own, and three workspaces can
exit in three countries at once. The tunnels are userspace (wireproxy: wireguard-go plus a TCP/IP
stack), so there is no TUN device, no root and no system-wide route.

1. `brew install wireproxy`.
2. Put one WireGuard `.conf` per region in the VPN folder (Environment panel → Open VPN folder),
   named after the region: `Zurich, CH.conf`. Any provider's export works; NordVPN gives WireGuard
   keys through NordLynx, Mullvad and Proton export them directly.
3. Pick the region in the Environment panel. The chip reads *connecting*, then the city.

A VPN workspace fails closed: its session points at the tunnel's local port from the moment the
route is chosen, so if the tunnel is down pages do not load. They never go direct by accident.
DNS resolves through the tunnel. The `.conf` holds a private key; it stays on this Mac.
