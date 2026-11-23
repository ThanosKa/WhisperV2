# What the smoke tests and screenshots cover

Status: open
Type: grilling
Blocked by: 04

## Question

Step 0 of [TypeScript migration approach](04-typescript-approach.md) is a Playwright safety net on today's Electron app. Which user flows get a smoke test, which windows and states get a screenshot (header states, Ask empty/streaming/answered, Listen, Settings, Plan, Screenshot, recovery toast, permission header), which parts go on the manual checklist instead (mic, system audio, macOS permissions, login, deep link), and how the LLM, STT relay and server are stubbed so the tests run offline and the screenshots are stable.
