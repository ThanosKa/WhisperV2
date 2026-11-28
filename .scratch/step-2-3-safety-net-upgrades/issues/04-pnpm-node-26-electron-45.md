# 04: pnpm workspace, Node 26 and Electron 45

**What to build:** a fresh clone installs with one pnpm command on Node 26, and the app runs on Electron 45 and the latest stable root dependencies, with the Electron suite, both Jest suites, `whisper_web` lint and type-check as green as the ticket 02 baseline. Follows [Spec: Steps 2 and 3](../spec.md), "Step 3: toolchain".

**Blocked by:** 01, 02

**Status:** claimed

**Label:** ready-for-agent

**Model:** Opus (run `/model opus` before `/implement`). The biggest risk in the spec: a large Chromium jump, forced code changes, and deciding whether a changed screenshot is a bug or only anti-aliasing.

- [x] Target versions are re-checked against npm on the day of the work for a newer stable patch, and the chosen versions are listed in this ticket's comments
- [x] One pnpm workspace holds the app and `whisper_web`, with `nodeLinker: hoisted`, `allowBuilds` and `supportedArchitectures`; both `package-lock.json` files, `.npmrc` and the `postinstall` rebuild are deleted
- [x] Node 26 is pinned in `.nvmrc` and `engines`, pnpm in `packageManager`; no script calls `npm`
- [x] Root dependencies are on their targets: Electron 45, `better-sqlite3` 13, `electron-builder` 26, `electron-updater` 6, `electron-store` 12, Express 5 (root and `whisper_web` together), `sharp`, Playwright 1.65. Jest stays at its current major
- [x] The unused dependencies from ticket 10 are deleted, `electron-squirrel-startup` together with its require in main. Root `express` and `cors` stay
- [x] Only forced code changes: `electron-store` requires and the Jest mock take `.default`; the two Express `listen` callbacks in main reject on error
- [x] Checked and recorded: whether user ids can contain `.` or `[` (`electron-store` 12 throws on those keys), and the glibc floor of the `better-sqlite3` Linux binaries
- [x] The `aec` entry in `.gitmodules` is deleted; the vendored `aec.js` stays
- [x] A fresh clone installs with `pnpm install --frozen-lockfile` on Node 26 (one-off check saved in `assets/`)
- [ ] The Electron suite passes against the ticket 02 screenshots. A screenshot that fails only on anti-aliasing is re-baselined once, with the diff image and the reason saved in `assets/`; any other difference is fixed
- [x] Both Jest suites, `whisper_web` lint and type-check give the ticket 02 counts
- [ ] Work on its own branch, merged into `dev` through a pull request

## Comments

### 2026-11-28, implementation (branch `step-2-3-04-pnpm-node-26-electron-45`)

**Electron suite deferred to the end-of-spec run (owner, 2026-11-28).** The owner stopped all Electron runs in this ticket. The suite runs once, after every ticket of this spec is merged. The suite checkbox (which includes the screenshot re-baseline) stays unticked. What the suite showed before the stop is written down under "Electron suite" below.

**Versions, re-checked on npm on 2026-11-28.** Two are newer than ticket 10's research: Electron 45.5.0 (was 45.4.1) and `ws` 8.23.1. `ws` stays on 8.23.0, because 8.23.1 was published on 2026-11-27. pnpm's default `minimumReleaseAge` (1 day) refuses it, and an exclusion just for `ws` would weaken that check.

| Package | Before | After |
|---|---|---|
| Node (`.nvmrc` `26`, `engines` `^26.13.1`) | unpinned | 26.13.1 |
| pnpm (`packageManager`) | npm | 12.23.0 |
| `electron` | 30.5.1 | 45.5.0 (Node 24.22.3, Chromium 156) |
| `better-sqlite3` | 9.6.0 | 13.2.0 |
| `electron-builder` | 26.0.x | 26.18.1 |
| `electron-updater` | 6.6.x | 6.8.12 |
| `electron-store` | 8.2.0 | 12.0.0 |
| `express` (root and `whisper_web`) | 4.x | 5.3.0 |
| `cors` (root and `whisper_web`) | 2.8.5 | 2.8.6 |
| `@types/express` / `@types/cors` (`whisper_web`) | 4.17 / 2.8.17 | 5.0.6 / 2.8.19 |
| `sharp` | 0.34.5 | 0.35.5 |
| `@playwright/test`, `playwright` | 1.56.1 | 1.65.1 |
| `@electron/notarize` | 2.5.0 | 3.1.2 |
| `dotenv` | 17.x | 18.0.10 |
| `ws` | 8.18.x | 8.23.0 |
| `esbuild` | 0.25.x | 0.28.2 |
| `prettier` | 3.6.x | 3.10.1 |
| `jest`, `@jest/globals`, `jest-environment-node`, `@types/jest` | 29 | 29 (unchanged on purpose) |

**Workspace** (`pnpm-workspace.yaml`):
- `packages: [whisper_web]` and `nodeLinker: hoisted`.
- `allowBuilds` allows `esbuild` and denies `electron-winstaller` (Squirrel only). Electron 45, `better-sqlite3` 13 and `sharp` 0.35 have no install scripts, so they need no entry.
- `supportedArchitectures` is `cpu: [current, x64, arm64]`. Both `@img/sharp-darwin-*` packages are installed.
- `permissions: dotenv: skills: false`. pnpm 12 also asks for approval of agent skills that ship inside packages, and `dotenv` 18 ships some. They are denied.

**Deleted:**
- Both `package-lock.json` files and `.npmrc`.
- The `postinstall` rebuild.
- The dead `make` script (`electron-forge` is not installed).
- The `aec` entry in `.gitmodules` (the whole file). `src/ui/listen/audioCore/aec.js` stays.

