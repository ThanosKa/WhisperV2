# 07: One typed IPC list, and no JavaScript left in main

**What to build:** every IPC channel is in one list in `src/shared/`, with its kind, payload schema and result type; main parses each payload before using it, preload's `window.api` is typed from the list, and `index`, the bridges and preload are TypeScript. `allowJs` is turned off. The Lit UI is unchanged. Follows [the spec](../spec.md), "4a-1: IPC contract".

**Blocked by:** 05, 06

**Status:** claimed

**Label:** ready-for-agent

**Model:** Opus (run `/model opus` before `/implement`). 68 handlers and about 115 preload calls: each schema must accept exactly what today's UI sends, and a schema that is too strict breaks a feature only on the path that sends it.

- [ ] One list in `src/shared/` names every channel, its kind (`invoke`, renderer-to-main `send`, main-to-renderer event), its zod payload schema and its result type. Each schema is written from the renderer's call sites and the handler's reads
- [ ] Every `ipcMain` registration goes through one typed helper that parses the payload; a failed parse is logged with the channel name and the zod issues, and the call is rejected
- [ ] Preload exposes the same `window.api` shape as today, typed from the list, so a renamed channel fails type-check in preload
- [ ] Channels with no sender or no handler are deleted on both sides, and listed in this ticket's comments
- [ ] `index`, `featureBridge`, `windowBridge`, `internalBridge` and preload are strict TypeScript; their `console.*` calls use the logger
- [ ] `allowJs` is off: no JavaScript file is left in main, preload or shared
- [ ] The bridges stay in place (moving registrations into each feature is 4a-2)
- [ ] The 4 smoke tests pass once in dev, since a bad schema can break startup
- [ ] `pnpm type-check` and `pnpm test` pass, and `pnpm lint` passes as it stands when the ticket runs (oxlint is set up outside this spec). The test counts are recorded in this ticket's comments
- [ ] No lint rule is silenced with a disable comment
- [ ] Work on its own branch, merged into `dev` through a pull request
