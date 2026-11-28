# Step 2 baseline

The state step 3 is judged against. Taken on branch `step-2-3-02-smoke-tests-and-screenshots` at b1f9499 (ticket 02), on the owner's Mac: macOS 15.6.1, Node 20.19.4 under nvm, Electron 30.5.1, `@playwright/test` 1.56.1. Install and build as in ticket 01's comments (`npm install` at the root and in `whisper_web`, lockfiles restored, then `npm run build:all`).

| Check | Command | Result |
|---|---|---|
| Electron suite | `npm run test:e2e` | exit 0. 10 passed (4 smoke tests, 6 screenshots), about 38 s. Passed 3 runs in a row with no change |
| Root Jest | `npm test` | exit 0. 13 suites passed, 124 tests passed |
| `whisper_web` Jest | `npm test --prefix whisper_web` | exit 0. 5 suites passed, 49 tests passed |
| Root lint | `npm run lint` | exit 127: `eslint` is not installed in the root `node_modules` (same as step 1) |
| `whisper_web` lint | `npm run lint --prefix whisper_web` | exit 0. No ESLint warnings or errors |
| `whisper_web` type-check | `npm run type-check --prefix whisper_web` | exit 0. No errors |

## The Electron suite

`tests/e2e/smoke.spec.ts`:

1. The app opens on the main header.
2. Ask streams the answer to a typed question.
3. Listen shows the transcript and saves the session.
4. The analysis preset chosen in Listen is still chosen after a restart.

`tests/e2e/screenshots.spec.ts`, one screenshot per window, exact match. The baselines are the PNG files in `tests/e2e/screenshots.spec.ts-snapshots/`, where Playwright reads them:

| Window | File | Size (px) |
|---|---|---|
| Header | `header-darwin.png` | 600 x 50 |
| Ask | `ask-darwin.png` | 750 x 298 |
| Listen | `listen-darwin.png` | 400 x 250 |
| Settings | `settings-darwin.png` | 240 x 400 |
| Plan | `plan-darwin.png` | 280 x 160 |
| Screenshot | `screenshot-darwin.png` | 400 x 300 |

The sizes are at scale 1: the launch passes `--force-device-scale-factor=1`. A new baseline is written with `npx playwright test screenshots --update-snapshots`; look at every image before committing it.
