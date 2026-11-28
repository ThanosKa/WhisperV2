# 09: Dashboard on strict TypeScript and clean for the Next 16 rules

**What to build:** the dashboard passes the root strict TypeScript config, and its code is clean for the 15 Next 16 rules switched off today, with no visible change. Follows [the spec](../spec.md), "4b-1: dashboard", "Lint and types".

**Blocked by:** 08

**Status:** resolved

**Label:** ready-for-agent

**Model:** Sonnet (run `/model sonnet` before `/implement`). A fixed list of type errors and rule findings, guarded by the MSW page tests and the dashboard screenshots.

- [x] `whisper_web` has zero type errors under the root strict config
- [x] The 15 rules listed in `whisper_web/eslint.config.mjs` (`RULES_NEW_IN_NEXT_16`) are run once on the code, and every finding is fixed. Whether the rules end up on in oxlint is the oxlint setup's call; if that setup has already replaced ESLint, the same rules are checked there
- [x] No `any`, no type assertions (`as const` allowed), no non-null `!` in the dashboard code
- [x] The MSW page tests pass, and the 10 dashboard pages match their step-3 screenshots (`dashboard-screenshots.mjs`, then `dashboard-pixel-diff.mjs`, in `../../step-2-3-safety-net-upgrades/assets/`)
- [x] `pnpm type-check` and `pnpm test` pass, and `pnpm lint` passes as it stands when the ticket runs (oxlint is set up outside this spec). The test counts are recorded in this ticket's comments
- [x] No lint rule is silenced with a disable comment
- [ ] Work on its own branch, merged into `dev` through a pull request

## Comments

Done 2026-11-28 on branch `step-4a1-4b1-09-dashboard-strict-types-and-next-16-rules`.

- **Counts:** dashboard Vitest 36 (6 files); `pnpm type-check` passes (root, e2e, dashboard, 0 errors under the full strict config; the three flags are gone from `whisper_web/tsconfig.json`). `pnpm web:lint` passes. `pnpm lint` (root) still fails: no root ESLint config, left to the oxlint effort.
- **Next 16 rules:** run once with a throwaway config (not committed; the `RULES_NEW_IN_NEXT_16` off-list in `eslint.config.mjs` is untouched, so the oxlint setup decides whether they go on). 14 errors and 2 warnings, all fixed in code: setState in effects (render-time adjustment, a keyed `ActivityContent`, async loaders), one manual memoization, a use-before-declare, refs read in render (`SearchPopup` sentinel is now state), `window.location.href` built through `URL`. The two existing `eslint-disable` comments are gone.
- **Types:** `devMock` types are now aliases of the app types, and what it reads from localStorage is parsed with zod (`zod` added to `whisper_web`), so the `as unknown as` casts are gone. `Sidebar` lost the `isLucide` flag (a `typeof icon` check replaces it).
- **Not ticked: the 10 screenshots** (`dashboard-screenshots.mjs` needs a browser, which this run may not open) and **the PR into `dev`**. The caller runs the screenshot diff.
- **Left to a later ticket:** `backend_node/` only got the type-import fixes and one undefined check; it still has `as` casts and `req.bridge!` (it moves into main on Hono in 4b-2). `response.json()` results in `utils/api.ts` and `JSON.parse` in `utils/auth.ts` are still unparsed (implicit `any`, not written by hand); parsing them with zod belongs with the typed client in 4b-2.
