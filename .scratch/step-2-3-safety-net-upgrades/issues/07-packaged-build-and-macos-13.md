# 07: Packaged build checked, and macOS 13 as the floor

**What to build:** the packaged app is built locally and passes the smoke tests, the app requires macOS 13, and the update feed tells installed builds on macOS 11-12 not to update. Follows [Spec: Steps 2 and 3](../spec.md), "Step 3: macOS floor and the update gate" and "Step 3: packaged build".

**Blocked by:** 04

**Status:** claimed

**Label:** ready-for-agent

**Model:** Opus (run `/model opus` before `/implement`). The stubs may not reach a packaged app, and `electron-builder` may not write the feed field: both need a judgment call on the fallback.

- [ ] The smoke tests can launch either the development app or a packaged app
- [ ] The packaged app is built for the current architecture with `electron-builder --dir`, signing and notarizing off, and the suite runs against it. If the permission stub cannot reach it, only Smoke 1 runs there, accepting the permission header as "the app opened", and the reason is recorded here
- [ ] `minimumSystemVersion` is `'13.0'` in the macOS build config
- [ ] A local macOS build without publishing produces a `latest-mac.yml` containing `minimumSystemVersion: 22.0.0` (Darwin 22 is macOS 13), through `electron-builder` config if the installed version supports it with that value, otherwise through a release step that adds it before upload. The file is saved in `assets/` as proof
- [ ] Nothing is published or released
- [ ] The Electron suite against the development app, both Jest suites, `whisper_web` lint and type-check still pass
- [ ] Work on its own branch, merged into `dev` through a pull request
