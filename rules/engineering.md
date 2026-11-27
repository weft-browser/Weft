# Engineering rules

These apply to every change in this repository, whoever or whatever writes it. A directory's own
`AGENTS.md` may add to them; it may override one only by saying what it changes and why.

## Code style

- Match the surrounding file's density, naming and idioms over any personal default.
- No emoji in code (debugging output is fine).

## Accessibility

Accessibility is a tenet, not polish. The baseline is **WCAG 2.1 AA** for every surface.

- **Semantics first**: real `<button>`s for actions, headings in order, labels on inputs.
- **Keyboard**: every interaction works without a pointer, with a visible focus style. Weft goes
  further: see "Keyboard first" in the root `AGENTS.md`.
- **Contrast**: 4.5:1 for body text, 3:1 for large text and UI components. **Compute the ratio;
  never eyeball it**, and check the tokens named muted, subtle, faint, placeholder or disabled.
- **Motion**: respect `prefers-reduced-motion`.
- **Announce dynamic changes** (`aria-live`) and give icon-only controls an accessible name.

## Testing

- **A bug fix ships with the regression test that would have caught it**, aimed at the *class* of
  input, not the one value that failed.
- **Persisted data is a versioned contract.** Anything written to disk outlives the code that
  wrote it:
  - keep a checked-in fixture of each historical on-disk shape and a test that decodes every one
    without losing data; never delete an old fixture;
  - new fields are optional-with-default on decode; unknown keys are ignored, never fatal;
  - round-trip encode → decode → equal, per persisted model.
- **Never silently swallow a decode error on user data.** Log it, and decode per record so one bad
  record cannot discard the whole file.
- **A feature is not done when the tests pass; it is done when it has been driven.** Build the app
  and exercise the new path (each directory's `AGENTS.md` says how, including headless).

## Version control

- **Changes reach `main` through a pull request**, never a direct push. `main` is protected.
- **An agent never merges.** Open the pull request, get CI green, report the link, then stop.
  Reviewing and merging are a maintainer's.
- **Commit and push only when asked**, on a branch.
- **No AI attribution** in commits or pull request descriptions (no `Co-Authored-By` trailers for
  an assistant, no "generated with" lines). The author is whoever is accountable for the change.
- **A pull request references its issue** (`Fixes #N`) when one exists.
- **Version bumps default to a patch.** Propose a minor explicitly, with the reason; never bump
  major without a maintainer's decision. A bump is a release decision, so it is a maintainer's.

## Privacy and data

- **No telemetry.** Weft makes exactly the network requests listed in
  [`compliance/data-inventory.yaml`](../compliance/data-inventory.yaml). Adding one is a product
  decision recorded there first, in the same pull request as the code.
- **No personal data, secrets or page content in logs.** Not redacted: absent.
- **A real deletion path.** Whatever Weft stores, the user can remove, and it stays removed.
- **Say only what is enforced.** The interface, the README and the website claim what the code
  actually applies. An option that is stored but not applied says so where it is chosen.

## Secrets and releases

- **Nothing secret in the repository**, ever: no keys, tokens, certificates or `.env` files.
- CI on pull requests uses no secrets, so it is safe for forks.
- When the fork gets its release pipeline: credentials only where a run on `main` can read them,
  AWS access keyless through OIDC, the certificate in a throwaway keychain destroyed with the job,
  and a release never retried automatically or run twice at once.

## Security issues

Do not open a public issue for a vulnerability. See [`SECURITY.md`](../SECURITY.md).
