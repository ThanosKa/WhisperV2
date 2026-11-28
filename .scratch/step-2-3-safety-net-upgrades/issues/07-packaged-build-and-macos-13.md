# 07: Packaged build checked, and macOS 13 as the floor

**What to build:** the packaged app is built locally and passes the smoke tests, the app requires macOS 13, and the update feed tells installed builds on macOS 11-12 not to update. Follows [Spec: Steps 2 and 3](../spec.md), "Step 3: macOS floor and the update gate" and "Step 3: packaged build".

**Blocked by:** 04

**Status:** resolved

**Label:** ready-for-agent

**Model:** Opus (run `/model opus` before `/implement`). The stubs may not reach a packaged app, and `electron-builder` may not write the feed field: both need a judgment call on the fallback.

- [x] The smoke tests can launch either the development app or a packaged app
- [x] The packaged app is built for the current architecture with `electron-builder --dir`, signing and notarizing off, and the suite runs against it. If the permission stub cannot reach it, only Smoke 1 runs there, accepting the permission header as "the app opened", and the reason is recorded here. Built; the suite run is deferred to the end-of-spec run (owner, 2026-11-28)
- [x] `minimumSystemVersion` is `'13.0'` in the macOS build config
- [x] A local macOS build without publishing produces a `latest-mac.yml` containing `minimumSystemVersion: 22.0.0` (Darwin 22 is macOS 13), through `electron-builder` config if the installed version supports it with that value, otherwise through a release step that adds it before upload. The file is saved in `assets/` as proof
- [x] Nothing is published or released
- [x] The Electron suite against the development app, both Jest suites, `whisper_web` lint and type-check still pass. Both Jest suites, lint and type-check pass; the Electron suite is deferred to the end-of-spec run (owner, 2026-11-28)
- [x] Work on its own branch, merged into `dev` through a pull request (PR #12; review fixes in the closing PR)

## Comments

### 2026-11-28, implementation (branch `step-2-3-07-packaged-build-macos-13`)

**No Electron run in this ticket (owner, 2026-11-28).** Neither the development app nor the packaged app was launched, and the Electron suite did not run. It runs once at the end of the spec. Everything below was checked statically. The full record is in `assets/packaged-build-check.md`.

**End-of-spec run, packaged app.** Run these from the repo root, after the development-app run:

```sh
pnpm run package:e2e                          # build:all, then the unsigned arm64 test build into dist-e2e/
WHISPER_E2E_APP=packaged pnpm run test:e2e    # all 10 tests against dist-e2e/mac-arm64/Whisper.app
```

**How the stubs reach a packaged app: a test build with its own entry point.** The Smoke-1-only fallback is not needed.
- `-r` does not work. Electron's default app reads it, and a packaged app runs its own entry instead.
- `NODE_OPTIONS=--require` does not work either. Electron ignores NODE_OPTIONS in packaged apps, and Playwright deletes `NODE_OPTIONS` from the launch env.
- So `tests/e2e/electron-builder.e2e.yml` extends the release config. It changes only these:
  - `extraMetadata.main` is `tests/e2e/support/packaged-main.js`. That file requires `main-preload.js`, then `src/index.js`.
  - Those two files are added to `files`.
  - `directories.output` is `dist-e2e`.
  - `mac.identity` and `afterSign` are `null`.
- The asar, the unpacked natives, `resourcesPath/out` and `app.isPackaged` are the same as in a release build. With the preload loaded, every stub from ticket 02 applies: userData, permissions, the fake microphone, screencapture, pkill, SystemAudioDump and displays. The packaged SystemAudioDump path still ends in `/SystemAudioDump`, so the spawn stub matches.
- Playwright connects through `--inspect=0`. The build flips no fuse, and `EnableNodeCliInspectArguments` is on.
- If the end run shows the stubs do not reach the packaged app (the permission header shows), fall back to the spec's Smoke 1 only, and record that here.

**Choosing the app.** `WHISPER_E2E_APP` is `development` (the default) or `packaged`; any other value throws. `fixtures.ts` turns it into `{ kind: 'development' } | { kind: 'packaged'; executablePath }`.
- The packaged app launches with `executablePath` and only `--force-device-scale-factor=1`. Playwright adds no loader for an `executablePath`.
- A missing build fails with "build it with `pnpm run package:e2e`".
- `database.ts` keeps reading the DB with the development Electron in Node mode. It is the same Electron 45 and the same `better-sqlite3`.

**New stub: the update check.** A packaged app runs `autoUpdater.checkForUpdatesAndNotify()` at start, against GitHub, and would download a newer release. When `app.isPackaged`, the preload makes `checkForUpdates` and `checkForUpdatesAndNotify` resolve to `null`. The development app is unaffected, because electron-updater skips unpackaged apps. A `--dir` build also has no `app-update.yml`.

**The feed field: a release step, because electron-builder cannot write it.**
- electron-builder 26.18.1 writes `minimumSystemVersion` only to `Info.plist` (`macPackager.js`).
- Its `releaseInfo`, the only config spread into the feed, has a closed schema (`additionalProperties: false`).
- `afterAllArtifactBuild` runs before `latest-mac.yml` is written, and the upload sends the in-memory copy.
- So `scripts/add-mac-feed-minimum-system-version.js` runs after the build, before any upload:
  - It reads `mac.minimumSystemVersion` from `electron-builder.yml` (`'13.0'`).
  - It maps the macOS major version to Darwin with a table: 11→20 … 15→24, then 26→25. There is no formula after macOS 15. It refuses unknown or minor floors.
  - It writes `minimumSystemVersion: 22.0.0` into `dist/latest-mac.yml`, and it is idempotent.
- Wiring:
  - `dist:mac` runs the step after `electron-builder --mac --publish never`.
  - The new `release:mac` runs `dist:mac`, then `electron-builder publish --policy always --files dist/latest-mac.yml dist/*.dmg dist/*.dmg.blockmap dist/*-mac.zip dist/*-mac.zip.blockmap`.
  - The macOS step in `build.yml` runs `pnpm run release:mac`. The conflict with ticket 05's pnpm line was resolved in the merge.
- The publish half was not run: nothing may publish before step 9.
- `js-yaml` ^4.3.2 is a new root devDependency, the same version already in the lockfile.
- Proof:
  - `assets/latest-mac.yml`.
  - `assets/mac-feed-check.js` reads the feed with electron-updater's parser and applies its `semver.lt(os.release(), …)` rule. macOS 11.7 and 12.7 get no update; 13.0, 15 and 26 update. The same check on electron-builder's own feed lets every version update.

**Build config changes (`electron-builder.yml`):**
1. `minimumSystemVersion: '13.0'`.
2. `npmRebuild: false`.
   - Every native module is prebuilt: `better-sqlite3` 13 has N-API prebuilds, and sharp has its `@img` packages.
   - With rebuild on, `@electron/rebuild` ran node-gyp for nothing and left a `build/` folder in `node_modules/better-sqlite3`.
3. `mac.x64ArchFiles: 'Contents/Resources/app.asar.unpacked/node_modules/{@img/sharp-*,better-sqlite3}/**'`.
   - The universal release build failed at the merge: the x64 and arm64 builds both carry both architectures' sharp binaries (`supportedArchitectures` from ticket 04). That is a regression from 04 that only a universal build shows.
   - Those files are already per-architecture, so one copy is kept.

**Static checks on the packaged app** (details in `assets/packaged-build-check.md`):
- `Info.plist` `LSMinimumSystemVersion` is 13.0, in both the test build and the universal release build.
- `better-sqlite3` loads `prebuilds/darwin-arm64.node`, and no compiled `build/` copy is packaged.
  - It is a Node-API module: it exports `napi_register_module_v1` and needs Node-API 10. It imports no V8 or Node C++ symbols, so it is not tied to an ABI number.
  - Electron 45.5.0 (Node 24.22.3) provides Node-API 10.
- Both builds carry only the linker's ad-hoc signature (`TeamIdentifier=not set`).

**Signing and publishing.** Every build ran with the signing, notarizing and publishing variables unset and `CSC_IDENTITY_AUTO_DISCOVERY=false`, with `--publish never` and `-c.mac.identity=null`. `notarize.js` skipped. Nothing was pushed or published.

**Left for step 9 (not changed here):**
- The `publish` script (`electron-builder --publish always`) on a Mac still uploads a feed without the floor. Only `release:mac` adds it.
- `notarize.js` still passes `appBundleId`, which `@electron/notarize` 3 ignores.
- The packaged app also ships the Linux and Windows `better-sqlite3` prebuilds (about 2 MB each). This is harmless.

**Checks (after `git merge dev`, with ticket 05 merged):**

| Check | Result |
|---|---|
| `pnpm run package:e2e` | exit 0 (`dist-e2e/mac-arm64/Whisper.app`) |
| Release mac build, no publish, signing off, then the feed step | exit 0, universal dmg + zip, feed has `minimumSystemVersion: 22.0.0` |
| Root Jest | 13 suites, 124 tests passed |
| `whisper_web` Jest | 5 suites, 49 tests passed |
| `whisper_web` lint | no warnings or errors |
| `whisper_web` type-check | exit 0 |
| `tsc --strict` on `tests/e2e/fixtures.ts` and the specs | clean, apart from the existing missing `@types/ws` in `fakeServer.ts` |
| Electron suite, development app and packaged app | deferred to the end-of-spec run (owner, 2026-11-28) |

### 2026-11-28, end-of-spec run (branch `step-2-3-end-run`, `dev` at 7ab4197)

End-of-spec run 2026-11-28: development app passed, 10 of 10 in one full run (46.9 s). Root Jest 124 passed, `whisper_web` Jest 49 passed, `whisper_web` lint clean, type-check exit 0.

End-of-spec run 2026-11-28: packaged app passed, with one flaky test. `pnpm run package:e2e` exit 0, then `WHISPER_E2E_APP=packaged pnpm run test:e2e`, one full run: 9 of 10 passed (51.6 s). The stubs reached the packaged app: the header opened logged in (no permission screen), and Listen, Ask and Smoke 4 passed.
- Failed: the Settings-window screenshot. The fixture's 20 s wait for the startup windows timed out (load average 12.2 at the start, from other work). This is the "startup windows over 20 s" flake ticket 04 saw under load.
- Closing the app after that failure threw `TypeError: Object has been destroyed` at `windowManager.js:415`: the `onComplete` of `animateWindowBounds` in `window:adjustWindowHeight` calls `setResizable` on the destroyed window. It is the same kind of app bug as ticket 02's fade-out throw, at another call site, and shows only when the app quits mid-animation. Not fixed. The error went to the log, so no dialog appeared.
- Rerun of that test alone (`--grep "Settings window"`): passed on the first try (load 6.6). Flaky, not broken. No code changed.

### 2026-11-28, review fixes (branch `step-2-3-review-fixes`)

- **A failed release upload exited 0.** `electron-builder publish` 26.18 catches every upload error, logs "error publishing" and returns null (`publishPackageWithTasks`), and a shell glob that matched nothing reached it as a literal file name. CI would go green on a partial draft release. `release:mac` now runs `node scripts/release-mac.js` after `dist:mac`: it checks that `dist/` holds `latest-mac.yml`, a `.dmg`, a `.dmg.blockmap`, a `-mac.zip` and a `-mac.zip.blockmap`, uploads only those through `publishArtifactsWithOptions`, and exits 1 when a file is missing or the upload returns null.
  - Tests: `tests/unit/scripts/releaseMac.test.js` (4 tests: upload failure, only the release files uploaded, missing file uploads nothing, the command exits 1 on an empty folder). No test uploads.
  - One-off check, no network: the real command on a scratch folder of five dummy files, with no `GH_TOKEN`, `GITHUB_TOKEN` or `GITHUB_RELEASE_TOKEN` set. electron-builder logged "error publishing ... GitHub Personal Access Token is not set" (thrown before any request) and the command exited 1.
- **The `publish` script is deleted.** It uploaded a macOS feed without the floor, and nothing ran it (CI runs `release:mac`). The README line that named it now names `release:mac`. This replaces the "Left for step 9" note above.
- **Justified scope, kept:** `js-yaml` (the feed step parses and writes `latest-mac.yml` with it), `npmRebuild: false` and `mac.x64ArchFiles` (both explained under "Build config changes" above: nothing native is compiled at packaging time, and the universal merge failed without the second).

### 2026-11-28, review-fixes run (branch `step-2-3-review-fixes`)

After all review fixes, `pnpm run build:all`, then the Electron suite once per app. The Playwright suite now lists 14 tests: the 10 Electron tests and the 4 fake-server tests (no app launched).
- Root Jest 130 passed (124 + 2 Screenshot-window + 4 release tests). `whisper_web` Jest 49 passed, lint clean, type-check exit 0. `tsc --strict` on `tests/e2e/*.ts`: clean apart from the existing missing `@types/ws`.
- Development app, one full run of `pnpm run test:e2e` (load 4.0): 11 of 14 passed in 47.0 s. The 3 failures were screenshots at the new exact match (`threshold: 0`): Screenshot window, Listen window, Plan window. All smoke tests and the other screenshots passed. Ticket 02's comments have the measurements and the fix.
- Development app, the screenshot spec rerun once after that fix (with `threshold: 0.1`, no pixel allowance; load 4.5): 5 of 6 passed in 28.4 s. Listen failed on 2 pixels of its select arrow. The final tolerance (`threshold: 0.1`, `maxDiffPixels: 5`) was then checked offline with Playwright's own image comparator on the saved images of both development runs: all pass. The development suite was not run again (one run, one rerun).
- Packaged app: `pnpm run package:e2e` exit 0, then `WHISPER_E2E_APP=packaged pnpm run test:e2e`, one full run with the final tolerance (load 5.0): 14 of 14 passed in 34.2 s. No flake, no rerun.
