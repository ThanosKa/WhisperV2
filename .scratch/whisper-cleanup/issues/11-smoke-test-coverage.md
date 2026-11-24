# What the smoke tests and screenshots cover

Status: resolved
Type: grilling
Blocked by: 04

## Question

Step 0 of [TypeScript migration approach](04-typescript-approach.md) is a Playwright safety net on today's Electron app. Which user flows get a smoke test, which windows and states get a screenshot (header states, Ask empty/streaming/answered, Listen, Settings, Plan, Screenshot, recovery toast, permission header), which parts go on the manual checklist instead (mic, system audio, macOS permissions, login, deep link), and how the LLM, STT relay and server are stubbed so the tests run offline and the screenshots are stable.

## Comments

From [Which tests to delete](09-which-tests-to-delete.md): Playwright is for the Electron app only, and kept small (a few smoke tests plus screenshots to catch visible change). `whisper_web` gets no Playwright. The 4 empty `tests/e2e/*.spec.js` files are replaced by this suite.

## Answer

Resolved 2026-11-23 with the owner. Kept deliberately small. The owner checks nothing by hand and deploys nothing until the whole cleanup is done, so this suite is what catches a break at each step; the agent runs it after every step.

- **4 smoke tests (Playwright `_electron.launch`):** the app opens and the header shows; Ask answers a typed question (streamed); Listen starts, shows a transcript, stops, and the session is saved; a settings change survives a restart.
- **6 screenshots, one per window in its normal state:** header, Ask, Listen, Settings, Plan, Screenshot. Taken on macOS only, fixed window size, animations off.
- **Manual checklist, once, at the very end before deploy (owner):** mic, system audio, macOS permissions, real login through the browser and deep link, auto-update, installers on mac, Windows and Linux.
- **Offline stubs (default by the stable-standard rule):** one local fake server started by the test stands in for WhisperAPP (auth, LLM) and the STT side, wired through the existing env overrides `whisper_API_URL` and `STT_RELAY_URL` (`src/features/common/config/config.js`). A logged-in state is seeded before launch. When the desktop moves to Soniox ([Direct-to-Soniox design](14-direct-to-soniox-design.md)), the fake STT side follows the Soniox protocol.

## Comments

From [DESIGN.md scope](17-design-md-scope.md): the Electron UI's 114 colors are merged into a small palette in step 5, so the step-6 screenshot comparison uses a small pixel tolerance, not an exact match.
