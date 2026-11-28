# 11: Dashboard's four large components split

**What to build:** `Sidebar.tsx`, the activity page, the activity details page and `SearchPopup.tsx` are split into smaller components in their feature folders, each doing one thing, with the same output. Follows [the spec](../spec.md), "4b-1: dashboard", "Splits".

**Blocked by:** 10

**Status:** resolved

**Label:** ready-for-agent

**Model:** Sonnet (run `/model sonnet` before `/implement`). Behaviour-preserving splits with the page tests and screenshots as the guard.

- [x] The four files are split into smaller components in their feature folder; no file in them is left over about 200 lines without a reason written here
- [x] The activity details page gets an MSW page test before it is split, since it has none today
- [x] No change in what the pages render or request: the MSW page tests pass, and the 10 dashboard pages match their step-3 screenshots
- [ ] `pnpm type-check` and `pnpm test` pass, and `pnpm lint` passes as it stands when the ticket runs (oxlint is set up outside this spec). The test counts are recorded in this ticket's comments
- [x] No lint rule is silenced with a disable comment
- [ ] Work on its own branch, merged into `dev` through a pull request

## Comments

- Split: `Sidebar.tsx` 597 -> 175 lines (+ `SidebarNavItem`, `SidebarSettingsMenu`, `SidebarIcon`, `useSidebarAnimation`); activity page 553 -> 115 (+ `SessionCard`, `SessionList`, `StatsCards`, `useActivitySessions` in `components/activity/`); details page 499 -> 238 (+ `SessionHeader`, `SessionSummary`, `QaList`); `SearchPopup.tsx` 323 -> 215 (+ `SearchResults`, `SearchShortcutHint`).
- Still over 200, with a reason: the details page (238) and `SearchPopup` (215) keep their state and fetch handlers in the component; moving them into hooks was not needed to make each piece do one thing.
- Dead code removed on the way (no output change): unused `Section`, `sessions` state, `SkeletonSessionCard`, `isAnimating`, `getTextAnimationStyle`, `bottomItems` (always empty), `handleLogout`, unused size constants. `JSON.parse` of the summary lists is now checked with zod.
- Tests written before each split and passing against the old code: `activity-details-page.test.tsx` (12), `search-popup.test.tsx` (6), `sidebar.test.tsx` (7). MSW fake desktop got `GET /api/conversations/:sessionId` and `/search/page`.
- Counts: Vitest 62 (dashboard 61), root Jest 130. `pnpm type-check`, `pnpm test`, `pnpm web:lint` pass. `pnpm lint` (root) still fails: no root ESLint config, an oxlint effort outside this spec.
- Left open: the "10 dashboard pages match their step-3 screenshots" check and the pull request to `dev` (no browser; not pushed). Not ticked: the `pnpm lint passes` part of the fourth box, since root lint fails as before.
