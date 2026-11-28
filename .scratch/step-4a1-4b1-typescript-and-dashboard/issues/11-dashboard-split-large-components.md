# 11: Dashboard's four large components split

**What to build:** `Sidebar.tsx`, the activity page, the activity details page and `SearchPopup.tsx` are split into smaller components in their feature folders, each doing one thing, with the same output. Follows [the spec](../spec.md), "4b-1: dashboard", "Splits".

**Blocked by:** 10

**Status:** claimed

**Label:** ready-for-agent

**Model:** Sonnet (run `/model sonnet` before `/implement`). Behaviour-preserving splits with the page tests and screenshots as the guard.

- [ ] The four files are split into smaller components in their feature folder; no file in them is left over about 200 lines without a reason written here
- [ ] The activity details page gets an MSW page test before it is split, since it has none today
- [ ] No change in what the pages render or request: the MSW page tests pass, and the 10 dashboard pages match their step-3 screenshots
- [ ] `pnpm type-check` and `pnpm test` pass, and `pnpm lint` passes as it stands when the ticket runs (oxlint is set up outside this spec). The test counts are recorded in this ticket's comments
- [ ] No lint rule is silenced with a disable comment
- [ ] Work on its own branch, merged into `dev` through a pull request
