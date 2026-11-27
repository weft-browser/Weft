# Weft

A keyboard-first desktop **browser organised as workspaces × tabs**. Each workspace has its own
storage and its own **environment**: network route (direct, a VPN region, a proxy, Tor), locale,
timezone and extensions, plus a disposable mode that wipes everything on close. A prefix key
(`` ` `` or Ctrl+Space) drives it like tmux. Nothing phones home.

Free, for macOS 14+ on Apple silicon. [weftbrowser.com](https://weftbrowser.com). A
[Walnut Labs](https://walnutlabs.xyz) product.

## In this repository

| Path | What |
|---|---|
| [`chromium/`](./chromium/) | the browser: a Chromium fork (patches, branding, build scripts) |
| [`shell/`](./shell/) | the interface and the model (React + TypeScript), bundled into the fork |
| [`product.md`](./product.md) | what Weft is for, what it refuses to be, and the decisions so far |
| [`AGENTS.md`](./AGENTS.md) | the invariants and how to work here, for people and coding agents |
| [`compliance/`](./compliance/) | the data inventory: everything Weft stores or sends |

```sh
cd shell && npm install && npm run check && npm test   # interface and model: any OS, minutes
```

Building the browser itself needs macOS, about 100 GB and a few hours the first time:
[`chromium/README.md`](./chromium/README.md).

**Status (2026-11-27):** Weft is moving from an Electron app (0.1.2, the build on the website) to
its own Chromium fork. The fork runs, but it has no signed release yet. See [`plan.md`](./plan.md).

Want to help? [`CONTRIBUTING.md`](./CONTRIBUTING.md). Found a security problem?
[`SECURITY.md`](./SECURITY.md). The task list is this repository's Issues.

## Architecture at a glance

- **Workspace = Chromium profile.** Cookies, cache, logins and extensions exist only in
  that workspace. Disposable workspaces use an off-the-record profile and are wiped on close.
- **Environment per workspace**, stored as `<slug>.env.toml`: network route (direct / VPN region /
  proxy / Tor), locale, timezone, fingerprint mode, extensions, disposable flag, start and pinned
  tabs, groups. Keep it in git to rebuild a setup elsewhere.
- **Prefix key** (`` ` `` or Ctrl+Space) then a letter — workspaces `1–9 j k n d v e X`, tabs
  `h l t x u a c P g G m`, page `: o f [ ] + - 0 z r s p b`.
- **The shell process owns the model**; the browser process is an engine, and the React shell is
  a view that sends commands.

Full details and invariants: [`AGENTS.md`](./AGENTS.md).

## Licence

[Mozilla Public License 2.0](./LICENSE). © Walnut Labs LLC. The name *Weft* and the Woven W mark
belong to Walnut Labs LLC and are not covered by the licence.
