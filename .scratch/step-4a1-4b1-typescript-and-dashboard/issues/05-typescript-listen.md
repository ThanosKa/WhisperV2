# 05: TypeScript part 2: `listen`

**What to build:** `src/main/features/listen/` (audio capture, `SystemAudioDump`, the STT relay, summaries) is strict TypeScript, following the patterns from ticket 04, with the relay's messages parsed with zod. Listen works as before. Follows [the spec](../spec.md), "4a-1: folders and TypeScript".

**Blocked by:** 04

**Status:** resolved

**Label:** ready-for-agent

**Model:** Opus (run `/model opus` before `/implement`). The core of the app, with few tests left after `listenService.test.js` was deleted: a typing mistake in the audio or relay path would only show up in the end-of-spec run.

- [x] Every file under `listen/` is strict TypeScript with zero type errors; its `console.*` calls use the logger with the session id in scope
- [x] Messages from the STT relay and any WhisperAPP responses read here are parsed with zod into named types, written from what the code reads today
- [x] No `any`, no type assertions (`as const` allowed), no non-null `!`, object arguments for named functions
- [x] Today's structure stays; no behaviour changes
- [ ] `pnpm type-check` and `pnpm test` pass, and `pnpm lint` passes as it stands when the ticket runs (oxlint is set up outside this spec). The test counts are recorded in this ticket's comments
- [x] No lint rule is silenced with a disable comment
- [ ] Work on its own branch, merged into `dev` through a pull request

## Comments

Done 2026-11-28 on branch `step-4a1-4b1-05-typescript-listen` (ticket 06 merged in first).

- **Counts:** Vitest 211 (`main` 150, `whisper_web` 61). Main was 127; the 23 new tests are `tests/integration/listen/listenSession.test.ts`, written and passing against the JavaScript first. `pnpm type-check`, `pnpm test`, `pnpm web:lint` and `pnpm run build:all` pass.
- **Not ticked: `pnpm lint`.** It fails as on the integration branch (root `eslint`, no root config); left to the oxlint setup. No disable comment was added. **Not ticked: the PR into `dev`**; the branch is committed locally. The Electron suite was not run (ticket 12).
- **The new tests** run the real `listenService`, `sttService` and `summaryService` through their public methods: the real repositories on SQLite `:memory:` (`sqliteClient.connect(':memory:')` + `initTables()`), a real WebSocket fake of the relay (`tests/support/fakeRelay.ts`, records what the app sends, answers CONNECTED/PARTIAL/TURN_COMPLETE/ERROR, closes with 4429). Replaced: the signed-in user, `llmClient.chat` and the windows. Covered: Listen/Stop/Resume/Done, relay retry, no desktop session, partials and final turns saved, noise and short turns dropped, non-JSON relay frames, mic and system audio frames, quota close 4429, relay drop, live insights per preset (meeting, sales), non-JSON analysis, comprehensive summary and its fallback, crash recovery (detect, block Listen, resume, finalize, mismatch).
- **Parsed with zod:** relay messages (`RelayMessageSchema`; a frame of another shape is logged and ignored, like a non-JSON frame), the LLM analysis answer (`AnalysisEnvelopeSchema` + `readSection`), the comprehensive summary answer (`ComprehensiveSummarySchema`), rows of `transcripts`, `summaries`, `session_insights` and the insight payload JSON (`TranscriptRow`, `SummaryRow`, `Insight`, `InsightPayload`), a preset's JSON role prompt.
- **Object arguments** (JS callers in `featureBridge.js` updated, 4 lines): `listenService.handleSendMicAudioContent({ data, mimeType })`, `handleRecoveryAction({ action, sessionId })`, `sendToRenderer({ channel, data })`, `sttService.sendSystemAudioContent({ data, mimeType })`; inside listen, `onTranscriptionComplete({ speaker, text })`, `summaryService.addConversationTurn({ speaker, text })`, `parseResponseText({ responseText, previousResult })` and the private helpers.
- **Dead code deleted:** `sttService.renewSessions`, `handleSendSystemAudioContent`, `debounceMeCompletion`/`debounceThemCompletion` (and the `utteranceSilenceMs` read only they used), the keep-alive/renew timers `closeSessions` cleared but nothing set, `message.error` checks (never set); `summaryService` mock STT mode (`mockMode` was never turned on) with `common/mocks/mockAnalysisData.ts`, `setAnalysisProfile`, `getFormattedPreviousContext`, `_getPreviousContext`, `_extractDefineCandidates`, `_populateContextFromLLMResponse`, an unused contextual prompt; `listenService._generateAndSaveMeetingTitle` and the `isMacOSAudioRunning?.()` check (no such method).
- **Small differences, only on data the app does not produce:** a relay frame with wrong field types is ignored (it could throw inside the socket handler); a summary answer of the wrong shape gets the fallback summary (it could fail the SQLite write or save a non-text title); a transcript row with NULL speaker or text hydrates as `''` (it threw); a missing header or listen window in `handleListenRequest` throws a named error instead of a `TypeError` (same flow). The two STT retry loops share `connectSttWithRetry` (same 10 tries, 300 ms).
- **Kept as it behaves today, for 4a-2:** (1) after a relay retry, or Done then Listen quickly, the old socket's late `close` event runs `_teardownRelayState()` on the new connection: `relaySocket` becomes null while the STT sessions stay, so `isSessionActive()` is true but audio fails with "Relay connection not ready" and `closeSessions` cannot close the new socket. The listen tests wait for each socket to close between tests because of it. (2) `writeDebugLog` appends to `./response.txt` in the working directory every analysis round. (3) `definedTerms`/`detectedQuestions` are never filled (their filler was dead), so Ask always gets them empty.
- **For ticket 07:** the listen IPC payloads in `featureBridge.js` are still unparsed; `_sendRelayAudio` keeps its runtime `typeof data !== 'string'` check until they are. `askService.loadListenService()`'s two-method shape is satisfied by the real `listenService` type without change.
