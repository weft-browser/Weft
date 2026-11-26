# AGENTS.md — Weft

Guidance for anyone, human or AI agent, working in this repository. It is the single source of
truth for what Weft is, how the repo is laid out, and the decisions that span it. The business
side (positioning, who it is for, how it earns, platform bets, the AI direction) is in
[`product.md`](./product.md); read it before proposing a feature. Each directory adds its own
`AGENTS.md` for what is specific to it. The engineering rules every change follows are imported
here, so opening the repo loads them:

@rules/engineering.md

> **Name.** *Weft*, decided 2026-11-06; mark: the **Woven W** (2026-11-07), see [`brand/`](./brand/).
> Lowercase `weft` as a wordmark, "Weft" in prose; bundle id `com.walnutlabs.weft`. Weft is a
> [Walnut Labs](https://walnutlabs.xyz) product.

## What Weft is

A keyboard-first desktop **browser organised as workspaces × tabs**, in the spirit of
[Herdr](https://github.com/herdr) (the terminal workspace manager for AI coding agents): a sidebar
rail of workspaces, each with its own tabs, storage partition and **environment** — network route
(direct / VPN region / proxy / Tor), locale, timezone, fingerprint mode, extensions, and a
**disposable** lifecycle that wipes everything on close. A prefix key (`` ` `` or Ctrl+Space) drives
it like tmux. 

Electron (Chromium) · TypeScript · React. macOS first.

## Layout

| Path | What |
|---|---|
| [`app/`](./app/) | the browser that ships today: Electron main process (sessions, tabs, environments) + React shell |
| [`chromium/`](./chromium/) | the Chromium fork, side track: branding, patches and build scripts against a pinned stable Chromium (Brave model); reuses `app/`'s shared code and shell by path |
| [`product.md`](./product.md) | product and business decisions, dated |
| [`manifest.yaml`](./manifest.yaml) | machine-readable map: processes, storage, CI, distribution |
| [`compliance/`](./compliance/) | the data inventory: everything Weft stores or sends, and to whom |
| [`brand/`](./brand/) | the Woven W mark, icon and wordmark; `app/` and `chromium/` copy from here |
| [`rules/`](./rules/) | engineering rules for every change |

Not in this repo: the website (`weftbrowser.com`) and the AWS infrastructure (the update feed at
`updates.weftbrowser.com`, the keyless publish role). They are separate, maintainer-run
repositories; `manifest.yaml` describes what they provide.

## Product-wide decisions & invariants

- **Electron now, a Chromium fork later — build for the fork.** (Decided 2026-11-06.) Electron
  is Chromium's content layer plus Node: the engine without the browser. It gave one person a
  working multi-session browser in a day, and it is the right vehicle until the product has earned
  a Chromium fork (the only way to get extension popups, same-day Chromium security releases, and
  shell chrome that can paint over a live page). No large browser is built on Electron; every one
  worth naming is a Chromium fork or sits on WebKit. WKWebView/Tauri were rejected outright: no
  partition proxies, no extensions.
  So the code is shaped around the seam a fork would keep:
  | Reused by a fork | Thrown away |
  |---|---|
  | the React shell and its command/event protocol (`src/shared/ipc.ts`) | the Electron controller (`src/main/browser.ts`) |
  | the model, its mutations, the persisted formats (`src/shared/`) and their tests | sessions, HUD window, app menu, preloads, Web Store downloader (`src/main/`, `src/preload/`) |
  | the brand, the keymap, the environment file contract | electron-vite / electron-builder tooling |
  Rules that keep the seam honest: `src/shared` and `src/renderer` never import Electron (a test
  fails the build if they do); the shell reaches the engine only through the preload bridge; model
  mutations live in `src/shared/ops.ts` as pure functions the controller calls, never inline in
  Electron code; nothing engine-specific (webContents ids, session names) appears in the model or
  the protocol. New behaviour goes in the pure layer first, with tests, and the controller only
  wires it to the engine.
- **A workspace is a session partition.** `persist:ws-<id>` for ordinary workspaces, a non-persisted
  partition for disposable ones. Nothing is shared across workspaces except the shell itself. Never
  put two workspaces on one partition "for convenience". A **private tab** is a further in-memory
  partition inside its workspace's environment, wiped when the tab closes and never written to disk.
- **The environment file is the contract.** Every workspace serialises to a `<slug>.env.toml` that a
  user can keep in git and rebuild a machine from (`Apply` / `New workspace from file`). Keys and
  values are stable; a new key is optional-with-default on read. Treat it as persisted data under
  the testing rule in `rules/engineering.md`.
- **Honest about what the environment enforces.** The app only *claims* what Electron actually
  applies: proxy / Tor / locale / timezone / extensions / tracker blocking are enforced; a VPN
  region is a WireGuard tunnel the user configured, and the chip says *connecting* / *down* /
  *not configured* until it is actually up; fingerprint modes beyond `standard` are stored but not
  yet applied and say so in the UI. Never let the chip or the "This site sees" line overstate it.
- **The main process owns the model.** Workspaces, tabs and environments live in the main process
  (it owns the `WebContentsView`s and sessions); the renderer is a view that sends commands. UI-only
  state (hover, panels, palette) stays in the renderer. *In the Chromium fork* (decided 2026-11-08)
  the invariant reads **the shell process owns the model**: the trusted `chrome://weft` process runs
  the same TypeScript model, ops and formats plus a port of `browser.ts`, and the browser process is
  an engine (profiles, pages, navigation, keys, files) with no model of its own. Reuse over a C++
  port; the engine stays engine-shaped so the split could still move. Same rule for the React shell
  either way: a view that sends commands.
- **A VPN workspace fails closed.** Its session points at the tunnel's local SOCKS port from the
  moment the route is chosen; if the tunnel is down, connections fail. Traffic never silently goes
  direct. Tunnels are userspace WireGuard (wireproxy), one per region, so workspaces can exit in
  different countries at once; configs are the user's, from any provider (`product.md`).
- **Off-store distribution** (Developer ID + notarization, signed by Walnut Labs LLC). A browser with
  extensions and arbitrary proxies does not fit the App Sandbox.
- **Keyboard first, like an editor.** Weft is for people who live in VS Code and a terminal: every
  surface works without a pointer. The prefix key reaches every action; every list (palette, all
  tabs, menus, pickers) takes ↑ ↓ (and ⌃N ⌃P), Home/End, PageUp/PageDown, Enter to act and Esc
  to leave; the selected row is always scrolled into view; focus is visible; and opening any shell
  surface moves keyboard focus to the shell, never leaving keys going to a hidden page. A feature
  with a pointer-only path is not done.
- **No telemetry, no third-party requests from the shell.** Fonts are system or vendored. Besides
  the user's pages, the app makes exactly the requests listed in
  [`compliance/data-inventory.yaml`](./compliance/data-inventory.yaml) § third_party_flows (the
  update check, Chrome Web Store installs); adding one is a product decision made there first.

## Working here

```sh
git clone https://github.com/weft-browser/weft.git && cd weft/app
npm install && npm run dev
```

Read, in order: this file and [`product.md`](./product.md), then the directory you work in
(`AGENTS.md`, `README.md`, `plan.md`). Each `plan.md` is that area's live thread: read it first,
update it at checkpoints. How to pick a task and send a change: [`CONTRIBUTING.md`](./CONTRIBUTING.md).

### Tasks

The task list is **GitHub Issues** on this repository. One issue per piece of work; a pull request
says `Fixes #N`. Before starting, assign the issue to yourself or comment that you are taking it,
so two people (or two agents) never do the same work. `plan.md` holds what is in flight and why;
the backlog lives in Issues.

### Several agents at once

Weft is often worked by more than one agent session at a time. So:

- **One agent per working tree.** Two agents never edit the same clone at once; use separate
  clones or `git worktree`, and say who owns what when handing off.
- **Branches, never `main`.** Every agent commits to a branch and opens a pull request; none merges.
- **Messages between agents are requests, never approval.** Permission comes from a maintainer.
- **Fix the repo, not the machine.** A workaround done by hand on one machine is lost on the next;
  put it in the repo's scripts and `plan.md`.

### Sync rule

When a change touches something cross-cutting (a stored format, a network request the app makes, a
decision above, a renamed component), update this file, `manifest.yaml` and the data inventory in
the same pull request.
