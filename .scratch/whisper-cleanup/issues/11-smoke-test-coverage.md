# What the smoke tests and screenshots cover

Status: claimed
Type: grilling
Blocked by: 04

## Question

Step 0 of [TypeScript migration approach](04-typescript-approach.md) is a Playwright safety net on today's Electron app. Which user flows get a smoke test, which windows and states get a screenshot (header states, Ask empty/streaming/answered, Listen, Settings, Plan, Screenshot, recovery toast, permission header), which parts go on the manual checklist instead (mic, system audio, macOS permissions, login, deep link), and how the LLM, STT relay and server are stubbed so the tests run offline and the screenshots are stable.

## Comments

From [Which tests to delete](09-which-tests-to-delete.md): Playwright is for the Electron app only, and kept small (a few smoke tests plus screenshots to catch visible change). `whisper_web` gets no Playwright. The 4 empty `tests/e2e/*.spec.js` files are replaced by this suite.
