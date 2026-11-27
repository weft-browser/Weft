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

A Chromium fork · TypeScript · React. macOS first.

## Layout

| Path | What |
|---|---|
| [`chromium/`](./chromium/) | the browser: patches, branding and build scripts against a pinned stable Chromium (the Brave model), plus the controller that drives the engine |
| [`shell/`](./shell/) | the interface and the model: the React shell and the pure TypeScript (workspaces, tabs, environments, file formats, keymap) that the fork bundles into `chrome://weft` |
| [`product.md`](./product.md) | product and business decisions, dated |
| [`manifest.yaml`](./manifest.yaml) | machine-readable map: processes, storage, CI, distribution |
| [`compliance/`](./compliance/) | the data inventory: everything Weft stores or sends, and to whom |
| [`brand/`](./brand/) | the Woven W mark, icon and wordmark; `chromium/brand/` copies from here |
| [`rules/`](./rules/) | engineering rules for every change |

Not in this repo: the website (`weftbrowser.com`) and the AWS infrastructure. They are separate,
maintainer-run repositories; `manifest.yaml` describes what they provide.

The Electron app that shipped as 0.1.2 was removed on 2026-11-27. Its complete source, including
the pieces the fork has not rebuilt yet, is kept under the tag **`electron-final`**
(`git show electron-final:app/src/main/browser.ts`). `chromium/plan.md` lists each of those pieces
and where it was.

## Product-wide decisions & invariants

- **Weft is a Chromium fork, and only that.** (Decided 2026-11-27, replacing "Electron now, a
  fork later" of 2026-11-06.) A fork is the only way to get extension popups, same-day Chromium
  security releases, and shell chrome that can paint over a live page; no large browser is built
  on Electron. Electron gave one person a working multi-session browser in a day and shipped 0.1.2;
  keeping it beside the fork would have split every hour between two engines. The cost is real and
  accepted: a ~100 GB checkout, builds that take hours, and a patch series to carry across every
  Chromium release.
  The code keeps the seam that made the move possible, because it is also what keeps most of
  Weft testable without a browser:
  | Engine-neutral (`shell/`) | Engine-specific (`chromium/`) |
  |---|---|
  | the React shell and its command/event protocol (`src/shared/ipc.ts`) | the controller (`shell/controller.ts`) and the engine protocol (`shell/engine.ts`) |
  | the model, its mutations, the persisted formats and their tests | the C++ patches: pages, profiles, routes, tracker blocking, extensions |
  | the keymap, tab triage, the environment file contract | branding, GN args, build and apply scripts |
  Rules that keep the seam honest: `shell/src/shared` imports no engine, no DOM and no React, and
  the shell reaches the engine only through `window.weft` (a test fails the build otherwise);
  model mutations live in `src/shared/ops.ts` as pure functions the controller calls; nothing
  engine-specific (content ids, profile paths) appears in the model or the protocol. New behaviour
  goes in the pure layer first, with tests, and the controller only wires it to the engine.
- **A workspace is a Chromium profile.** Its own directory for an ordinary workspace, an
  off-the-record profile for a disposable one. Nothing is shared across workspaces except the shell itself. Never
  put two workspaces on one profile "for convenience". A **private tab** is a further
  off-the-record profile inside its workspace's environment, wiped when the tab closes and never
  written to disk.
- **The environment file is the contract.** Every workspace serialises to a `<slug>.env.toml` that a
  user can keep in git and rebuild a machine from (`Apply` / `New workspace from file`). Keys and
  values are stable; a new key is optional-with-default on read. Treat it as persisted data under
  the testing rule in `rules/engineering.md`.
- **Honest about what the environment enforces.** Weft only *claims* what the engine actually
  applies: proxy / Tor / locale / timezone / tracker blocking are enforced; VPN tunnels, extension
  page scripts and fingerprint modes beyond `standard` are not yet, and each says so where it is
  chosen (a command the engine cannot serve answers with a toast, never silence). Never let the chip or the "This site sees" line overstate it.
- **The shell process owns the model.** (2026-11-08.) The trusted `chrome://weft` process runs
  the TypeScript model, ops and formats plus the controller; the browser process is an engine
  (profiles, pages, navigation, keys, files) with no model of its own. Reuse over a C++ port; the
  engine stays engine-shaped so the split could still move. The React shell is a view that sends
  commands; UI-only state (hover, panels, palette) stays in it.
- **A VPN workspace fails closed.** (Not rebuilt in the fork yet; the rule stands for when it
  is.) Its profile points at the tunnel's local SOCKS port from the moment the route is chosen;
  if the tunnel is down, connections fail. Traffic never silently goes direct. Tunnels are userspace WireGuard (wireproxy), one per region, so workspaces can exit in
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
  the user's pages, Weft makes exactly the requests listed in
  [`compliance/data-inventory.yaml`](./compliance/data-inventory.yaml) § third_party_flows; adding
  one is a product decision made there first. Stock Chromium makes background requests of its own
  (component updates, field trials, safe browsing and more): every one must be switched off or
  declared **before the first release**, and the inventory says where that audit stands.

## Working here

```sh
git clone https://github.com/weft-browser/Weft.git && cd Weft/shell
npm install && npm run check && npm test     # the interface and the model: any OS, minutes
# the browser itself: ../chromium/README.md (macOS, ~100 GB, hours for the first build)
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
