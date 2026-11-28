# 04: pnpm workspace, Node 26 and Electron 45

**What to build:** a fresh clone installs with one pnpm command on Node 26, and the app runs on Electron 45 and the latest stable root dependencies, with the Electron suite, both Jest suites, `whisper_web` lint and type-check as green as the ticket 02 baseline. Follows [Spec: Steps 2 and 3](../spec.md), "Step 3: toolchain".

**Blocked by:** 01, 02

**Status:** claimed

**Label:** ready-for-agent

**Model:** Opus (run `/model opus` before `/implement`). The biggest risk in the spec: a large Chromium jump, forced code changes, and deciding whether a changed screenshot is a bug or only anti-aliasing.

- [ ] Target versions are re-checked against npm on the day of the work for a newer stable patch, and the chosen versions are listed in this ticket's comments
- [ ] One pnpm workspace holds the app and `whisper_web`, with `nodeLinker: hoisted`, `allowBuilds` and `supportedArchitectures`; both `package-lock.json` files, `.npmrc` and the `postinstall` rebuild are deleted
- [ ] Node 26 is pinned in `.nvmrc` and `engines`, pnpm in `packageManager`; no script calls `npm`
- [ ] Root dependencies are on their targets: Electron 45, `better-sqlite3` 13, `electron-builder` 26, `electron-updater` 6, `electron-store` 12, Express 5 (root and `whisper_web` together), `sharp`, Playwright 1.65. Jest stays at its current major
- [ ] The unused dependencies from ticket 10 are deleted, `electron-squirrel-startup` together with its require in main. Root `express` and `cors` stay
- [ ] Only forced code changes: `electron-store` requires and the Jest mock take `.default`; the two Express `listen` callbacks in main reject on error
- [ ] Checked and recorded: whether user ids can contain `.` or `[` (`electron-store` 12 throws on those keys), and the glibc floor of the `better-sqlite3` Linux binaries
- [ ] The `aec` entry in `.gitmodules` is deleted; the vendored `aec.js` stays
- [ ] A fresh clone installs with `pnpm install --frozen-lockfile` on Node 26 (one-off check saved in `assets/`)
- [ ] The Electron suite passes against the ticket 02 screenshots. A screenshot that fails only on anti-aliasing is re-baselined once, with the diff image and the reason saved in `assets/`; any other difference is fixed
- [ ] Both Jest suites, `whisper_web` lint and type-check give the ticket 02 counts
- [ ] Work on its own branch, merged into `dev` through a pull request
