# 08: Dashboard on Vitest, with page tests against the real network calls

**What to build:** the dashboard's tests run on Vitest, and the login, activity and settings page tests stub the network with MSW instead of mocking `@/utils/api` and `@/utils/auth`. They are written against today's code and guard tickets 09-11. Follows [the spec](../spec.md), "4b-1: dashboard" and Testing Decisions, seam 3.

**Blocked by:** 01

**Status:** claimed

**Label:** ready-for-agent

**Model:** Opus (run `/model opus` before `/implement`). New tests at a new seam, and the MSW handlers must match `backend_node`'s real responses.

- [ ] Vitest with jsdom, React Testing Library and `@testing-library/jest-dom`'s Vitest entry; `next/jest`, `jest.config.ts`, `jest.setup.ts`, Jest and `ts-node` are deleted
- [ ] MSW (`msw/node`) answers `/runtime-config.json`, every `/api/...` route the pages call and the WhisperAPP links with fixed data shaped like `backend_node`'s responses, and fails a test on any request it does not know (`onUnhandledRequest: 'error'`)
- [ ] The login, activity and settings page tests use MSW, pass against today's code, and do not mock `@/utils/api` or `@/utils/auth`
- [ ] `__tests__/utils/api.test.ts` and `__tests__/utils/auth.test.ts` are judged with the `tdd` skill: a check a page test now covers through the network is deleted, the rest move to MSW. What was deleted and why is recorded here
- [ ] The dashboard count is recorded against the step-3 count (49)
- [ ] `pnpm type-check` and `pnpm test` pass, and `pnpm lint` passes as it stands when the ticket runs (oxlint is set up outside this spec). The test counts are recorded in this ticket's comments
- [ ] No lint rule is silenced with a disable comment
- [ ] Work on its own branch, merged into `dev` through a pull request
