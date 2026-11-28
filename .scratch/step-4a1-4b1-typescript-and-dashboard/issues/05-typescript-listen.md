# 05: TypeScript part 2: `listen`

**What to build:** `src/main/features/listen/` (audio capture, `SystemAudioDump`, the STT relay, summaries) is strict TypeScript, following the patterns from ticket 04, with the relay's messages parsed with zod. Listen works as before. Follows [the spec](../spec.md), "4a-1: folders and TypeScript".

**Blocked by:** 04

**Status:** claimed

**Label:** ready-for-agent

**Model:** Opus (run `/model opus` before `/implement`). The core of the app, with few tests left after `listenService.test.js` was deleted: a typing mistake in the audio or relay path would only show up in the end-of-spec run.

- [ ] Every file under `listen/` is strict TypeScript with zero type errors; its `console.*` calls use the logger with the session id in scope
- [ ] Messages from the STT relay and any WhisperAPP responses read here are parsed with zod into named types, written from what the code reads today
- [ ] No `any`, no type assertions (`as const` allowed), no non-null `!`, object arguments for named functions
- [ ] Today's structure stays; no behaviour changes
- [ ] `pnpm type-check` and `pnpm test` pass, and `pnpm lint` passes as it stands when the ticket runs (oxlint is set up outside this spec). The test counts are recorded in this ticket's comments
- [ ] No lint rule is silenced with a disable comment
- [ ] Work on its own branch, merged into `dev` through a pull request
