# 03: Dashboard "before" screenshots and the old Playwright tests deleted

**What to build:** the 10 dashboard pages have "before" screenshots on fake data, taken by a script, ready to compare after the upgrade; `whisper_web`'s old Playwright tests and the committed Playwright output are gone. Follows [Spec: Steps 2 and 3](../spec.md), "Step 2: dashboard before screenshots" and "Step 2: deletions".

**Blocked by:** None (can start immediately)

**Status:** resolved

**Label:** ready-for-agent

**Model:** Sonnet (run `/model sonnet` before `/implement`). A short script and an exact delete list.

- [x] A script in this spec's `assets/` folder starts the dashboard in dev mode with `NEXT_PUBLIC_DEV_MOCK=1` and takes a full-page screenshot of each of the 10 pages (home, login, activity, activity details, personalize, settings, billing, privacy, help, download) with Playwright's headless Chromium at a fixed viewport
- [x] The 10 images are saved in `assets/` next to the script, and the command to rerun it is written in the script's header
- [x] No browser session of the owner's is used (no Claude in Chrome)
- [x] `whisper_web/e2e/`, its Playwright config, its `@playwright/test` dependency and its `test:e2e*` scripts are deleted
- [x] The committed `test-results/` and `playwright-report/` folders, root and `whisper_web`, are deleted and added to `.gitignore`
- [x] `whisper_web` Jest, lint and type-check give the step-1 counts
- [x] Work on its own branch, merged into `dev` through a pull request (PR #6; review fixes in the closing PR)


## Comments

- Script: `.scratch/step-2-3-safety-net-upgrades/assets/dashboard-screenshots.mjs`. Rerun from the repo root: `node .scratch/step-2-3-safety-net-upgrades/assets/dashboard-screenshots.mjs [before|after]` (the label becomes the file prefix: `dashboard-<label>-NN-<page>.png`). It needs `playwright` resolvable from the repo root and the `whisper_web` dependencies installed.
- It starts `next dev` on a free port, 1440x900, light scheme, reduced motion, animation and transition CSS off, clock frozen to 2026-01-15T12:00Z, UTC timezone, waits for network idle plus 1.5 s, and stops only the dev server it started. It launches with `channel: 'chromium'` (the full Chromium in new headless mode), so only one browser download is needed. No owner browser used.
- Activity details uses `?sessionId=sess-0` (the first fake session).
- Determinism: two runs gave byte-identical images for 7 of 10 pages; home, activity and download differ by a few bytes (rendering noise, not layout). Ticket 06 should compare with a small pixel tolerance, not byte equality. Home and personalize images have the same size (home probably shows the same view; not checked further).
- Pages are one viewport tall because the dashboard shell has a fixed-height layout, so full-page equals 1440x900 for most.
- Deleted: `whisper_web/e2e/`, `whisper_web/playwright.config.ts`, `@playwright/test` and the `test:e2e*` scripts in `whisper_web/package.json`, and in `whisper_web/package-lock.json` only the `@playwright/test`, `playwright`, `playwright-core` and nested `fsevents` entries (no other lockfile churn). Also removed the `<rootDir>/e2e/` ignore line from `whisper_web/jest.config.ts`, since the folder is gone. Deleted the committed `test-results/` and `playwright-report/` (root and `whisper_web`); `.gitignore` now ignores both.
- Checks (whisper_web, after `git merge dev`, already up to date): Jest 5 suites and 49 tests passed; lint clean; type-check exit 0. Same as the step-1 baseline.
- Worktree notes: I symlinked `node_modules` and `whisper_web/node_modules` from the main checkout (untracked, not committed). `npx playwright install chromium` stalled while extracting, so I unzipped the downloaded Chromium 1194 into `~/Library/Caches/ms-playwright/chromium-1194` by hand. While killing the stalled install I ran `pkill -f "playwright install chromium"`, which could have hit a similar install from another session.
