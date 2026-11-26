# Weft

A keyboard-first desktop **browser organised as workspaces × tabs**. Each workspace has its own
storage and its own **environment**: network route (direct, a VPN region, a proxy, Tor), locale,
timezone and extensions, plus a disposable mode that wipes everything on close. A prefix key
(`` ` `` or Ctrl+Space) drives it like tmux. Nothing phones home.

Free, for macOS 14+ on Apple silicon: [weftbrowser.com](https://weftbrowser.com). A
[Walnut Labs](https://walnutlabs.xyz) product.

## In this repository

| Path | What |
|---|---|
| [`app/`](./app/) | the browser that ships today (Electron + TypeScript + React) |
| [`chromium/`](./chromium/) | Weft as a Chromium fork: patches and build scripts, a side track until it matches the app |
| [`product.md`](./product.md) | what Weft is for, what it refuses to be, and the decisions so far |
| [`AGENTS.md`](./AGENTS.md) | the invariants and how to work here, for people and coding agents |
| [`compliance/`](./compliance/) | the data inventory: everything Weft stores or sends |

```sh
cd app && npm install && npm run dev
```

Want to help? [`CONTRIBUTING.md`](./CONTRIBUTING.md). Found a security problem?
[`SECURITY.md`](./SECURITY.md). The task list is this repository's Issues.

## Architecture at a glance

- **Workspace = Chromium session partition.** Cookies, cache, logins and extensions exist only in
  that workspace. Disposable workspaces use a non-persisted partition and are wiped on close.
- **Environment per workspace**, stored as `<slug>.env.toml`: network route (direct / VPN region /
  proxy / Tor), locale, timezone, fingerprint mode, extensions, disposable flag, start and pinned
  tabs, groups. Keep it in git to rebuild a setup elsewhere.
- **Prefix key** (`` ` `` or Ctrl+Space) then a letter — workspaces `1–9 j k n d v e X`, tabs
  `h l t x u P g G m`, page `: o f [ ] + - 0 z r p b`.
- **Main process owns the model** (in the Chromium fork: the shell process); the React shell is a
  view that sends commands.

Full details and invariants: [`AGENTS.md`](./AGENTS.md).
