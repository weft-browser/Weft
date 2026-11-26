# Security

Weft is a browser: a security bug here can expose someone's logins. Please report privately.

## Reporting a vulnerability

Use **GitHub's private vulnerability reporting** on this repository (Security → Report a
vulnerability). Do not open a public issue.

Include what you found, how to reproduce it, the Weft version (`Weft → About`, or the version in
the update feed), and the macOS version. You will get an acknowledgement within 3 working days.

## What is in scope

- Anything that lets a page reach the shell, another workspace's storage, or another tab's
  private partition.
- A workspace's traffic leaving by a route other than the one its environment names (for example
  a VPN workspace connecting directly).
- The update path: the feed, the signature checks, the release pipeline.
- Weft's own code and configuration. Bugs in Chromium or Electron themselves belong upstream;
  tell us too if Weft is slow to pick up the fix.

## Supported versions

Only the latest release. Weft updates itself, and a release follows upstream Chromium/Electron
security releases.

## What Weft does not promise

The fence around a workspace is its environment (storage partition, network route, permissions).
It is not a promise that a page cannot phish a person or an agent. `product.md` says what each
option enforces; if the app claims more than it enforces, that is a bug worth reporting.
