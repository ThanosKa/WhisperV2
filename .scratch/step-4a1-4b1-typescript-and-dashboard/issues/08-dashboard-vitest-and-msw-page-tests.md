# 08: Dashboard on Vitest, with page tests against the real network calls

**What to build:** the dashboard's tests run on Vitest, and the login, activity and settings page tests stub the network with MSW instead of mocking `@/utils/api` and `@/utils/auth`. They are written against today's code and guard tickets 09-11. Follows [the spec](../spec.md), "4b-1: dashboard" and Testing Decisions, seam 3.

**Blocked by:** 01

**Status:** resolved

**Label:** ready-for-agent

**Model:** Opus (run `/model opus` before `/implement`). New tests at a new seam, and the MSW handlers must match `backend_node`'s real responses.

- [x] Vitest with jsdom, React Testing Library and `@testing-library/jest-dom`'s Vitest entry; `next/jest`, `jest.config.ts`, `jest.setup.ts`, Jest and `ts-node` are deleted
- [x] MSW (`msw/node`) answers `/runtime-config.json`, every `/api/...` route the pages call and the WhisperAPP links with fixed data shaped like `backend_node`'s responses, and fails a test on any request it does not know (`onUnhandledRequest: 'error'`)
- [x] The login, activity and settings page tests use MSW, pass against today's code, and do not mock `@/utils/api` or `@/utils/auth`
- [x] `__tests__/utils/api.test.ts` and `__tests__/utils/auth.test.ts` are judged with the `tdd` skill: a check a page test now covers through the network is deleted, the rest move to MSW. What was deleted and why is recorded here
- [x] The dashboard count is recorded against the step-3 count (49)
- [x] `pnpm type-check` and `pnpm test` pass, and `pnpm lint` passes as it stands when the ticket runs (oxlint is set up outside this spec). The test counts are recorded in this ticket's comments
- [x] No lint rule is silenced with a disable comment
- [ ] Work on its own branch, merged into `dev` through a pull request

## Comments

**Done 2026-11-28** on branch `step-4a1-4b1-08-dashboard-vitest-and-msw-page-tests`, not yet merged into `dev` (the last box stays open for the PR).

**Counts.** Dashboard 36 on Vitest: `__tests__/` 34 (login 5, activity 13, settings 10, `utils/api` 5, `utils/auth` 1) plus `components/ui/button.test.tsx` 2. Step 3 had 49 in `__tests__/` on Jest; 15 were deleted or merged (listed below). `pnpm test`: Vitest 37 (dashboard 36, `main` placeholder 1), root Jest 130. `pnpm type-check` passes. `pnpm web:lint` passes. `pnpm lint` fails as before (no root ESLint config; oxlint is separate).

**How it works.** `__tests__/support/desktop.ts` is a fake of what the dashboard talks to: `/runtime-config.json` on `http://localhost:3000` (jsdom's origin), and `backend_node`'s routes on `API_URL` `http://localhost:9001`, answered from an in-memory `desktop` (mode, user, sessions, question count) with `backend_node`'s shapes: paging with `nextOffset`, 404 `User not found` with no desktop user, `{ changes }` on rename, `{ message }` on delete. Types come from `backend_node/types/session.ts`. `vitest.setup.ts` starts the server before the test file loads (`utils/api` fetches the runtime config on import), calls `__resetApiTestState` before each test, and resets the desktop, handlers and `localStorage` after it. `__tests__/support/intersection-observer.ts` is a fake observer that a test drives with `scrollIntoView(element)`. `next/navigation` is still mocked with `vi.mock` (a router spy): it cannot run outside Next.

**Unhandled requests.** MSW 3 renamed `onUnhandledRequest` to `onUnhandledFrame`; the setup uses `onUnhandledFrame: 'error'`. Because the pages catch fetch errors, that alone does not fail a test, so the setup also records `request:unhandled` and fails the test in `afterEach`, naming each request. Checked by renaming the profile route: three login tests failed with `The page sent requests that no MSW handler knows: GET http://localhost:9001/api/user/profile`.

**WhisperAPP links.** None of the three pages fetches WhisperAPP: they only link to it (the pricing `<a>` in settings, `window.location.href` for sign-in on login). So MSW has no WhisperAPP handler, and a fetch to it would fail the test. The settings test checks the pricing `href`.

**Page tests: what changed from the Jest versions.**
- Login (7 to 5): "renders welcome message" merged into the browser-mode test; "detects Electron mode" merged into the sync test, which now also checks the stored user and the move to `/settings`.
- Settings (12 to 10): "shows local mode badge" and "sign-in method for local mode" deleted: `useAuth` never sets mode `local`, so no network answer reaches that state (ticket 09 may delete the dead branch). "renders profile card", "displays all profile details", "webapp badge" and "sign-in method for webapp" merged into one profile test. Added: browser mode with and without a stored user, the `pro` plan.
- Activity (11 to 13): "handles pagination correctly" (it checked call arguments `(0, 10)`) merged into the scroll test, which now checks the second page appears and the list ends. Added: redirect to login with no desktop user, cancel a delete, rename a session, dev mock mode with no requests.

**`utils/api.test.ts` (11 to 5), judged with `tdd`.**
- Deleted, a page test covers it: dev mock `getMeetingsPage`, `getQuestionsPage` and `getUserProfile` (activity in dev mock mode shows Dev User, Team Sync #1 and Question #1 with zero requests); "calls API when dev mock disabled" for meetings and profile (every activity, login and settings test); "handles API errors" (login sync failure on the 404, settings and activity redirects).
- Kept, moved to MSW or the real `devMock`: dev mock paging (15 stored meetings to 10 + `nextOffset` 10), dev mock stats (now exact: 1800 s and 2 user messages, was `> 0`), dev mock delete (now checks the list, was "getSessionsMock was called"), `apiCall` refusing the network in dev mock, the `X-User-ID` header (read by the MSW handler).

**`utils/auth.test.ts` (8 to 1), judged with `tdd`.**
- Deleted, a page test covers it: dev mock short-circuit and `useRedirectIfNotAuth` returning the user (activity greeting and dev mock tests); Electron mode user (settings profile test); browser mode from `localStorage` (settings stored-user test); null user and redirect (settings and activity redirect tests); "handles retry limit" (`retryCount` never rises above 0 in today's code, so the test only repeated the null-user case).
- Kept: the `userInfoChanged` debounce, now counting real profile requests (exactly one recheck for a burst of three) instead of "at most two more calls".

**Deleted files and packages.** `whisper_web/jest.config.ts`, `jest.setup.ts`, `__tests__/test-utils.tsx` (unused); `jest`, `jest-environment-jsdom`, `ts-node`, `@types/jest` from the dashboard. Added `msw` 3.0.8. The dashboard `test` script is `vitest run`; the root `test:jest` is now only the root `jest` (ticket 03 deletes it).

**Left to later tickets.**
- Ticket 10: `test-types.d.ts` is now unused (it typed the old Jest setup's globals); it is on ticket 10's delete list. When `utils/` becomes `lib/`, update the imports in `vitest.setup.ts` and the tests.
- Ticket 09: the new test files have no errors with `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` and `verbatimModuleSyntax` turned on.
- 4b-2: `__resetApiTestState` in `utils/api.ts` is used by `vitest.setup.ts`; when `api.ts` loses its module-level origin, delete both.
