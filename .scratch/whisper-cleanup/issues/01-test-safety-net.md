# Test safety net today

Status: resolved
Type: task
Blocked by: none

## Question

Do the existing tests pass today, and what do they cover? Run `npm test` (Jest unit + integration), `npm run test:e2e` (Playwright), and the `whisper_web` tests. Record: pass/fail counts, failures and why, coverage per area (`src/features/*`, `src/bridge`, `src/window`, `whisper_web`), which user-facing flows have no test at all, and for each test file whether it runs the real thing or mostly asserts on mocks (see "Real tests" in `CODING_STANDARDS.md`). This decides how much safety net a behavior-preserving TypeScript migration has.

## Answer

Ran on 2026-11-23, Node v26.13.1, npm 11.20.0.

### Results

| Suite | Result |
| --- | --- |
| Root Jest (`npm test`, unit + integration) | 13 suites, **124 tests, all pass** |
| Root Playwright (`npm run test:e2e`) | 4 files, all `describe.skip` placeholders ("awaiting UI selectors"): **0 real tests** |
| `whisper_web` Jest | 5 suites, **49 tests, all pass** |
| `whisper_web` Playwright (`e2e/`, 22 tests) | **Not run**: the browser build for Playwright 1.55 was missing. The owner chose to skip it. |

### Setup problems found (these block a clean install today)

- **`npm ci` fails:** `package-lock.json` is out of sync with `package.json` (missing `@electron/windows-sign`, `postject`, `fs-extra@11`, ...).
- **`npm install` fails on Node 26:** `better-sqlite3@9.6` does not compile against Node 26. npm rolls back, so nothing is installed. Jest only ran after `npm install --ignore-scripts`, which skips the native build and the Electron binary download. The repo pins no Node version (no `.nvmrc`, no `engines`). Node v20.19.4 is installed under nvm.
- **Root Jest also picks up `.claude/worktrees/*/tests`** (stale agent worktrees, 26 extra failing suites). Run it with `--testPathIgnorePatterns '/.claude/'`, or add that pattern to `jest.config.js`.
- **The `whisper_web` Playwright config reuses any server on port 3000.** A different Next 16 server was listening there, so the tests would have run against the wrong app.
- `WHISPER_TEST_MODE`, set by `tests/setup/electronHelper.js`, is read nowhere in `src/`.

### Coverage: root Jest (lines)

Total 26.6% of the files in `collectCoverageFrom` (`src/features/**`, `src/bridge/**`). `src/window`, `src/ui`, `src/index.js` and `src/preload.js` are outside that scope, so they count as 0% without appearing in the report.

| Area | Lines |
| --- | --- |
| `features/ask/askService` | 69% |
| `features/settings/settingsService` | 58% |
| `features/listen/listenService` | 44% |
| `features/common/services/authService` | 27% |
| `features/common/ai/llmClient` | 22% |
| `features/listen/summary/summaryService` | 21% |
| `features/listen/stt/sttService` | 15% |
| `features/common/repositories/*` | 0-19% (always mocked) |
| `features/common/services/sqliteClient`, `databaseInitializer`, `permissionService` | 0-8% |
| `features/shortcuts/shortcutsService` | 0% |
| `bridge/featureBridge`, `bridge/windowBridge` (all IPC handlers) | 0% |
| `bridge/internalBridge` | 100% |
| `window/*`, `ui/*` (Lit), `index.js`, `preload.js` | not measured, no tests |

The integration tests cover one flow in depth: **crash recovery** (transcripts, insights, session persistence, multiple crashes, recovery UI events). They run `listenService` with the real `windowManager` and `sttService`, and with the database and LLM mocked.

### Coverage: `whisper_web` Jest (lines)

Total 29.8%. Well covered: `login` (95%), `settings` (97%), `SettingsTabs`, `activity` list (76%), `utils/auth` (80%). Not covered (0%): `activity/details`, `personalize`, `settings/billing`, `settings/privacy`, `help`, `download`, `Sidebar`, `SearchPopup`, `AuthGuard`, the activity components. `utils/api.ts` is at 50%. `backend_node/` (the Express bridge) has no tests at all.

### User-facing flows with no automated test

- Launching the app, windows, positioning and smooth movement (`src/window/*`).
- Every IPC call between the renderer and main (`featureBridge`, `windowBridge`, `preload.js`).
- All Electron UI (`src/ui/*`: header, listen, ask, settings, screenshot, plan).
- Keyboard shortcuts.
- Audio capture (`SystemAudioDump`, mic) and the real STT socket; `sttService` is mostly mocked.
- Real SQLite reads and writes, and migrations.
- Login through the browser and deep link, beyond the mocked `authService` unit tests.
- Presets and personalize, billing, the `backend_node` routes.

### What this means for the TypeScript move

The safety net is thin. Service logic in ask, settings and listen, plus crash recovery, has real tests. The layers a TS migration touches most (IPC bridges, preload, windows, UI, database) have none. A behavior-preserving migration needs either new tests at those seams first, or a manual smoke checklist per step. The first step is a reproducible install: pin Node, re-sync the lockfile, ignore `.claude/` in Jest.
