# Weft — Working Plan

The repository-wide thread. `app/plan.md` and `chromium/plan.md` hold each area's own; the backlog
is GitHub Issues.

## Objective

Make Weft usable every day, fixable within the hour, and easy to contribute to, for people and
their agents.

## Status

- ✅ One repository (2026-11-26): the product docs at the root, the app in `app/`, the fork in
  `chromium/`. The history starts fresh here; the earlier one stays in the private GitLab
  repositories. Standalone: the engineering rules are in `rules/`,
  nothing imports a file outside the repo.
- ✅ GitHub Actions: `ci.yml` (no secrets, safe for forks) and `release.yml` (drive → sign →
  notarize → publish → tag). Run locally in full except the workflows themselves.
- ⏳ Not yet on GitHub: the organization `weft-browser` has to be created by a maintainer.
- ⏳ Release wiring: the AWS publish role must trust this repository's `release` environment;
  the five signing secrets and `AWS_PUBLISH_ROLE_ARN` must be set there.

## Next

1. Push, protect `main`, create the `release` environment (main only), seed Issues.
2. First release from GitHub (0.1.3, with tab triage): proves the pipeline end to end.
3. Licence, then a history check, then public. Hosted Mac minutes are limited while private.
4. Daily-driver gaps (downloads, find in page, bookmarks, passwords, printing): one issue each.
5. The agent port (`product.md` § AI-forward direction): spec first.

## Decisions

- **GitHub is the primary home, not a mirror** (2026-11-26): contributors and their agents are
  there, hosted Mac runners remove the single build machine from the release path, and a mirror
  splits issues and cannot take pull requests.
- **One repository**: a change that crosses the app and the fork is one pull request, and CI
  type-checks the fork's shell against the app on every change.
- **Tasks in GitHub Issues**, not Jira and not a file: visible to contributors, claimable, closed
  by the pull request that does the work.
- **Still signed by Walnut Labs LLC.** Where the code lives does not change who signs it.
- The website and the AWS infrastructure stay in maintainer-run repositories for now.

## Open / parked

- The patches in `chromium/patches/` still say `weft-browser-app/…` in comments; fix on the next
  patch refresh, when a checkout can prove they still apply.
- electron-builder 26.18 / electron-updater 6.8.11 upgrade: a local build produced no DMG or
  feed ("Cannot cleanup"); parked until investigated.
- A security contact address, beyond GitHub's private reporting.
