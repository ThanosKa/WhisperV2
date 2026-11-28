# 06: TypeScript part 3: `ask`, `settings`, `shortcuts` and `window`

**What to build:** `src/main/features/ask/`, `settings/`, `shortcuts/` and `src/main/window/` are strict TypeScript, following the patterns from ticket 04, with the LLM responses and stream chunks parsed with zod. Can run in parallel with ticket 05. Follows [the spec](../spec.md), "4a-1: folders and TypeScript".

**Blocked by:** 04

**Status:** resolved

**Label:** ready-for-agent

**Model:** Sonnet (run `/model sonnet` before `/implement`). Follows the patterns ticket 04 sets, on code that the moved `askService` and `settingsService` tests and the window screenshot test guard.

- [x] Every file in the four folders is strict TypeScript with zero type errors; its `console.*` calls use the logger with the window name or request in scope
- [x] The LLM client's responses and stream chunks, and any WhisperAPP responses read here, are parsed with zod into named types
- [x] No `any`, no type assertions (`as const` allowed), no non-null `!`, object arguments for named functions
- [x] Today's structure stays: `windowManager` and its two known `Object has been destroyed` bugs are left as they are (fixed in 4a-2)
- [ ] `pnpm type-check` and `pnpm test` pass, and `pnpm lint` passes as it stands when the ticket runs (oxlint is set up outside this spec). The test counts are recorded in this ticket's comments
- [x] No lint rule is silenced with a disable comment
- [ ] Work on its own branch, merged into `dev` through a pull request

## Comments

Done 2026-11-28 on branch `step-4a1-4b1-06-typescript-ask-settings-shortcuts-window`.

- **Counts:** Vitest 188 (`main` 127, `whisper_web` 61), same as after ticket 04. `pnpm type-check`, `pnpm test`, `pnpm web:lint` and `pnpm run build:all` pass.
- **Not ticked: `pnpm lint`.** Fails as before (no root ESLint config); left to the oxlint setup. Not ticked: the PR into `dev` (the caller opens it). Electron suite not run (ticket 12).
- **Zod:** SSE stream chunks in `askService` (`StreamChunkSchema`, a bad line is skipped as before), `summaryService.getCurrentContext()` (`SummaryContextSchema`), `ai_messages` rows, preset and `users.auto_update_enabled` rows, stored settings (`users.<uid>`). `Response` headers are read as before.
- **Object arguments** (JS callers updated by search): `askService.sendMessage({ userPrompt, conversationHistory, presetId, useScreenCapture, webSearchEnabled })`, `sendMessageManual({...})`, `_resolveProfileForIntent({ intent, presetId })`, `_processStream({...})`; `settingsService.notifyPresetUpdate({ action, presetId, title })`; `windowManager.showScreenshotWindow({ base64Data, position })`, `showRecoveryToast({ sessionInfo, headerBounds })`, `moveHeaderTo({ newX, newY })`, `adjustWindowHeight({ winName, targetHeight })`, `setWindowVisibility({ name, visible })`; layout and movement manager methods too. Callers changed in `featureBridge.js`, `windowBridge.js`, `index.js` (one line each).
- **`windowPool` is `Map<string, BrowserWindow>`.** Six crash-recovery tests and `screenshotWindow.test.ts` put fake windows in it; they now use a hoisted `windowPoolGet` mock, or `new BrowserWindow()` from the Electron stand-in, so there are no casts.
- **Dead code deleted:** `settingsService` `getPresetTemplates`, `updatePreset`, `updateContentProtection`, `initialize`, `cleanup` and the retry constants; the matching repository functions; `SmoothMovementManager.animateWindow` (called `this.layoutManager.updateLayout()`, never set, and no caller), `destroy` and unused fields; `WindowLayoutManager` `getHeaderPosition`, `calculateShortcutSettingsWindowPosition`, `boundsOverlap`; in `windowManager` the `header` `before-input-event` handler (it read `input.target`, which key events do not have, so it never did anything), `disableClicks`/`restoreClicks`, `win.__lockedByButton` (written, never read), `enableRemoteModule` and `vibrancy: false` (not valid in the Electron types, no effect).
- **Kept as it behaves today, for 4a-2:** `askService._isMultimodalError` was `async` and its Promise was always truthy, so every error with a screenshot retried text-only. The method is gone and the retry rule says so in a comment. `closeAskWindow` still resets `state` to nine fields, so `useScreenCapture` and the search fields vanish until the next `sendMessage` (the type marks them optional). The two `Object has been destroyed` bugs in `windowManager` are untouched.
- **Small differences:** null guards on `layoutManager`/`movementManager` in `updateChildWindowLayouts` (only reachable before `createWindows`); the `!header` early returns in the layout manager's calculate methods are gone because callers already checked; `handleHeaderStateChanged('main')` skips `createFeatureWindows` if there is no header (it used to throw).
- **`askService` and `listen`:** `listenService` is still loaded with a dynamic `import()` through `loadListenService()`, typed as a two-method shape (`getConversationHistory`, `getCurrentSessionData`) by assignment, no cast. When ticket 05 lands the real types should satisfy it; if not, change only that shape.
- **Left for ticket 07 (typed IPC):** `windowBridge.js` and `featureBridge.js` payloads are still unparsed JS; `askService.state` is sent to the renderer as `AskState` (exported from `askService`).
