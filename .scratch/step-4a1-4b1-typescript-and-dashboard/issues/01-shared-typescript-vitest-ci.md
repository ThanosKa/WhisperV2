# 01: Shared TypeScript config, Vitest and CI

**What to build:** one strict TypeScript base config, one `pnpm test` that runs Vitest for the app and the dashboard, and CI that checks every pull request to `dev`. No test moves yet: Jest keeps running the old tests until their own tickets move them. Follows [the spec](../spec.md), "Shared tooling". Lint is not in this ticket: oxlint is set up by its own agent.

**Blocked by:** None (can start immediately)

**Status:** resolved

**Label:** ready-for-agent

**Model:** Opus (run `/model opus` before `/implement`). Sets the config every later ticket extends, and must keep Jest and Vitest running side by side without breaking the step-3 counts.

- [x] A strict base TypeScript config at the `WhisperV2` root (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`), on TypeScript 6
- [x] `whisper_web` and the e2e tests extend it; any new type error this shows is listed in this ticket's comments and left to the ticket that owns those files (dashboard: 09, e2e: 02)
- [x] One `pnpm type-check` at the root runs every TypeScript project
- [x] Vitest at the root with two projects: main (Node) and `whisper_web` (jsdom). `pnpm test` runs Vitest and, until tickets 03 and 08 finish, the old Jest suites too
- [x] `ci.yml` runs install, type-check and `pnpm test` on every pull request to `dev`. The lint step is left for the oxlint setup to add
- [x] Root Jest 130 and `whisper_web` Jest 49 still pass
- [ ] `pnpm type-check` and `pnpm test` pass, and `pnpm lint` passes as it stands when the ticket runs (oxlint is set up outside this spec). The test counts are recorded in this ticket's comments
- [x] No lint rule is silenced with a disable comment
- [ ] Work on its own branch, merged into `dev` through a pull request

## Comments

Done 2026-11-28 on branch `step-4a1-4b1-01-shared-typescript-vitest-ci`.

- **Counts:** root Jest 130, `whisper_web` Jest 49, Vitest 3 (`main` 1, `whisper_web` 2). `pnpm type-check` and `pnpm test` pass.
- **`pnpm lint` fails, before and after this ticket:** the root script is `eslint --ext ...` with no root `eslint.config.*`, and ESLint 10 needs one. This is the state the spec describes ("`pnpm lint` fails"); it is left to the oxlint setup, so that criterion is not ticked. `pnpm web:lint` passes, and CI keeps running it until the oxlint step replaces it.
- **Not ticked: the PR into `dev`.** The branch is committed locally; the PR and merge are the caller's.
- **Config:** `tsconfig.base.json` (root) holds the strict flags. `tsconfig.json` (root) type-checks the Vitest configs and root TypeScript tests (`src/**/*.ts`, `tests/unit|integration/**/*.ts`); ticket 02 can reshape it for electron-vite. `tests/e2e/tsconfig.json` and `whisper_web/tsconfig.json` extend the base. `pnpm type-check` runs the three.
- **e2e:** zero errors under the full strict config, after adding `@types/ws`. Nothing left for ticket 02 here.
- **`whisper_web`, left to ticket 09:** 61 errors under the full config, so its `tsconfig.json` turns `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` and `verbatimModuleSyntax` off for now; ticket 09 deletes those three lines and fixes the errors. Split: 28 `verbatimModuleSyntax` (types imported without `import type`), the rest `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`. Files: `__tests__/activity-page.test.tsx`, `__tests__/test-utils.tsx`, `__tests__/utils/api.test.ts`, `app/activity/page.tsx`, `app/activity/details/page.tsx`, `app/personalize/page.tsx`, `app/settings/page.tsx`, `components/Sidebar.tsx`, `components/SearchPopup.tsx`, `components/activity/TranscriptSidebar.tsx`, `hooks/use-toast.ts`, `utils/api.ts`, `utils/auth.ts`, `utils/devMock.ts`, and 15 in `backend_node/` (`whisper_web/tsconfig.json` includes `backend_node/**/*.ts`; the spec does not clean `backend_node`, so ticket 09 must either fix those 15 or exclude `backend_node/` from the dashboard config, since it has its own).
- **Vitest layout:** `vitest.config.mts` (root) has the `main` project (Node, `src/**/*.test.ts`, `tests/unit|integration/**/*.test.ts`) and points at `whisper_web/vitest.config.mts` (jsdom, `@/` from tsconfig paths, `vitest.setup.ts` runs Testing Library `cleanup`). Until ticket 08, the `whisper_web` project excludes `__tests__/` and `whisper_web/jest.config.ts` only reads `__tests__/`, so no file runs on both. Root Jest only reads `*.test.js`, so `.test.ts` files are Vitest's.
- **Placeholder tests, for 03 and 08:** `tests/unit/vitest-environment.test.ts` (delete when the real root tests arrive) and `whisper_web/components/ui/button.test.tsx` (a real `Button` test; keep or move).
- **Scripts left for 03 and 08:** `pnpm test` = `vitest run && pnpm run test:jest`; `test:jest` runs root Jest, then `whisper_web` Jest. Ticket 03 drops `jest` from `test:jest` and the `test:watch`, `test:coverage`, `test:unit`, `test:integration` Jest scripts; ticket 08 drops the rest and `test:jest`.
