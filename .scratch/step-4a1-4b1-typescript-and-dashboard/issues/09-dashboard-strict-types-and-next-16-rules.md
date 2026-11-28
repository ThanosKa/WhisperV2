# 09: Dashboard on strict TypeScript and clean for the Next 16 rules

**What to build:** the dashboard passes the root strict TypeScript config, and its code is clean for the 15 Next 16 rules switched off today, with no visible change. Follows [the spec](../spec.md), "4b-1: dashboard", "Lint and types".

**Blocked by:** 08

**Status:** claimed

**Label:** ready-for-agent

**Model:** Sonnet (run `/model sonnet` before `/implement`). A fixed list of type errors and rule findings, guarded by the MSW page tests and the dashboard screenshots.

- [ ] `whisper_web` has zero type errors under the root strict config
- [ ] The 15 rules listed in `whisper_web/eslint.config.mjs` (`RULES_NEW_IN_NEXT_16`) are run once on the code, and every finding is fixed. Whether the rules end up on in oxlint is the oxlint setup's call; if that setup has already replaced ESLint, the same rules are checked there
- [ ] No `any`, no type assertions (`as const` allowed), no non-null `!` in the dashboard code
- [ ] The MSW page tests pass, and the 10 dashboard pages match their step-3 screenshots (`dashboard-screenshots.mjs`, then `dashboard-pixel-diff.mjs`, in `../../step-2-3-safety-net-upgrades/assets/`)
- [ ] `pnpm type-check` and `pnpm test` pass, and `pnpm lint` passes as it stands when the ticket runs (oxlint is set up outside this spec). The test counts are recorded in this ticket's comments
- [ ] No lint rule is silenced with a disable comment
- [ ] Work on its own branch, merged into `dev` through a pull request
