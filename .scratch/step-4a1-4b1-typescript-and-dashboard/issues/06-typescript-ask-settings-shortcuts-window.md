# 06: TypeScript part 3: `ask`, `settings`, `shortcuts` and `window`

**What to build:** `src/main/features/ask/`, `settings/`, `shortcuts/` and `src/main/window/` are strict TypeScript, following the patterns from ticket 04, with the LLM responses and stream chunks parsed with zod. Can run in parallel with ticket 05. Follows [the spec](../spec.md), "4a-1: folders and TypeScript".

**Blocked by:** 04

**Status:** open

**Label:** ready-for-agent

**Model:** Sonnet (run `/model sonnet` before `/implement`). Follows the patterns ticket 04 sets, on code that the moved `askService` and `settingsService` tests and the window screenshot test guard.

- [ ] Every file in the four folders is strict TypeScript with zero type errors; its `console.*` calls use the logger with the window name or request in scope
- [ ] The LLM client's responses and stream chunks, and any WhisperAPP responses read here, are parsed with zod into named types
- [ ] No `any`, no type assertions (`as const` allowed), no non-null `!`, object arguments for named functions
- [ ] Today's structure stays: `windowManager` and its two known `Object has been destroyed` bugs are left as they are (fixed in 4a-2)
- [ ] `pnpm type-check` and `pnpm test` pass, and `pnpm lint` passes as it stands when the ticket runs (oxlint is set up outside this spec). The test counts are recorded in this ticket's comments
- [ ] No lint rule is silenced with a disable comment
- [ ] Work on its own branch, merged into `dev` through a pull request
