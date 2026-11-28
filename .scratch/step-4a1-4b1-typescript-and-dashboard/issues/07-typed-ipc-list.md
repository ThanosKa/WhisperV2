# 07: One typed IPC list, and no JavaScript left in main

**What to build:** every IPC channel is in one list in `src/shared/`, with its kind, payload schema and result type; main parses each payload before using it, preload's `window.api` is typed from the list, and `index`, the bridges and preload are TypeScript. `allowJs` is turned off. The Lit UI is unchanged. Follows [the spec](../spec.md), "4a-1: IPC contract".

**Blocked by:** 05, 06

**Status:** resolved

**Label:** ready-for-agent

**Model:** Opus (run `/model opus` before `/implement`). 68 handlers and about 115 preload calls: each schema must accept exactly what today's UI sends, and a schema that is too strict breaks a feature only on the path that sends it.

- [x] One list in `src/shared/` names every channel, its kind (`invoke`, renderer-to-main `send`, main-to-renderer event), its zod payload schema and its result type. Each schema is written from the renderer's call sites and the handler's reads
- [x] Every `ipcMain` registration goes through one typed helper that parses the payload; a failed parse is logged with the channel name and the zod issues, and the call is rejected
- [x] Preload exposes the same `window.api` shape as today, typed from the list, so a renamed channel fails type-check in preload
- [x] Channels with no sender or no handler are deleted on both sides, and listed in this ticket's comments
- [x] `index`, `featureBridge`, `windowBridge`, `internalBridge` and preload are strict TypeScript; their `console.*` calls use the logger
- [x] `allowJs` is off: no JavaScript file is left in main, preload or shared
- [x] The bridges stay in place (moving registrations into each feature is 4a-2)
- [x] The 4 smoke tests pass once in dev, since a bad schema can break startup
- [ ] `pnpm type-check` and `pnpm test` pass, and `pnpm lint` passes as it stands when the ticket runs (oxlint is set up outside this spec). The test counts are recorded in this ticket's comments
- [x] No lint rule is silenced with a disable comment
- [ ] Work on its own branch, merged into `dev` through a pull request

## Comments

Done 2026-11-28 on branch `step-4a1-4b1-07-typed-ipc-list`.

- **Counts:** Vitest 315 (`main` 254, `whisper_web` 61); ticket 05 left 211, this ticket adds 104 (73 schema cases for today's UI payloads, 5 helper, 6 bridge, 20 preload). `pnpm type-check`, `pnpm test`, `pnpm web:lint` and `pnpm run build:all` pass. Smoke tests in dev, once at the end: 4/4.
- **Not ticked: `pnpm lint`.** Fails as before (no root ESLint config); left to the oxlint setup. Not ticked: the PR into `dev` (the caller opens it).
- **The list:** `src/shared/ipc.ts`, `ipcChannels = { invoke, send, event }`: 49 invoke, 12 send, 29 event channels. `args` is a zod tuple of the positional arguments as the preload sends them; `result` is a `z.custom<T>()` type carrier (main's own value, never parsed), with `T` derived from the service with `import type`. Event payload schemas are documentation and types; main does not parse what it sends. `shared` imports main types (type-only); 4a-2 can turn that around when features own their channels.
- **Helper:** `src/main/ipc/typedIpc.ts`: `handle({ channel, handler })`, `on({ channel, listener })`, `sendEvent({ webContents, channel, args })`. A failed parse logs `{ channel, issues }`; an invoke rejects with `Invalid payload on IPC channel <name>`, a send is dropped. The bridges and `index` use `sendEvent`; the services still call `webContents.send` themselves (4a-2).
- **Preload:** `window.api` keeps every namespace, method and wire argument (pinned by `tests/unit/preload/preload.test.ts`), typed from the list, and exports `type WhisperApi` for step 6. It imports the list for types only: the sandboxed preload cannot `require('zod')` (checked: `out/preload/preload.js` requires only `electron`).
- **Deleted channels (no sender in the UI or no handler in main):**
  - invoke: `settings:getPresets`, `settings:getSettings`, `settings:saveSettings` (preload only, no UI caller), `get-preset-templates`, `get-web-url`, `open-login-page`, `recovery-toast:hide` (handler only), `open-shortcut-settings-window` (preload only, no handler; its one Lit caller `openShortcutEditor` is itself never called);
  - events: `settings-window-hide-animation` (the preload `content` namespace; no sender, no caller), `feature:ask:progress` and `window:focus-change` (their senders were never called), `enter-personalize-mode`, `update-status`, `session-initializing`, `navigate-previous-response`, `navigate-next-response` (sent, no listener).
  - Code that only served them: `windowManager.hideRecoveryToast`, `presetRepository.getPresetTemplates`, the `onStatusUpdate` callbacks of `sttService` and `summaryService`, the shortcuts' `sendToRenderer`.
- **Kept although dead, because the Lit UI still calls the preload method (step 6 removes them):** the events `ask:showTextInput` (`AskView`) and `recovery-toast:hide` (`RecoveryToast`) have listeners but no sender; they stay in the list, marked.
- **Kept behaviour, for 4a-2:** the `previousResponse`/`nextResponse` shortcuts stay registered as no-ops, so the app still takes those keys from other apps. `initAutoUpdater`'s `update-downloaded` listener still sends `undefined` version, date and name (it read five positional arguments; electron-updater passes one). Its schema allows that.
- **Tests changed:** the listen behaviour tests asserted on `update-status`; they now check `change-listen-capture-state` or `isSessionActive()` instead. `sttService.test.ts` drops `onStatusUpdate`.
- **`index.ts`:** the dashboard API's `eventBridge` requests (from HTTP, via `backend_node`) are parsed per channel with zod before use; a bad payload answers `success: false`, as a thrown error did. `src/main/types/backendNode.d.ts` declares the `backend_node/dist` default export, and `@types/express` is now a root dev dependency. `scripts/release-mac.d.ts` types the release script for its test once `allowJs` is off.
- `sttService._sendRelayAudio` drops its `typeof data !== 'string'` check (ticket 05's note); an empty string still throws.
