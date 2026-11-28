# 01: Today's app opens inside an offline Electron test

**What to build:** today's app, unchanged, installs and launches on the owner's Mac, and one Playwright test opens it offline against a local fake server and sees the main header. This is the tracer bullet for the whole Electron suite. Follows [Spec: Steps 2 and 3](../spec.md), "Step 2: a runnable before install" and "Step 2: the Electron suite".

**Blocked by:** None (can start immediately)

**Status:** claimed

**Label:** ready-for-agent

**Model:** Opus (run `/model opus` before `/implement`). The app does not launch today, and the throwaway profile, seeded login and permission stub must be set up without changing app code: unknown failures that need judgment.

- [x] The app is installed with Node 20 under nvm: the Electron binary is downloaded and `better-sqlite3` is built for Electron 30. The re-synced lockfile is not committed. The exact commands are written in this ticket's comments
- [x] The app is built the way `npm start` builds it today (renderer bundle, `whisper_web` export and its API)
- [x] A local fake server, started by the test on a free port, answers the requests the app makes at startup (session status, user by session, and whatever else it calls) with fixed data, and fails the test on any request it does not know
- [x] The test sets `API_BASE_URL`, `STT_RELAY_URL`, `whisper_API_URL` and `whisper_WEB_URL` to the fake server, so the repo's `.env` cannot reach a real service
- [x] Each test gets an empty temporary `userData` folder, and the `auth-session` store is seeded with a session the fake server accepts
- [x] The macOS permission check answers "granted" for microphone and screen, set up by the test before the app's code runs. If this needs an app change, the smallest env-gated test hook is added and the reason recorded here
- [x] Smoke 1 passes: the app opens and the main header shows, not the login or permission header
- [x] The test is TypeScript, lives in today's e2e folder, and `test:e2e` runs it
- [x] The four empty e2e files and their unused launch helper are deleted
- [x] Root Jest and `whisper_web` Jest, lint and type-check give the step-1 counts
- [ ] Work on its own branch, merged into `dev` through a pull request

## Comments

### 2026-11-28, implementation (branch `step-2-3-01-app-opens-in-a-test`)

**Install (Node 20.19.4 under nvm, npm 11.6.2).** `nvm use 20` is not enough on this Mac. The shell profile puts `/opt/homebrew/bin` (Node 26) ahead of nvm's folder, so the first try built `better-sqlite3` against Node 26 and failed. To fix this, put Node 20 first on `PATH`:

```sh
export PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH"   # node -v -> v20.19.4
npm install                    # root: 873 packages; postinstall `electron-builder install-app-deps`
                               # runs @electron/rebuild with electronVersion=30.5.1 arch=arm64
(cd whisper_web && npm install)
git restore package-lock.json whisper_web/package-lock.json   # the re-synced lockfiles are not committed
```

Result: `node_modules/electron` 30.5.1 with `dist/Electron.app`, `better-sqlite3` 9.6.0 built for Electron (`build/Release/better_sqlite3.node`), and `@playwright/test` 1.56.1. npm 11 ignores the `.npmrc` lines `better-sqlite3:ignore-scripts=true` and `sharp:ignore-scripts=true`, so the install scripts still run. This does no harm on Node 20.

**Build.** `npm run build:all` builds the renderer bundle (`node build.js`, into `public/build/`). It then builds `whisper_web`: `tsc -p backend_node/tsconfig.json`, then `next build`, which exports to `whisper_web/out/`. `npm start` runs only `build:renderer`. The `whisper_web` export and its API come from `build:web`, which `setup` runs. Git ignores all of these outputs. The suite does not build anything: build first, then run `npm run test:e2e`.