**Scripts:** they use `pnpm run` and `pnpm --filter whisper-frontend run …`. No script calls `npm` any more. The CI workflows still do; ticket 05 changes them.

**Unused dependencies deleted.**
- Root: `@google/genai`, `@google/generative-ai`, `axios`, `jsonwebtoken`, `react-hot-toast`, `react-markdown`, `remark-gfm`, `validator`, `wait-on`, `electron-liquid-glass`, `electron-reloader`, `@electron/fuses`, `dmg-license`, `node-fetch` and `electron-squirrel-startup`.
- `whisper_web`: `@headlessui/react`, `framer-motion`, `shadcn-ui`, `axios` and `react-hot-toast`.
- Root `express` and `cors` stay.

**Code changes:**
1. Forced, as the ticket lists:
   - `require('electron-store').default` in `settingsService.js` and `authService.js`.
   - The Jest mock sets `ElectronStore.default = ElectronStore`.
   - The two Express `listen` callbacks in `src/index.js` now do `err => (err ? reject(err) : resolve(server))`.
2. They come with the deleted dependencies:
   - The `electron-squirrel-startup` require at the top of main.
   - Both `require('node-fetch')` lines: main never called it, and `authService` now uses the global `fetch` with the same options.
3. Forced by Electron 45, not on the ticket's list (`src/window/windowManager.js`, `showScreenshotWindow`):
   - The Screenshot window is created on the first hover, and the app sent its image after a fixed 100 ms.
   - On Electron 45 that page takes 115-180 ms to load, so the image arrived before the page listened. The window stayed on "Loading screenshot…". The Screenshot-window test failed on every run, with `.screenshot-image` not found.
   - The fix is six added lines: the image is sent again on the page's `did-finish-load`. The 100 ms show is unchanged.
   - `showRecoveryToast` uses the same 100 ms pattern. No test covers it, and it is left alone.

**Checked:**
- **User ids and `electron-store` 12 keys.** The `uid` in `users.${uid}` comes from WhisperAPP's `user-by-session` route, which returns `userProfile.clerk_id`. That is a Clerk user id: `user_` plus letters and digits, with no `.` or `[`. The keys stay valid.
- **glibc floor of `better-sqlite3` 13.2.0.** It was read from the prebuilt Linux binaries' symbol versions.
  - `linux-x64.node` and `linux-arm64.node` need glibc 2.34 and libstdc++ `GLIBCXX_3.4.29` (GCC 11), so at least Ubuntu 22.04, Debian 12 or RHEL 9.
  - Older or musl systems use the `linuxmusl-*` prebuilds, or a source build.

**Fresh clone:** `pnpm install --frozen-lockfile` on Node 26.13.1 and pnpm 12.23.0 exits 0, and `better-sqlite3` loads on Node 26. The output is saved in `assets/fresh-clone-install.md`. Electron's binary is not part of the install: it downloads on the first `require('electron')`, or with `pnpm exec install-electron --no`.

**Checks at the end (build and the non-Electron suites only, after the owner's stop):**

| Check | Result | Ticket 02 baseline |
|---|---|---|
| `pnpm run build:all` | exit 0 | exit 0 |
| Root Jest (`pnpm test`) | 13 suites, 124 tests passed | 124 |
| `whisper_web` Jest | 5 suites, 49 tests passed | 49 |
| `whisper_web` lint | no warnings or errors | same |
| `whisper_web` type-check | exit 0 | exit 0 |
| Root lint | fails, as before. It now exits 2 ("no ESLint config") instead of 127, because the hoisted layout puts `whisper_web`'s `eslint` on the root PATH | 127 |

**Electron suite (before the owner's stop, for the end-of-spec run).**
- **Before the upgrade the suite was green.** It passed once on the old toolchain in this worktree (Node 20 and npm), and twice after the move to pnpm and Node 26 with the old versions.
- **The first run on Electron 45:**
  - All four smoke tests passed.
  - Listen and Plan matched the ticket 02 screenshots exactly.
  - Header, Ask and Settings differed by 5, 8 and 9 pixels, all on glyph and icon edges. That is anti-aliasing only.
  - The Screenshot window failed, for the reason under code change 3.
- **Re-baseline.** Header, Ask and Settings were re-baselined once (commit `a1943b2`). The diffs, both images of each and the reason are in `assets/electron-45-rebaseline/`. After the fix and the re-baseline, the full suite passed 10 of 10.
- **The suite became timing-flaky on Electron 45 on this Mac.** In 9 later full runs, 4 passed and 5 each had 1 to 3 failures. The machine's load average was 9-18 from other work. The failures were:
  - The Listen transcript did not arrive within 5 s (all three Listen tests in one run).
  - Ask's input never appeared after a click 0.1 s into the launch. The feature pages finish loading up to about 0.7 s after the header. Commit `eaac143` now makes the fixture wait for them, with a test-only change.
  - The startup windows took more than 20 s to load once.
  - The Screenshot window sometimes captured fully transparent while it was visible. This happened in about 1 of 10 instrumented runs, with both versions of the fix. The `<img>` never finished decoding (`complete=false`), which points at the compositor, not the app's data.
  - None of these reproduced on demand in isolation. The end-of-spec run should look at these first.

**Tried and dropped (owner's focus request).** The suite steals focus on the owner's Mac. A no-focus patch in `main-preload.js` failed: Electron's `BrowserWindow` export cannot be redefined ("Cannot redefine property: BrowserWindow"), so the class could not be swapped. The owner then dropped the request, and the change was reverted, nothing committed.
