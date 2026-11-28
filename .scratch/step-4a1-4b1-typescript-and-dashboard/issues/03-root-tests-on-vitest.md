# 03: The root tests run on Vitest

**What to build:** the root unit and integration tests run on Vitest in TypeScript with the same checks as today, minus the tests already marked for deletion. They are the guard for the TypeScript tickets after this one. Follows [the spec](../spec.md), "4a-1: tests".

**Blocked by:** 02

**Status:** open

**Label:** ready-for-agent

**Model:** Sonnet (run `/model sonnet` before `/implement`). Mechanical: delete an exact list, then move tests one to one (`jest.fn` to `vi.fn`, `jest.mock` to `vi.mock`) with no new checks.

- [ ] Deleted first: `authService.test.js`, `listenService.test.js` and the two "does not throw" tests in `settingsService.test.js` ([Which tests to delete](../../whisper-cleanup/issues/09-which-tests-to-delete.md))
- [ ] Every other root unit and integration test, with its mocks and setup, is in TypeScript on Vitest, with the same checks. A test that cannot keep its check as it is gets a comment here saying why
- [ ] The count is root 130 minus the deleted tests, recorded here
- [ ] Root Jest, its configs and setup files, and the root Jest packages are deleted (`whisper_web` keeps Jest until ticket 08)
- [ ] `pnpm type-check` and `pnpm test` pass, and `pnpm lint` passes as it stands when the ticket runs (oxlint is set up outside this spec). The test counts are recorded in this ticket's comments
- [ ] No lint rule is silenced with a disable comment
- [ ] Work on its own branch, merged into `dev` through a pull request
