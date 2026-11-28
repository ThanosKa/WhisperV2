# 03: Dashboard "before" screenshots and the old Playwright tests deleted

**What to build:** the 10 dashboard pages have "before" screenshots on fake data, taken by a script, ready to compare after the upgrade; `whisper_web`'s old Playwright tests and the committed Playwright output are gone. Follows [Spec: Steps 2 and 3](../spec.md), "Step 2: dashboard before screenshots" and "Step 2: deletions".

**Blocked by:** None (can start immediately)

**Status:** claimed

**Label:** ready-for-agent

**Model:** Sonnet (run `/model sonnet` before `/implement`). A short script and an exact delete list.

- [ ] A script in this spec's `assets/` folder starts the dashboard in dev mode with `NEXT_PUBLIC_DEV_MOCK=1` and takes a full-page screenshot of each of the 10 pages (home, login, activity, activity details, personalize, settings, billing, privacy, help, download) with Playwright's headless Chromium at a fixed viewport
- [ ] The 10 images are saved in `assets/` next to the script, and the command to rerun it is written in the script's header
- [ ] No browser session of the owner's is used (no Claude in Chrome)
- [ ] `whisper_web/e2e/`, its Playwright config, its `@playwright/test` dependency and its `test:e2e*` scripts are deleted
- [ ] The committed `test-results/` and `playwright-report/` folders, root and `whisper_web`, are deleted and added to `.gitignore`
- [ ] `whisper_web` Jest, lint and type-check give the step-1 counts
- [ ] Work on its own branch, merged into `dev` through a pull request
