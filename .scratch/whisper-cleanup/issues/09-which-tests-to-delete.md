# Which tests to delete

Status: resolved
Type: grilling
Blocked by: 01

## Question

Which existing tests are low-value ("slop": they mostly assert on mocks, duplicate each other, or test implementation details) and get deleted, and which stay? Because tests are the safety net for a behavior-preserving migration, decide also what must exist before deleting: which user-facing flows need a real test (Playwright e2e or an in-memory integration test) first, and whether deletion happens before or after the TypeScript move.

## Answer

Resolved 2026-11-23 with the owner. Rule: the `tdd` skill (test behavior at public seams; mock only system boundaries). The per-file judgment already made in [Test safety net today](01-test-safety-net.md) is the starting audit; a full audit of each kept test against `tdd` happens while doing the work.

**Three seams, and only these get tests:**

1. **Desktop app (Electron) through Playwright:** a few smoke tests plus screenshots, only to catch visible change during the upgrade and the React rewrite. Playwright is used **only for Electron**. Scope in [What the smoke tests and screenshots cover](11-smoke-test-coverage.md).
2. **Each service through its public methods** (ask, listen, settings, stt, summary, auth, crash recovery): real in-memory `better-sqlite3`; mocks only for LLM, network and OS.
3. **`whisper_web` pages through Testing Library**, network stubbed. **No Playwright in `whisper_web`**: owner's call, overengineering for a local dashboard.

**Deleted:** `tests/unit/services/authService.test.js`, `tests/unit/services/listenService.test.js`, the two "does not throw" tests in `settingsService.test.js`, the 4 empty `tests/e2e/*.spec.js` files (replaced by the step-0 Electron suite), and `whisper_web/e2e/` with its Playwright config and dependency.

**Rewritten at seam 2, not deleted:** the private-method tests in ask, stt and summary; the 6 crash-recovery files (one shared setup, overlaps merged, real in-memory DB).

**When:** the empty Electron e2e files and `whisper_web/e2e/` go in step 0, when the Electron Playwright suite is set up. The root unit tests stay on Jest until step 2 (main/preload to TS): there each kept test is rewritten to Vitest at its seam and the rest deleted. No new test is needed before deleting, because the deleted tests protect nothing the kept ones and the step-0 suite do not.

## Comments

**Amended by [whisper_web cleanup scope](18-whisper-web-cleanup.md):** seam 3 stubs the network with MSW instead of mocking `@/utils/api`; the dashboard API routes are tested at seam 2 through Hono's `app.request()` on a real in-memory DB.
