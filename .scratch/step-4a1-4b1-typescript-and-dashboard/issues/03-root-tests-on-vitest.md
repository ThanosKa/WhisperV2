# 03: The root tests run on Vitest

**What to build:** the root unit and integration tests run on Vitest in TypeScript with the same checks as today, minus the tests already marked for deletion. They are the guard for the TypeScript tickets after this one. Follows [the spec](../spec.md), "4a-1: tests".

**Blocked by:** 02

**Status:** resolved

**Label:** ready-for-agent

**Model:** Sonnet (run `/model sonnet` before `/implement`). Mechanical: delete an exact list, then move tests one to one (`jest.fn` to `vi.fn`, `jest.mock` to `vi.mock`) with no new checks.

- [x] Deleted first: `authService.test.js`, `listenService.test.js` and the two "does not throw" tests in `settingsService.test.js` ([Which tests to delete](../../whisper-cleanup/issues/09-which-tests-to-delete.md))
- [x] Every other root unit and integration test, with its mocks and setup, is in TypeScript on Vitest, with the same checks. A test that cannot keep its check as it is gets a comment here saying why
- [x] The count is root 130 minus the deleted tests, recorded here
- [x] Root Jest, its configs and setup files, and the root Jest packages are deleted (`whisper_web` keeps Jest until ticket 08)
- [x] `pnpm type-check` and `pnpm test` pass; `pnpm lint` fails as before (no root ESLint config, oxlint is a separate effort), reported not fixed. The test counts are recorded in this ticket's comments
- [x] No lint rule is silenced with a disable comment
- [ ] Work on its own branch, merged into `dev` through a pull request (branch `step-4a1-4b1-03-root-tests-on-vitest`; the pull request is for the owner to open)

## Comments

Done 2026-11-28 on branch `step-4a1-4b1-03-root-tests-on-vitest`.

- **Counts:** root Jest 130 before. Deleted `authService.test.js` (5), `listenService.test.js` (6) and the two "does not throw" tests in `settingsService` (2), so root is now **117 on Vitest** (`main` project, 13 files). The placeholder `vitest-environment.test.ts` (1) is deleted. `pnpm test` runs 178 (main 117, dashboard 61; the dashboard count in ticket 08's comment was 36, so it has changed since, not here).
- **Why deleted:** per "Which tests to delete": the auth and listen tests mostly assert on mocks; the two lifecycle tests only check "does not throw".
- **Moved one to one:** every other test keeps its checks, mocks and setup. Mocks are `vi.mock` with `{ default: ... }` factories (the source is ESM now), `vi.hoisted` for mocks a factory shares with the test, and `vi.resetModules()` plus `await import()` where Jest used `require` after `resetModules`.
- **Shared setup:** `tests/setup/vitest.setup.ts` (Electron and `electron-store` stand-ins from `tests/setup/electronMocks.ts`, console silenced). The stand-ins and `tests/mocks/llmClient.mock.ts` keep their one copy on `globalThis`, because `vi.resetModules()` would otherwise give the code and the test two different copies.
- **Small differences from Jest, no check lost:** (1) `mockReset: true` in Vitest restores a mock's original implementation, Jest's `resetMocks` wiped it; every test passes either way. (2) In `askService.test.ts` the `util.promisify` and `fs.promises` spies and `mockExecFile` are dropped: they were set after the module loaded and the tests only run the non-darwin path, so they never did anything. (3) `result.x` after `expect(result).not.toBeNull()` became `result?.x`, and `expect(r.shouldIncludeRole).toBe(true)` became `toHaveProperty('shouldIncludeRole', true)`, to satisfy the strict types without casts.
- **Types:** root `tsconfig.json` has `allowJs` and `checkJs: false` so the TypeScript tests can import the JavaScript source (inferred, not checked); it also includes `tests/setup` and `tests/mocks`. The main/preload TypeScript ticket can drop `allowJs` once the source is `.ts`.
- **Removed:** `jest.config.js`, `tests/setup/jest.setup.js`, packages `jest`, `jest-environment-node`, `@jest/globals`, `@types/jest` and ticket 02's three Babel dev deps; scripts `test:jest` and `test:coverage` (coverage needs `@vitest/coverage-v8`, not added). `test:watch`, `test:unit`, `test:integration` now call Vitest.
- **Checks run:** `pnpm type-check`, `pnpm test`, `pnpm web:lint` and `pnpm run build:all` pass. `pnpm lint` fails as before (no root ESLint config). No lint rule was silenced.
- **Left for later:** the six crash-recovery files still repeat one setup block, and the private-method tests in ask, stt and summary are not yet at public seams. "Which tests to delete" wants those rewritten against a real in-memory DB; this ticket was the one-to-one move.
