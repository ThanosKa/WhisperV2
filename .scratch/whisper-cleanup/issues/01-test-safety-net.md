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

The integration tests cover one flow in depth: **crash recovery** (transcripts, insights, session persistence, multiple crashes, recovery UI events). Despite the folder name, they are not integration tests: only `listenService` is real. `sttService`, `summaryService`, `authService`, `windowManager` and every repository are mocked (see the table below).

### Coverage: `whisper_web` Jest (lines)

Total 29.8%. Well covered: `login` (95%), `settings` (97%), `SettingsTabs`, `activity` list (76%), `utils/auth` (80%). Not covered (0%): `activity/details`, `personalize`, `settings/billing`, `settings/privacy`, `help`, `download`, `Sidebar`, `SearchPopup`, `AuthGuard`, the activity components. `utils/api.ts` is at 50%. `backend_node/` (the Express bridge) has no tests at all.

### Real thing or mocks, per test file

Judged against "Real tests" in `CODING_STANDARDS.md` and the `tdd` skill: mock only system boundaries (LLM, network, OS), never your own modules, and test through public interfaces, not private `_methods` or internal fields.

| File | Tests | Real code under test | Own modules mocked | Verdict |
| --- | --- | --- | --- | --- |
| `tests/unit/services/askService.test.js` | 34 | `askService` | session and ask repos, `listenService`, `summaryService`, `windowManager` (+ `llmClient`, a fair boundary) | **Mixed.** The payload-to-LLM and screenshot tests check behavior at the LLM boundary (keep). About 15 tests call private `_detectIntentFromClickPill`, `_resolveProfileForIntent` and `_deriveTitleFromPrompt` (implementation-coupled). |
| `tests/unit/services/askService.webSearch.test.js` | 13 | `askService` | same as above | **Mostly real behavior:** asserts on what reaches `llmClient`. Overlaps the file above in setup. |
| `tests/unit/services/authService.test.js` | 5 | `authService` | user and session repos | **Mostly mocks and internals.** Sets `currentUserId` and `currentUser` fields directly, asserts the same fields back, and has one pure wiring test (`setAuthService` was called). Low value. |
| `tests/unit/services/listenService.test.js` | 6 | `listenService` | 7 modules (stt, summary, auth, settings, repos, `windowManager`) | **Mostly asserts on mocks:** 8 of 11 assertions are `toHaveBeenCalled`. Low value; the crash-recovery files cover the same service more deeply. |
| `tests/unit/services/settingsService.test.js` | 6 | `settingsService` | `authService`, settings repo, `windowManager` (`electron-store` mocked, a fair boundary) | **Mixed.** The merge-with-defaults tests are real behavior. Two tests only check that `initialize()`/`cleanup()` "do not throw" (no value). |
| `tests/unit/services/sttService.test.js` | 4 | `sttService` utterance splitting | `windowManager`, `config`, `authService` | **Real logic, coupled seam.** Checks real splitting with known-good limits, but through the private `_handlePartialSegmentation` and internal `meCommittedLength` fields. |
| `tests/unit/services/summaryService.smartTrigger.test.js` | 7 | `summaryService` trigger rules | `config`, `llmClient` | **Real logic, coupled seam.** Real trigger thresholds, observed through a spy on its own `makeOutline` method and the internal `conversationHistory`. |
| `tests/integration/crash-recovery/*.test.js` (6 files) | 49 | `listenService` recovery | session/stt/summary repos, `sttService`, `summaryService`, `authService`, `windowManager` | **Unit tests named integration.** Assert on return values and on what is sent to the window (`webContents.send`), which is a fair UI boundary. Setup is copied six times, and several scenarios likely overlap. No real database: an in-memory `better-sqlite3` would make them real. |
| `whisper_web/__tests__/*-page.test.tsx` (3 files) | 30 | real pages rendered with Testing Library | `@/utils/api`, `@/utils/auth` (own modules), `next/navigation` | **Mixed.** Assert on what the user sees (good seam), but stub the app's own API module rather than the network. |
| `whisper_web/__tests__/utils/api.test.ts` | 11 | `utils/api` | `devMock` | **Mostly real.** |
| `whisper_web/__tests__/utils/auth.test.ts` | 8 | `utils/auth` | `utils/api`, `devMock`, `next/navigation` | **Mixed.** |
| `whisper_web/e2e/*.spec.ts` (5 files, not run) | 22 | real browser, real Next app | none; only the HTTP API is stubbed with `page.route` | **Closest to "real tests"** in the repo. |
| `tests/e2e/*.spec.js` (4 files) | 0 | none | none | **Empty placeholders.** Delete or fill. |

Takeaways for [Which tests to delete](09-which-tests-to-delete.md):

- No test touches a real database. Every repository is mocked, even though `better-sqlite3` can run in memory.
- Every root test mocks the app's own modules. The common seam is "one service plus mocks of all its neighbors".
- Deletion candidates: the `authService` wiring and field tests, the `listenService` unit file, the two "does not throw" tests, and the empty Electron e2e files.
- Keep but move to public seams: the private-method tests in ask, stt and summary.

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
