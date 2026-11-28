# 12: End-of-spec run of the Electron suite

**What to build:** the whole Electron suite (4 smoke, 6 screenshots, 4 fake-server tests) passes against the step-3 baseline in dev and on the packaged build, after the code-review fixes of every ticket. This closes the spec. Follows [the spec](../spec.md), Testing Decisions, seam 1.

**Blocked by:** 07, 11

**Status:** open

**Label:** ready-for-agent

**Model:** Sonnet (run `/model sonnet` before `/implement`). Running and recording the suite is mechanical. If a test fails for a reason that is not obvious, stop and switch to Opus for the fix.

- [ ] The 14 tests pass in dev and on the packaged build; a failing test is rerun alone once before it counts as failed
- [ ] Any zod parse failure seen in the run is treated as a bug in the schema, not in the UI, and fixed
- [ ] Any screenshot difference is fixed, or re-baselined once only if it is anti-aliasing, with the diff image and reason saved in `assets/`
- [ ] Final counts (type-check, lint, root and dashboard Vitest, Electron suite) recorded here and in the spec, and the spec set to `Status: resolved`
- [ ] `pnpm type-check` and `pnpm test` pass, and `pnpm lint` passes as it stands when the ticket runs (oxlint is set up outside this spec). The test counts are recorded in this ticket's comments
- [ ] No lint rule is silenced with a disable comment
- [ ] Work on its own branch, merged into `dev` through a pull request
