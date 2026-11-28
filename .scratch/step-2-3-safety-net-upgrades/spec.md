# Spec: Steps 2 and 3, safety net and upgrades

Status: open
Label: ready-for-agent

Steps 2 and 3 of [Order of the work](../whisper-cleanup/issues/07-work-order.md), from the [Whisper cleanup map](../whisper-cleanup/map.md), run as one spec (amended 2026-11-28). Decisions come from [Test safety net today](../whisper-cleanup/issues/01-test-safety-net.md), [Which tests to delete](../whisper-cleanup/issues/09-which-tests-to-delete.md), [What the smoke tests and screenshots cover](../whisper-cleanup/issues/11-smoke-test-coverage.md), [Target versions for the upgrade](../whisper-cleanup/issues/10-upgrade-target-versions.md), [macOS minimum version](../whisper-cleanup/issues/12-macos-minimum-version.md) and [whisper_web cleanup scope](../whisper-cleanup/issues/18-whisper-web-cleanup.md).

## Problem Statement

The owner wants every dependency of `WhisperV2` on its latest stable version, so that the next steps (TypeScript, React UI, direct-to-Soniox) start from a supported toolchain. Today that is unsafe and partly impossible:

- **No safety net for what an upgrade breaks.** The 124 root Jest tests and 49 `whisper_web` tests cover service logic. Nothing tests that the app opens, that its windows show, that Ask answers, that Listen records, or that settings persist. The four Electron e2e files are empty placeholders. An Electron or Chromium upgrade could break a window and no test would notice. The owner checks nothing by hand until the end, so a break found late is expensive to trace.
- **The app cannot be installed cleanly.** `npm ci` fails (the lockfile is out of sync) and `npm install` fails on Node 26 (`better-sqlite3` 9.6 does not compile). On this machine the installed `node_modules` has no Electron binary and no native `better-sqlite3` build, so the app cannot even launch; only Jest runs.
- **Old, unsupported versions.** Electron 30, Next 14, React 18, Tailwind 3, ESLint 8, Express 4, no pinned Node, npm, and about 20 dependencies nothing imports.
- **The dashboard's look is unguarded.** Tailwind 4 changes default styles; no test covers how the 10 dashboard pages look.
- **macOS 11 and 12 users would get a build that will not open.** Electron 45 drops them, and the installed builds' auto-updater would still offer them the update.

## Solution

Step 2 first builds a safety net on today's code; step 3 then upgrades everything with that net in place.

- **Step 2, safety net.** The app installs and launches on this machine as it is today. A small Playwright suite drives the real Electron app offline against a local fake server: 4 smoke tests and 6 screenshots, one per window. A one-off script takes "before" screenshots of the 10 dashboard pages. The empty Electron e2e files and `whisper_web`'s Playwright tests are deleted.
- **Step 3, upgrades.** Node 26, pnpm (one workspace with `whisper_web`), Electron 45, `better-sqlite3` 13 and every other dependency move to their latest stable versions; unused dependencies are deleted. A clean install works from a fresh clone. The minimum macOS becomes 13, and the update feed tells installed builds on macOS 11-12 not to update. After the upgrade the smoke tests, screenshots, Jest suites, lint and type-check pass as before, also against a packaged build, and the dashboard pages look the same.

Nothing the user sees changes, except that macOS 11-12 users stay on the last build that runs for them.

## User Stories

### Safety net (step 2)

