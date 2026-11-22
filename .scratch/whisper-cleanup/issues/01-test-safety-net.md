# Test safety net today

Status: claimed
Type: task
Blocked by: none

## Question

Do the existing tests pass today, and what do they cover? Run `npm test` (Jest unit + integration), `npm run test:e2e` (Playwright), and the `whisper_web` tests. Record: pass/fail counts, failures and why, coverage per area (`src/features/*`, `src/bridge`, `src/window`, `whisper_web`), and which user-facing flows have no test at all. This decides how much safety net a behavior-preserving TypeScript migration has.