**Suite.** It lives in `tests/e2e/`, is written in TypeScript, uses the existing `playwright.config.js` and runs with `npm run test:e2e`.
- `smoke.spec.ts`: Smoke 1. `main-header` is visible, and `auth-header` and `permission-setup` are absent.
- `fixtures.ts`: the Playwright fixtures `fakeServer`, `userDataDir`, `electronApp` and `headerWindow`. The app launches with `_electron.launch({ args: ['-r', 'tests/e2e/support/main-preload.js', <repo root>], env })`. The fixture finds the header window by its URL (`…/header.html`). In dev mode the app also opens detached DevTools windows, and Playwright lists those as pages too.
- `fakeServer.ts`: one `node:http` server on `127.0.0.1:0`. At startup the app makes only two requests: `GET /api/auth/session/:uuid`, answered with `{ success, data: { status: 'authenticated' } }`, and `GET /api/auth/user-by-session/:uuid`, answered with `{ success, data: FAKE_USER }`. The main process calls both in `authService.validateSession`, and `MainHeader` calls user-by-session again from the renderer. Every other request gets a 404 and is recorded, WebSocket upgrades included. The fixture's teardown then fails the test and lists them. Checked once by turning off the user-by-session route: the test failed and listed `GET /api/auth/user-by-session/e2e-session-0001`.
- `support/main-preload.js`: plain JS, because Electron loads it before anything compiles TypeScript. It calls `app.setPath('userData', $WHISPER_E2E_USER_DATA)`, and it makes `systemPreferences.getMediaAccessStatus` answer `granted` for `microphone` and `screen`. Electron's default app supports `-r/--require` and loads the file before the app's `src/index.js`.

**Env.** The fixture sets `API_BASE_URL`, `whisper_API_URL` and `whisper_WEB_URL` to `http://127.0.0.1:<port>`, and `STT_RELAY_URL` to `ws://127.0.0.1:<port>`. `dotenv` never overrides a variable that is already set, and the worktree has no `.env`. Main replaces `whisper_API_URL` and `whisper_WEB_URL` with its own local ports in `startWebStack`, so only `API_BASE_URL` and `STT_RELAY_URL` actually reach the fake server. `NODE_ENV` is left unset. `electron-updater` skips its check because the app is not packaged, so it sends no request. A packaged run in step 3 must deal with the updater.

**Profile and login.** Each test gets its own `mkdtemp(os.tmpdir()/whisper-e2e-*)` folder, deleted after the test. Before launch the fixture writes `auth-session.json` with `{ sessionUuid: 'e2e-session-0001', userProfile: FAKE_USER }`. This is the plain JSON that `electron-store` 8 writes when no encryption key is set. `whisper.db` and the single-instance lock are created in the same folder. Checked: the listing of `~/Library/Application Support/Whisper` is the same before and after a run.

**Permission stub: no app change needed.** Without the stub the test also passed on this Mac, because the dev Electron binary inherits the terminal's permissions. To prove the stub reaches the app, it was set to answer `denied` once. The test then failed, and the header showed the Permissions screen. The stub was then set back to `granted`.

**Red → green.** Red: a bare launch (throwaway profile, URLs pointed at a dead port) showed "Open browser to login". Green: with the fake server, the seeded session and the stub, 1 test passed. Each launch takes about 2 to 7 seconds.

**Deleted:** `tests/e2e/{authentication,listenFlow,settings,shortcuts}.spec.js` and `tests/setup/electronHelper.js`. Nothing referenced the helper or the `WHISPER_TEST_MODE` flag it set.

**Checks (Node 20):**

| Check | Result |
|---|---|
| `npm run test:e2e` | 1 passed |
| Root Jest (`npm test`) | 13 suites, 124 tests passed |
| `whisper_web` Jest | 5 suites, 49 tests passed |
| Root lint | exit 127 (`eslint` is not installed, same as step 1) |
| `whisper_web` lint | exit 0, no warnings or errors |
| `whisper_web` type-check | exit 0 |

A test run rewrites the committed `playwright-report/index.html` and writes to `test-results/`. These changes were restored and not committed. Ticket 03 deletes these folders and adds them to `.gitignore`.
