# 01: Shared TypeScript config, Vitest and CI

**What to build:** one strict TypeScript base config, one `pnpm test` that runs Vitest for the app and the dashboard, and CI that checks every pull request to `dev`. No test moves yet: Jest keeps running the old tests until their own tickets move them. Follows [the spec](../spec.md), "Shared tooling". Lint is not in this ticket: oxlint is set up by its own agent.

**Blocked by:** None (can start immediately)

**Status:** open

**Label:** ready-for-agent

**Model:** Opus (run `/model opus` before `/implement`). Sets the config every later ticket extends, and must keep Jest and Vitest running side by side without breaking the step-3 counts.

- [ ] A strict base TypeScript config at the `WhisperV2` root (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`), on TypeScript 6
- [ ] `whisper_web` and the e2e tests extend it; any new type error this shows is listed in this ticket's comments and left to the ticket that owns those files (dashboard: 09, e2e: 02)
- [ ] One `pnpm type-check` at the root runs every TypeScript project
- [ ] Vitest at the root with two projects: main (Node) and `whisper_web` (jsdom). `pnpm test` runs Vitest and, until tickets 03 and 08 finish, the old Jest suites too
- [ ] `ci.yml` runs install, type-check and `pnpm test` on every pull request to `dev`. The lint step is left for the oxlint setup to add
- [ ] Root Jest 130 and `whisper_web` Jest 49 still pass
- [ ] `pnpm type-check` and `pnpm test` pass, and `pnpm lint` passes as it stands when the ticket runs (oxlint is set up outside this spec). The test counts are recorded in this ticket's comments
- [ ] No lint rule is silenced with a disable comment
- [ ] Work on its own branch, merged into `dev` through a pull request
