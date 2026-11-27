# Weft on Chromium

The browser. Weft is a Chromium fork: branding, patches and build scripts against a pinned stable
Chromium, with the interface bundled from [`../shell`](../shell/).
The checkout itself is fetched into `chromium/` and never committed. How it is shaped and why:
[`AGENTS.md`](./AGENTS.md). Where it is going: [`plan.md`](./plan.md).

```sh
./scripts/bootstrap.sh     # depot_tools + Chromium at CHROMIUM_VERSION (~35 GB, once)
./scripts/apply.sh         # branding + the shell bundle + patches/ onto a clean checkout
./scripts/build.sh dev     # out/dev/Weft.app
./scripts/smoke.sh dev     # check the build without a screen
node scripts/drive.mjs dev chrome://weft/ --do 'click #addr; type example.com; press Enter; wait 3000'   # drive it, screenshot it
node scripts/drive.mjs dev chrome://weft/ --serve --data /tmp/weft-data --do '…'   # a local server that logs headers; a data dir kept across runs
open chromium/src/out/dev/Weft.app --args --app=chrome://weft   # with a screen: the shell as the window
```