1. As the owner, I want today's app to install and launch on my machine, so that tests can drive it before anything changes.
2. As the owner, I want the install used for the baseline written down exactly, so that the "before" state can be rebuilt on this machine if needed.
3. As the owner, I want an automated test that the app opens and shows its header, so that a broken launch is caught at once.
4. As the owner, I want an automated test that Ask streams an answer to a typed question, so that the main feature is guarded through the upgrade.
5. As the owner, I want an automated test that Listen starts, shows a transcript, stops and saves the session, so that the recording flow is guarded.
6. As the owner, I want an automated test that a settings change survives a restart, so that settings storage is guarded.
7. As the owner, I want a screenshot of each of the six windows (header, Ask, Listen, Settings, Plan, Screenshot) in its normal state, so that a visible change in any window fails a test.
8. As the owner, I want the tests to run offline against a local fake server, so that they never touch production, never cost money and give the same result every time.
9. As the owner, I want the fake server to fail the test on any request it does not know, so that a hidden call to the real network or a changed endpoint is noticed instead of hanging.
10. As the owner, I want each test to start from a throwaway profile folder with a seeded logged-in session, so that tests never read or change my real app data and never need a real login.
11. As the owner, I want the macOS permission check answered as "granted" inside the tests, so that the tests do not depend on what my Mac has allowed for the development Electron binary, which resets when Electron changes.
12. As the owner, I want the screenshots stable (fixed window size, animations off, changing text such as timers masked), so that they fail only on real visual change.
13. As the owner, I want the Electron suite written in TypeScript, so that step 4 does not rewrite it.
14. As the owner, I want the suite to need no change to the app's code, so that the "before" state is the app as users have it.
15. As the owner, I want "before" screenshots of the 10 dashboard pages on fake data, kept outside the code, so that the Tailwind 4 change can be compared afterwards.
16. As the owner, I want the dashboard screenshots taken by a script, not by driving my own browser, so that no browser session of mine is used.
17. As the owner, I want the four empty Electron e2e files and their unused helper deleted, so that the only e2e tests are real ones.
18. As the owner, I want `whisper_web`'s Playwright tests, config and dependency deleted, so that Playwright is used only for the Electron app, as decided.
19. As the owner, I want the committed Playwright output folders deleted and ignored, so that test runs leave no noise in git.
20. As an agent, I want one command that runs the whole Electron suite, so that I can run it after every later step.
21. As an agent, I want the suite's baseline (all counts and the screenshots) recorded at the end of step 2, so that step 3 is judged against it.

### Upgrades (step 3)

22. As the owner, I want a fresh clone to install with one command on the pinned Node, so that a new machine or CI never breaks on install.
23. As the owner, I want Node 26 pinned in `.nvmrc` and `engines`, and pnpm pinned in `packageManager`, so that everyone runs the same versions.
24. As the owner, I want one pnpm workspace for the app and `whisper_web`, so that there is one lockfile and one install.
25. As the owner, I want both `package-lock.json` files deleted, so that npm and pnpm never disagree.
26. As the owner, I want every dependency on its latest stable version (the list in [Target versions for the upgrade](../whisper-cleanup/issues/10-upgrade-target-versions.md)), so that the app runs on supported, patched software.
27. As the owner, I want the dependencies nothing imports deleted, so that installs are smaller and nothing unused needs upgrading.
28. As the owner, I want `better-sqlite3` 13, so that one prebuilt binary works for both Electron and Node and the native rebuild step goes.
29. As the owner, I want the scripts in `package.json` to use pnpm, so that no script calls npm.
30. As the owner, I want CI on Node 26 with pnpm, and running on pull requests to `dev`, so that the branch where all cleanup work lands is checked.
31. As the owner, I want the release workflow moved to Node 26 and pnpm, so that step 9's release builds with the same toolchain.
32. As the owner, I want the orphaned `aec` submodule entry deleted, so that git stops pointing at a folder that does not exist.
33. As a macOS 13+ user, I want the app to behave exactly as before, so that the upgrade is invisible to me.
34. As a macOS 11 or 12 user, I want my installed app not to download an update that cannot open, so that I keep a working app.
35. As the owner, I want the packaged app built and launched once by the smoke tests, so that packaging breaks (native modules, asar, hoisted node_modules) are caught now, not at step 9.
36. As the owner, I want the dashboard to look the same after Next 16, React 19 and Tailwind 4, so that the upgrade is invisible there too.
37. As the owner, I want the Electron screenshots to match the step-2 baseline, and any baseline change explained in its ticket, so that a re-baseline never hides a real change.
38. As the owner, I want `whisper_web` lint to keep working after `next lint` is gone, so that the dashboard keeps the same rules.
39. As the owner, I want Jest left at its current major in both places, so that a test tool that step 4 deletes does not add a second cause of breakage now.
40. As the owner, I want each piece of the work on its own branch and pull request into `dev`, merged by the agent, so that `main` and releases stay untouched until step 9.
41. As an agent, I want the full suite (Electron suite, both Jest suites, `whisper_web` lint and type-check) run after every ticket, so that a break points at one change.

## Implementation Decisions

### Order and tickets

