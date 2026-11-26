# patches

Weft's changes to Chromium, as `git apply` patches against the tag in `../CHROMIUM_VERSION`,
applied in name order by `scripts/apply.sh`. Make one with `scripts/new-patch.sh <name>`.

One patch is one Weft feature (`0001-workspace-profiles.patch`, `0002-shell-webui.patch`…), so
a version bump that breaks something names the feature it broke. Keep each small; prefer adding
new files under a `weft/` directory over editing upstream ones, because new files never conflict.
