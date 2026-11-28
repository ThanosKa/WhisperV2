# 10: Dashboard in the standard Next + shadcn folders, dead code deleted

**What to build:** the dashboard's files sit where Next + shadcn projects keep them, and the files and endpoints nothing uses are gone. Nothing visible changes. Follows [the spec](../spec.md), "4b-1: dashboard", "Folders" and "Deleted".

**Blocked by:** 09

**Status:** open

**Label:** ready-for-agent

**Model:** Sonnet (run `/model sonnet` before `/implement`). Moves and deletions from an exact list, guarded by the page tests and screenshots.

- [ ] `app/` unchanged; shadcn components in `components/ui/`; feature components in `components/<feature>/` (`activity`, `settings`, `layout` for the sidebar and shell); `utils/` merged into `lib/`. Imports keep the `@/` alias; file names keep their current style
- [ ] `utils/api.ts` moves to `lib/` unsplit; `devMock.ts`, `NEXT_PUBLIC_DEV_MOCK` and `runtime-config.json` stay (decided in 4b-2)
- [ ] Deleted: `requirements.txt`, `test-types.d.ts`, and in `backend_node` the endpoints `/api/sync/status`, `/api/desktop/set-user` and `/api/desktop/status`, after a search shows nothing calls them. Nothing else in `backend_node` changes
- [ ] The MSW page tests pass, and the 10 dashboard pages match their step-3 screenshots
- [ ] `pnpm type-check` and `pnpm test` pass, and `pnpm lint` passes as it stands when the ticket runs (oxlint is set up outside this spec). The test counts are recorded in this ticket's comments
- [ ] No lint rule is silenced with a disable comment
- [ ] Work on its own branch, merged into `dev` through a pull request
