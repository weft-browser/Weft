# Weft — product and business decisions

The business half of the repository: who Weft is for, how it earns, what it refuses to be, and the
bets in flight. Engineering invariants live in [`AGENTS.md`](./AGENTS.md); this file is the *why*
behind them. Decisions carry a date; a reversed decision stays here, struck through, with the date
it was reversed, so nobody re-argues it from scratch.

## Positioning (2026-11-06)

**A browser for people who live in an editor and a terminal.** Workspaces × tabs, each workspace
its own storage, network exit, locale and extensions, driven by a prefix key like tmux. The
one-line pitch: *Arc's sidebar, tmux's keyboard, a VPN per workspace, and nothing phoning home.*

Who it is for, in order:

1. **Developers and operators** who juggle several identities and environments a day: client
   accounts, staging vs. production, a region to test geo-fenced behaviour, a throwaway for
   something sketchy. Today they use Chrome profiles, containers in Firefox, and a VPN app that
   flips the whole machine. Weft makes that one keystroke per workspace.
2. **People who run AI agents in a browser** and need those agents fenced: a sandboxed profile
   per agent, with its own cookies, exit and permissions, that a human can watch and wipe.
3. **Privacy-minded power users** who want Tor, a proxy or a VPN region *per site*, not per
   machine, and a browser that says exactly what each site sees.

Who it is not for: someone who wants Chrome with a different skin. Weft asks for a keyboard habit.

## What it refuses to be

- **Not a telemetry business.** No analytics, no crash reports off the device, no "anonymous"
  usage data. The data inventory is the contract; a change to it is a product decision.
- **Not an App Store app.** Extensions and arbitrary proxies do not fit the sandbox; Weft ships
  signed and notarized through its own channel (AGENTS.md, off-store distribution).
- **Not a VPN provider.** Weft runs *your* WireGuard configs (NordVPN, Mullvad, Proton, a home
  box) as per-workspace tunnels. Selling exits would make Weft a party to the traffic; it is not.
- **Not an AI browser that reads your pages for you.** AI is a *user* of Weft (see below), not a
  layer between the person and the page.

## How it earns

**Free, with no paid features** (2026-11-06). Everything in Weft, including VPN workspaces,
disposable sandboxes and the agent port, ships to everyone. There is no licence check, no Pro tier
and no Keygen; the Pipeworks licensing seam does not carry over. How Weft makes money is open (see
Open questions); whatever it is, it must not need telemetry or gate a feature.

~~Paid, one-time or yearly licence, off-store, in the Pipeworks mould; the premium is the
environment model.~~ Hypothesis of 2026-11-06, reversed the same day.

## Platform bets

- **A Chromium fork, and only that.** (2026-11-27.) The Electron app is gone from `main`; all
  work goes into the fork. With one customer and no installed base to strand, carrying two engines
  bought nothing, and the things users will miss first (extension popups, DRM video, a real
  window) only exist on the fork. The price: no signed release until the fork has its own window,
  signing and an updater, and a build machine that the release path depends on.
  ~~**Electron now, a Chromium fork later** (AGENTS.md). The seam is kept clean so the shell and
  the model survive the move.~~ Decision of 2026-11-06, replaced 2026-11-27. The seam did its
  job: the shell and the model moved without a change.
- **Provider-agnostic VPN** through WireGuard configs and a userspace engine (wireproxy), one
  tunnel per region, *fail closed* when a tunnel is down. NordVPN first in practice (NordLynx
  exports WireGuard keys), but nothing in the product knows a provider's name. A later importer
  may fetch configs from a provider's API with the user's token; it stays a convenience, never a
  dependency.
- **Chrome extensions, not a Weft extension API.** (2026-11-06.) A VS Code-style extension system
  would be Weft's own API, which would have to be reimplemented in the fork and would compete with
  the Chrome Web Store for attention nobody has. The Chrome extension API is what the fork gets
  *for free*, so Weft adopts it exclusively: full extension support, popups included, is why Weft is a fork. Today the fork loads an
  extension into a workspace's profile; page scripts and popups are the next work. What Weft adds is
  per-workspace scoping of extensions, which Chrome does not have.

- **Apple silicon only, macOS 14 or later.** (2026-11-07.) Apple ends Intel at macOS 26, so an
  Intel build would serve a shrinking set of Macs at twice the download size and, on the fork,
  twice the build. Deciding before the first release means no Intel install is ever stranded
  without updates. The build enforces both (arm64 only, `LSMinimumSystemVersion` 14.0), so the
  site's requirement is true. Revisit only if users on Intel ask.
- **Platforms: macOS first, Linux as a check, Windows on demand.** (2026-11-06.) Every OS is a
  separate Chromium build on its own OS, with its own signing and update channel, so the fork
  stays macOS-only until it has shipped there. A Linux compile check comes once patches
  exist; Windows only if users ask for it.

## AI-forward direction (2026-11-06, exploratory)

The sentence that frames it: **AI drives Weft the way a person does, inside a fence the person
drew.** Weft's workspace model is already the sandbox an agent needs: its own cookies, its own
exit, its own extensions, disposable on close. What is missing is a door.

- **An agent port.** A local control surface (MCP server over a Unix socket, plus the same
  surface as a CLI) exposing Weft's own command protocol: open a tab, navigate, read the page as
  text or accessibility tree, click or type by hint, screenshot, list workspaces. The agent sees
  exactly what the shell's command/event protocol already offers; no second API.
- **Scoped by construction.** A token grants a workspace, not the browser. An agent in
  "Research" cannot see "Banking". A disposable workspace is the default fence for an untrusted
  agent, wiped when it closes.
- **Visible and interruptible.** Every agent action shows in the HUD; the prefix key always wins;
  a workspace driven by an agent is marked in the rail. A person can take over or kill it.
- **Honest limits.** Security is the environment (partition, exit, permissions), not a promise
  that an agent cannot be phished by a page. The product says what the fence is.

This is a direction, not a commitment; it graduates to a decision when the first integration is
specified (OpenSpec).

## Distribution and updates (2026-11-06, revised 2026-11-27)

People will download Weft from **weftbrowser.com**, signed by Walnut Labs LLC and notarized, and
it will update itself from Weft's own host, `updates.weftbrowser.com`. That host served the
Electron build (0.1.2, 2026-11-08) and stays the feed for the fork: its URL is baked into installs.

The fork has **no release yet**. What a release needs, in order: Weft's own window, an official
build, Developer ID signing and notarization, and an updater (Sparkle, since Chromium ships none).
The cadence does not change: **a browser release follows every Chrome security release within
days**, not only when features land. The Electron release pipeline (drive, sign, notarize,
publish with rollback protection) is kept under the `electron-final` tag as the model to rebuild.

## Open questions

- Revenue, if any: sponsorship or donations, a search-default deal (how Firefox and Brave earn;
  must stay telemetry-free), paid support or managed config for teams, an optional hosted service
  such as sync. None gates a feature.
- An in-app setting to turn update checks off (today only `WEFT_NO_UPDATES=1`).
- Name space: "Weft" is unclaimed among browsers (checked 2026-11-06); domain and trademark not
  checked yet.