- Step 2 comes first. Every step-3 ticket is blocked by the step-2 tickets it needs: the Electron suite with its six screenshots, and the dashboard "before" screenshots.
- Within step 3, the order follows the risk: the workspace and pnpm move with the version bumps of the Electron side first, then `whisper_web` (Next 16, React 19, Tailwind 4, ESLint 10), then the packaged-build check and the macOS floor. `/to-tickets` decides the cut.
- Each ticket runs on its own branch and merges into `dev` through a pull request (the map's Branches note). Nothing goes to `main`.

### Step 2: a runnable "before" install

- The app is installed on this machine with Node 20 (the version CI uses today, under nvm), so that `better-sqlite3` 9.6 compiles and the Electron binary is downloaded. The `postinstall` rebuild (`electron-builder install-app-deps`) builds `better-sqlite3` for Electron 30. The re-synced lockfile is not committed: step 3 deletes it, and committing it would move versions inside their ranges before the baseline is taken. The exact commands go into the ticket.
- The app is built the way `npm start` builds it today (renderer bundle and the `whisper_web` export plus its API), because main serves the dashboard from those files at launch.

### Step 2: the Electron suite

- **Driver:** Playwright's Electron support (`_electron.launch`), the Playwright version already installed. Step 3 moves it to 1.65.
- **Language:** TypeScript test files, which Playwright compiles itself. Type-checking them starts in step 4a-1 with the rest of the TS setup.
- **Folder:** today's e2e folder, which already holds the Playwright config. The four empty files and the unused launch helper (it sets `WHISPER_TEST_MODE`, which no code reads) are deleted.
- **What it covers, exactly** ([What the smoke tests and screenshots cover](../whisper-cleanup/issues/11-smoke-test-coverage.md)):
  - Smoke 1: the app opens and the main header shows (not the login or permission header).
  - Smoke 2: Ask answers a typed question, with the answer streamed from the fake server.
  - Smoke 3: Listen starts, a transcript from the fake STT side shows, Listen stops, and the session is in the database. The database is read from the throwaway profile after the app closes.
  - Smoke 4: a setting changed in the Settings window is still set after a restart with the same profile.
  - Six screenshots, one per window in its normal state: header, Ask, Listen, Settings, Plan, Screenshot. macOS only, fixed window size, animations off, changing text masked. Step 2 and 3 compare with an exact match; the small tolerance from [DESIGN.md scope](../whisper-cleanup/issues/17-design-md-scope.md) starts in step 6.
- **Fake server.** One local server, started by the test on a free port, stands in for WhisperAPP and the STT relay. It speaks HTTP for WhisperAPP (session status, user by session, LLM chat and stream, and whatever else the app calls at startup) and WebSocket in the relay's protocol for STT. It answers with fixed data and fails the test on any request it does not know.
- **Wiring the fake server.** The app reads `API_BASE_URL` (auth and LLM) and `STT_RELAY_URL` (STT) at runtime. The test sets both, and sets the other URL variables the code reads (`whisper_API_URL`, `whisper_WEB_URL`) to the fake server too, so the repo's `.env` file cannot point a test at a real service. This corrects ticket 11, which named `whisper_API_URL`: that one is not the variable auth and LLM use.
- **Throwaway profile and seeded login.** Each test gets an empty temporary folder as the app's `userData`, so the database, `electron-store` files and the single-instance lock never touch the owner's real data. Before launch the test writes the `auth-session` store with a session id that the fake server accepts. Smoke 4 reuses the same folder across its two launches.
- **OS boundaries stubbed in the test, not in the app.** The macOS permission check (`getMediaAccessStatus`) answers "granted" for microphone and screen; the microphone is Chromium's fake media device. Both are system boundaries, which the tests may stub (`CODING_STANDARDS.md`, "Real tests"). The stubs and the `userData` setting run inside main before the app's own code, set up by the test (a main-process preload loaded at launch, or Chromium switches), so the app's code does not change. If one of them cannot be done without an app change, the ticket adds the smallest test-only hook it can, read from an environment variable, and records why. System audio capture (`SystemAudioDump`) is not exercised; if Listen cannot start without it, the ticket finds the smallest boundary to stub and records it.
- **Command:** `test:e2e` runs the suite. It runs on the owner's Mac, by the agent, after every ticket. CI does not run it in steps 2-3 (see Out of Scope).

### Step 2: dashboard "before" screenshots

- A one-off script, kept in this spec's `assets/` folder and not in the code, starts the dashboard in dev mode with its existing fake data (`NEXT_PUBLIC_DEV_MOCK=1`) and takes a full-page screenshot of each of the 10 pages (home, login, activity, activity details, personalize, settings, billing, privacy, help, download) with Playwright's headless Chromium, at a fixed viewport. The images go to `assets/` next to the script.
- This replaces the Claude in Chrome check in [whisper_web cleanup scope](../whisper-cleanup/issues/18-whisper-web-cleanup.md) (owner, 2026-11-28): it needs no browser session of the owner's, and the comparison stays by eye, done by the agent reading the before and after images, with a pixel diff to point at where they differ.

### Step 2: deletions

- The four empty Electron e2e files and the unused helper.
- `whisper_web/e2e/`, its Playwright config and the `@playwright/test` dependency in `whisper_web`, and its `test:e2e*` scripts.
- The committed Playwright output (`test-results/`, `playwright-report/`, in the root and in `whisper_web`), then added to `.gitignore`.

### Step 3: toolchain

- **Versions:** the targets in [Target versions for the upgrade](../whisper-cleanup/issues/10-upgrade-target-versions.md), re-checked against npm on the day of the work for a newer stable patch: Node 26 LTS, pnpm 12, Electron 45, `better-sqlite3` 13, `electron-builder` 26, `electron-updater` 6, `electron-store` 12, Express 5 (root and `whisper_web` together), `sharp`, Playwright 1.65 in the root; Next 16, React 19, Tailwind 4 (`tw-animate-css` replaces `tailwindcss-animate`), ESLint 10, TypeScript 6 in `whisper_web`. Tools that step 4 brings in (electron-vite, Vitest, `typescript-eslint`, zod, pino) are not added yet.
- **Jest stays at its current major** in the root and in `whisper_web`: step 4 replaces it with Vitest. Only the test libraries that React 19 requires (Testing Library) are upgraded.
- **pnpm workspace** with `whisper_web` in it; settings in `pnpm-workspace.yaml`: `nodeLinker: hoisted` (what `electron-builder` needs), `allowBuilds` for the packages that must run install scripts, and `supportedArchitectures` so the universal macOS build gets both architectures' binaries. `.npmrc`, both `package-lock.json` files and the `postinstall` rebuild are deleted. Scripts that call `npm` or `cd whisper_web && npm` use pnpm's workspace commands instead.
- **Pins:** `.nvmrc` and `engines` for Node 26, `packageManager` for pnpm.
- **Unused dependencies deleted:** the lists in ticket 10. `electron-squirrel-startup` is required once at the top of main: that check only matters for Squirrel installers, and the app ships NSIS, so the require goes with the dependency. Root `express` and `cors` stay until step 4a-2.
- **Code changes the upgrade forces, and no others:**
  - `electron-store` 12 is ESM-only: its two requires and the Jest mock take `.default`.
  - Express 5: the two `listen` callbacks in main reject on error.
  - `whisper_web`: `swcMinify` and the `webpack` key leave `next.config.mjs`; `next lint` becomes `eslint .` with an ESLint 10 flat config holding the same rules as today (`next/core-web-vitals`); the Tailwind 4 upgrade tool runs, then any page that looks different is fixed until it matches its "before" screenshot.
  - The unresolved items in ticket 10 are checked during the work: whether user ids can contain `.` or `[` (`electron-store` 12 throws on those keys), and the glibc floor of the `better-sqlite3` Linux binaries.
- **The `aec` submodule entry** (`.gitmodules`) is deleted; the folder does not exist. The vendored `aec.js` stays.
- **CI** (`ci.yml`): Node 26, `pnpm/action-setup`, one `pnpm install --frozen-lockfile`, both Jest suites, `whisper_web` lint and type-check; triggered on pull requests to `dev` and `main`. **Release workflow** (`build.yml`): Node 26 and pnpm, same commands otherwise. It is not run: it publishes a release, which waits for step 9.
- **Root lint** keeps failing as today (ESLint is not installed in the root). The shared ESLint 10 config arrives in step 4b-1.

### Step 3: macOS floor and the update gate

- `minimumSystemVersion` becomes `'13.0'` in the macOS build config (written to the app's `Info.plist`).
- **The gate is in the update feed, because the installed builds decide.** Users on macOS 11-12 run builds with `electron-updater` 6.6. Its check compares the update feed's `minimumSystemVersion` with `os.release()`, which on macOS is the Darwin kernel version, not the macOS version. macOS 13 is Darwin 22, so `latest-mac.yml` must carry `minimumSystemVersion: 22.0.0`. A value of `13.0` would let macOS 12 (Darwin 21) through. The installed `electron-builder` 26.0 does not write this field to the feed at all.
- The release build makes sure `latest-mac.yml` has that line, through `electron-builder` config if version 26.18 supports it with the right value, otherwise through a release step that adds it before upload. Proof in step 3: a local macOS build without publishing produces a `latest-mac.yml` containing `minimumSystemVersion: 22.0.0`.

### Step 3: packaged build

- The smoke tests can launch either the development app or a packaged app. Step 3 builds the packaged app for the current architecture once (`electron-builder --dir`, signing and notarizing switched off for this local build) and runs the suite against it. If the permission stub cannot reach a packaged app, only Smoke 1 runs there, and it accepts the permission header as "the app opened".

## Testing Decisions

The owner confirmed these seams (2026-11-28).

- **A good test checks only what a user or caller sees:** a window's content, a streamed answer, a saved session, a persisted setting, a screenshot. It stubs only what cannot run locally: WhisperAPP, the STT relay, macOS permissions and the microphone. It does not reach into the app's modules.
- **Seam 1, the Electron app through Playwright** (new, the highest seam): the 4 smoke tests and 6 screenshots above, run against the development app after every ticket, and against a packaged app once in step 3. Its baseline is recorded at the end of step 2.
- **Seam 2, the existing suites**, unchanged in what they test: root Jest (124), `whisper_web` Jest (49), `whisper_web` lint and type-check. They stay green through step 3 and change only where an upgrade forces it (the `electron-store` mock, React 19 Testing Library). Rewriting them to Vitest at the agreed seams is step 4.
- **Seam 3, the dashboard by eye:** the 10 "before" screenshots from step 2, compared with "after" screenshots from the same script once `whisper_web` is upgraded. Every difference is fixed before the ticket closes. Not part of the automated suite, as decided in ticket 18.
- **One-off checks**, kept in this spec's `assets/` folder: a fresh clone installs with `pnpm install --frozen-lockfile` on Node 26; no `package-lock.json`, `.npmrc` or `.gitmodules` is left; the local macOS build's `latest-mac.yml` carries `minimumSystemVersion: 22.0.0`.
- **Prior art:** the four `tests/e2e` placeholders and their helper (shape only, deleted); `whisper_web/e2e/*.spec.ts` stubbed the API with `page.route`, the same "stub only the network" idea the fake server follows; the step-1 baseline and structure check in [Spec: Step 1, housekeeping](../step-1-housekeeping/spec.md) for how counts are recorded.

## Out of Scope

- TypeScript for main and preload, electron-vite, Vitest, zod, pino, the shared ESLint config: step 4.
- Rewriting or deleting the Jest tests listed in [Which tests to delete](../whisper-cleanup/issues/09-which-tests-to-delete.md): step 4 (only the e2e deletions happen here).
- Running the Electron suite in CI. Screenshots taken on CI's macOS would differ from the local baseline, and the owner's Mac is where the agent runs it. A later step can add it.
- The app sending its app and OS version to WhisperAPP, WhisperAPP storing it, and the download page saying "macOS 13 or later" ([macOS minimum version](../whisper-cleanup/issues/12-macos-minimum-version.md)). They change WhisperAPP and only matter once a new build ships in step 9, so they go to step 7, where WhisperAPP is changed anyway.
- Any release, deploy or push to `main`: step 9.
- The `whisper_web` cleanup (Vitest, MSW, folders, deleting `devMock.ts`): step 4b. `devMock.ts` is used here as it is.
- New looks or colors, Kosmos components: steps 5-6.

## Further Notes

- **Ticket 11 named the wrong variable.** It wires the fake server through `whisper_API_URL`, but auth and LLM read `API_BASE_URL`; this spec uses `API_BASE_URL` and sets the others too.
- **Ticket 18 changed:** the dashboard screenshots are taken by a Playwright script, not Claude in Chrome (owner, 2026-11-28).
- **The update-gate finding changes ticket 12's check.** Ticket 12 asked whether `electron-updater` honours `minimumSystemVersion`. It does, but compares it with the Darwin version, so the value in the feed is `22.0.0`, not `13.0`.
- **Risk: Chromium's text rendering.** Electron 30 to 45 is a large Chromium jump; text can render a pixel differently with no visible change. If a screenshot fails only on anti-aliasing, the ticket re-baselines once and saves the diff image and the reason in `assets/`. Any other difference is a bug to fix.
- **Risk: the development Electron binary's macOS permissions reset when Electron changes.** The permission stub makes the suite independent of them; the owner's real-world check stays on the final manual checklist.
- This spec holds roughly 6-8 tickets for `/to-tickets`: the runnable install and the Electron suite need judgment (Opus); the deletions, the dependency list and the CI move are mechanical (Sonnet).
