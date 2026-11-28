# 01: Today's app opens inside an offline Electron test

**What to build:** today's app, unchanged, installs and launches on the owner's Mac, and one Playwright test opens it offline against a local fake server and sees the main header. This is the tracer bullet for the whole Electron suite. Follows [Spec: Steps 2 and 3](../spec.md), "Step 2: a runnable before install" and "Step 2: the Electron suite".

**Blocked by:** None (can start immediately)

**Status:** claimed

**Label:** ready-for-agent

**Model:** Opus (run `/model opus` before `/implement`). The app does not launch today, and the throwaway profile, seeded login and permission stub must be set up without changing app code: unknown failures that need judgment.

- [ ] The app is installed with Node 20 under nvm: the Electron binary is downloaded and `better-sqlite3` is built for Electron 30. The re-synced lockfile is not committed. The exact commands are written in this ticket's comments
- [ ] The app is built the way `npm start` builds it today (renderer bundle, `whisper_web` export and its API)
- [ ] A local fake server, started by the test on a free port, answers the requests the app makes at startup (session status, user by session, and whatever else it calls) with fixed data, and fails the test on any request it does not know
- [ ] The test sets `API_BASE_URL`, `STT_RELAY_URL`, `whisper_API_URL` and `whisper_WEB_URL` to the fake server, so the repo's `.env` cannot reach a real service
- [ ] Each test gets an empty temporary `userData` folder, and the `auth-session` store is seeded with a session the fake server accepts
- [ ] The macOS permission check answers "granted" for microphone and screen, set up by the test before the app's code runs. If this needs an app change, the smallest env-gated test hook is added and the reason recorded here
- [ ] Smoke 1 passes: the app opens and the main header shows, not the login or permission header
- [ ] The test is TypeScript, lives in today's e2e folder, and `test:e2e` runs it
- [ ] The four empty e2e files and their unused launch helper are deleted
- [ ] Root Jest and `whisper_web` Jest, lint and type-check give the step-1 counts
- [ ] Work on its own branch, merged into `dev` through a pull request
