## Analysis pipeline: STT conversation to meeting insights

This document explains the end-to-end pipeline that turns live speech into structured meeting insights, questions, and "define" suggestions. It follows the flow from audio capture and transcription (STT) through prompt building, LLM analysis, parsing, persistence, and UI updates.

### What you get

- Real-time analysis of the ongoing conversation
- Consistent LLM output format with strict sections
- Saved transcript and summary per session for later retrieval

---

## High-level flow

1. User starts a Listen session (via the UI) → `ListenService` initializes a DB session and connects to the STT relay WebSocket.
2. Renderer captures microphone and system audio, streams chunks via IPC to main; `sttService` forwards audio to the relay.
3. STT relay processes audio server-side (proxies to OpenAI/Gemini), streams partial text for both speakers ("Me" and "Them") and signals turn completion.
4. On each final utterance (debounced ~800ms silence), `ListenService`:
    - Pre-filters very short text (<3 chars, e.g., noise)
    - Saves the transcript row to SQLite
    - Forwards the utterance to `SummaryService.addConversationTurn` (which further skips <5 chars for analysis)
5. `SummaryService` decides when to trigger analysis (smart batching or step-based). When it does:
    - Builds the system prompt by combining the analysis profile template with contextual elements (previous terms/questions, new transcript window of utterances since last analysis)
    - Optionally prefixes with a role from the selected preset
    - Calls the server-backed LLM via `llmClient.chat`
    - Parses the output as JSON and converts to structured object
    - Persists the summary to SQLite and sends a `summary-update` event to the Listen window
6. UI updates the summary/actions pane accordingly and keeps accruing results as the meeting continues. At session end, generates a meeting title.

---

## Components and responsibilities

### STT: capture, debounce, and finalize

- File: `src/features/listen/stt/sttService.js`
- Handles two streams: `Me` (microphone audio via renderer IPC) and `Them` (system audio: renderer loopback on Win/Linux, native `SystemAudioDump` on macOS).
- Connects to STT relay WebSocket (`ws://localhost:8080` or env `STT_RELAY_URL`) with `X-Session-UUID` auth header.
- On init: sends `OPEN` message with sessionId, language, streams=['me','them'].
- Forwards audio chunks as `AUDIO` messages (Base64 PCM 24kHz) to relay; relay proxies to provider (OpenAI conversation API).
- Receives: `PARTIAL` (deltas/transcripts) → emits partial `stt-update` to renderer; `TURN_COMPLETE`/`completed` → debounces (800ms), filters noise (e.g., [NOISE]), aggregates final text, calls `onTranscriptionComplete` callback, sends final `stt-update`.
- Separate buffers/timers per speaker; smart handling for provider messages (e.g., OpenAI `conversation.item.input_audio_transcription.delta/completed`).

Key details:

- Noise filtering of placeholders (e.g., `[NOISE]`, `<noise>`)
- Debounce via `utteranceSilenceMs: 800`
- Relay lifecycle: `CONNECTED` confirms upstream ready; `CLOSE` on session end
- Errors surfaced via `ERROR` messages and status updates

### Orchestrator: `ListenService`

- File: `src/features/listen/listenService.js`
- Manages session lifecycle (initialize/pause/resume/close) via IPC from renderer (e.g., `listen:changeSession`).
- Sets STT and Summary callbacks; on init: creates DB session via `sessionRepository`, initializes STT with retry logic (up to 10 attempts, 300ms delay).
- On `Listen`: DB session + STT connect → signal renderer to start audio capture.
- On `Stop`: stops capture, keeps relay alive.
- On `Resume`: restarts capture.
- On `Done`: stops capture, closes relay (`CLOSE`), ends DB session, generates LLM-backed meeting title (fallback heuristic).
- On each final utterance (`handleTranscriptionComplete`):
    - Pre-filters <3 chars (skips noise like "uh")
    - Persists via `sttRepository.addTranscript({sessionId, speaker, text})`
    - Forwards to `summaryService.addConversationTurn(speaker, text)`

### Analysis engine: `SummaryService`

- File: `src/features/listen/summary/summaryService.js`
- Maintains in-memory state over the session:
    - `conversationHistory`: normalized lines like `me: ...` or `them: ...` (new utterances since last analysis for prompts)
    - `definedTerms`: Set for previously suggested "Define" items
    - `detectedQuestions`: Set for previously detected questions
    - `previousAnalysisResult`, `analysisHistory`, `lastAnalyzedIndex` (tracks analyzed utterances)
    - `analysisProfile`: base template (default 'meeting_analysis')
    - `selectedPresetId`, `selectedRoleText` (from preset)
    - `mockMode`: boolean (default true for testing; injects fake conversation data from `mockAnalysisData.js` but runs real LLM analysis once)
- `addConversationTurn(speaker, text)`: normalizes/pushes to history (skips very short >=5 chars), advances index, calls `triggerAnalysisIfNeeded()`. In mock mode, adds without auto-triggering to build full history.
- `triggerAnalysisIfNeeded()` uses smart gating (if `config.smartTrigger.enabled`):
    - Waits until at least 3 utterances in batch
    - Content gate: trigger if batch >=80 chars OR ~12 tokens (rough estimate via `_roughTokenCount`, skips fluff)
    - Force at 6 utterances
    - Time fallback: 120s timer from first utterance (clears on activity)
    - Fallback: every `analysisStep:1` utterances for responsiveness
    - In mock mode: Forces single analysis on full injected history after simulation via `simulateMockAnalysis()`
- Only sends NEW utterances since last analysis to LLM; mock uses full history once.
- When triggered: calls `makeOutlineAndRequests(newUtterances)`:

#### Flow in `makeOutlineAndRequests`

1. Formats recent transcript (new utterances since last analysis) and prepares context:
    - Previously defined terms/questions
    - New batch transcript window (up to 30 turns)
2. Builds system prompt: `getSystemPrompt(analysisProfile, { context: fullContext })`
    - If `selectedRoleText`, prefixes as `<role>[trimmed role ~100 words]</role>\n\n[base prompt]`
    - Role extracted via `_extractRoleFromPrompt` (e.g., "You are a sales coach...") from preset JSON/raw
3. Calls `llmClient.chat` with:
    - system: full prompt (enforces transcript language)
    - user: "Analyze **ONLY** the conversation provided in the Transcript context above IN THE **LANGUAGE OF THE TRANSCRIPT**. If nothing is detected then DO NOT RETURN ANYTHING."
4. Logs full input/output to `src/analysis.txt` for debugging (includes timestamp, mode: Mock STT + Real LLM, profile).
5. Parses response via `parseResponseText`:
    - Extracts/parses JSON from ```json blocks (strips quotes/dashes, filters placeholders like "no questions detected")
    - Handles profile-specific sections (e.g., sales: Opportunities → summary, Objections → ❗❗ Objection actions)
    - Extracts: `summary` (up to 5 recent bullets, most-recent-first, plain text), `actions` (varied emoji prefixes, e.g., ❓ questions, 📘 defines, ❗❗Gap)
    - Additional profile-specific mappings (e.g., Root Causes → 🔎 Root Cause actions)
6. Structures as `{ summary, actions, followUps }`; if session long (>=15 utts via `recapStep`), prepends `🗒️ Recap meeting so far` to actions.
7. Saves raw text + `tldr` (joined bullets), `bullet_json` (legacy empty), `action_json` (emoji-prefixed array) to `summaries` table via `summaryRepository`. Touches session via `sessionRepository`.
8. Emits `summary-update` to Listen UI (includes `presetId`); calls `onAnalysisComplete` callback; stores in `analysisHistory` (prunes >10).

#### Emoji Mapping in Parsing

Emojis are added post-LLM in `parseResponseText` for UI consistency (raw LLM outputs JSON without them). Unified `actions` array uses descriptive prefixes; `summary` remains plain.

- Detected Questions (`type: "questions"`): `❓ ${question}`
- Terms to Define (`type: "defines"`): `📘 Define ${coreTerm}` (core extracted before explanations)
- Gaps (`type: "gaps"`): `❗❗Gap: ${gap}`
- Suggested Questions (`type: "suggested_questions"`): `👆 Suggested Question: ${question}`
- Objections & Needs (`type: "objections"`): `❗❗ Objection: ${objection}`
- Root Causes (`type: "root_causes"`): `🔎 Root Cause: ${cause}`
- Unclear Points (`type: "unclear_points"`): `❓ Clarify: ${unclear}`
- Study Questions (`type: "study_questions"`): `📚 Study Question: ${question}`
- Troubleshooting Steps (`type: "troubleshooting"`): `🔍 Troubleshooting Step: ${step}`
- Follow-Ups (`type: "follow_ups"`): `💡 Sales Follow-up: ${followup}` (sales-specific)
- Strengths/Key Concepts/Opportunities/Issue Summary (various, e.g., `type: "strengths"`): Plain bullets to `summary`
- Default Follow-Ups (always): `['✉️ Draft a follow-up email', '✅ Generate action items', '📝 Show summary']`
- Recap (if long): `🗒️ Recap meeting so far` (prepended to actions)
- Error Fallback: `['✨ What should I say next?', '💬 Suggest follow-up questions']`

#### Optimized Triggering for Enterprise Responsiveness

To avoid spammy LLM calls in chit-chat, batches until at least 3 finalized utterances, gating on substance while streaming partials instantly to UI.

**Flow**:

1. On utterance final (~800ms silence): Pre-filter <3 chars in `ListenService`; in `SummaryService`, add only meaningful (>=5 chars) to batch.
2. Accumulate in `conversationHistory`; track new via `lastAnalyzedIndex`.
3. In `triggerAnalysisIfNeeded()`: If batch <3, wait (uses `batchTimer`).
    - Substance: >=80 chars OR ~12 tokens total (skips "Yeah, cool.").
    - Force at 6 utterances (prevents backlog).
    - Time: 120s timer from first (forces if quiet, clears on activity).
4. Triggered: Analyze only new batch. Emit insights on completion. In mock: Single full-history analysis.

**Config Knobs** (`config.js`):

- `smartTrigger.enabled: true` (batches; fallback `analysisStep:1` if false)
- `minCharCount:80`, `minTokenCount:12` (thresholds)
- `maxWaitUtterances:6` (batch max)
- `utteranceSilenceMs:800` (STT final speed)

Cuts LLM calls 50-70% (e.g., 3-4 in chit-chat), focuses on key moments (like Otter.ai). All utterances saved to DB—no discards.

### Prompt building and templates

- Files:
    - `src/features/common/prompts/promptBuilder.js`
    - `src/features/common/prompts/promptTemplates.js`
- `getSystemPrompt(profile, context)`: Selects from `profilePrompts`, assembles (intro + format + content), injects context block at end.
- Analysis uses `analysisProfile` (default 'meeting_analysis') which enforces strict output (JSON sections, no placeholders, short noun terms, prioritize 'me'-helpful items).

`meeting_analysis` enforces:

- Output ONLY JSON with these sections, in order:
    1. `{ "type": "insights", "items": ["- Key point 1", "- Key point 2"] }`
    2. `{ "type": "questions", "items": ["1. What is our upgrade timeline?", "2. Do we have any blockers?"] }`
    3. `{ "type": "defines", "items": ["- RSC", "- Turbopack"] }`
- Speaker tags: `me:` vs `them:`
- Empty sections OK

#### Preset Customization (Role Injection)

- Presets stored/managed via local SQLite (`src/features/common/repositories/preset/sqlite.repository.js`); Firebase alt disabled.
- Preset format: `{ id, title, prompt (raw text or role) }`; CRUD ops (getPresets, savePreset, etc.).
- Seeded defaults: 'personal'/'meetings' (standard), 'sales', 'recruiting', 'customer-support', 'school'.
- Flow:
    1. Session init (`ListenService`): Load `settingsService.getSettings().analysisPresetId` (default 'meetings').
    2. `SummaryService.setAnalysisPreset(presetId)`: Fetch via preset repo, set profile by ID (e.g., 'sales' → 'sales_analysis'), extract/trim role (~100 words) to `selectedRoleText`.
    3. In `makeOutlineAndRequests`: Prefix prompt `<role>[role]</role>\n\n[base]`.
    4. Every analysis uses full (role + base + context).
- UI: Edit in Settings; mid-session switch via `setAnalysisPreset(id)`.
- Extensibility: New profiles in `promptTemplates.js` (e.g., `legal_analysis`); switch with `setAnalysisProfile()`.

#### Preset-ID Mapping to Analysis Variants

- Dynamically selects specialized prompts by ID (seeded/user-created; maps via `_mapPresetToProfile`):
    - 'personal'/'meetings' → 'meeting_analysis': Sections `type: "insights"` (bullets → plain summary), `type: "questions"` ( → ❓ actions), `type: "defines"` ( → 📘 actions)
    - 'sales' → 'sales_analysis': `type: "opportunities"` (bullets → plain summary), `type: "objections"` (bullets → ❗❗ Objection actions), `type: "follow_ups"` ( → 💡 Sales Follow-up actions), `type: "defines"` ( → 📘 actions)
    - 'recruiting' → 'recruiting_analysis': `type: "strengths"` (bullets → plain summary), `type: "gaps"` (bullets → ❗❗Gap actions), `type: "suggested_questions"` ( → 👆 Suggested Question actions), `type: "defines"` ( → 📘 actions)
    - 'customer-support' → 'customer_support_analysis': `type: "issue_summary"` (bullets → plain summary), `type: "root_causes"` (bullets → 🔎 Root Cause actions), `type: "troubleshooting"` (bullets → 🔍 Troubleshooting Step actions), `type: "defines"` ( → 📘 actions)
    - 'school' → 'school_analysis': `type: "key_concepts"` (bullets → plain summary), `type: "unclear_points"` (bullets → ❓ Clarify actions), `type: "study_questions"` ( → 📚 Study Question actions), `type: "defines"` ( → 📘 actions)
- Fallback: Unknown/user-raw → 'meeting_analysis' with injected role text.
- Parsing: Maps variant sections to unified `summary`/`actions` (e.g., 'root_causes' → 🔎 Root Cause actions; bullets to plain summary). Handles JSON `sections` array with `type` (e.g., "gaps" → ❗❗Gap).

Personalizes insights to user's "friend" style (e.g., sales coach on objections).

### LLM client

- File: `src/features/common/ai/llmClient.js`
- Calls server endpoint: `POST /api/llm/chat` with `X-Session-UUID` header (session auth).
- Returns `{ content, raw }`; streams if supported.
- Errors: Logged with context; `SummaryService` falls back to `previousAnalysisResult` on failure.

### Persistence

Transcripts (SQLite):

- File: `src/features/listen/stt/repositories/sqlite.repository.js`
- Table: `transcripts`
- Fields: `id` (UUID), `session_id`, `start_at` (Unix ts), `speaker`, `text`, `created_at`

Summaries (SQLite):

- File: `src/features/listen/summary/repositories/sqlite.repository.js`
- Table: `summaries`
- Upsert by `session_id` (latest overwrites)
- Fields: `generated_at`, `model` ('server'), `text` (raw LLM), `tldr` (joined bullets), `bullet_json` (legacy array), `action_json` (parsed emoji actions), `updated_at`

Note: Firebase impls exist (`firebase.repository.js`) but disabled; local-first with web-auth.

---

## Detailed sequence

1. Start listening

- `ListenService.initializeSession()` → `sessionRepository.getOrCreateActive('listen')` for DB sessionId
- `sttService.initializeSttSessions(language)`: Connect WS to relay (`ws://.../stt-relay?sessionId=...`), send `OPEN`, wait `CONNECTED`
- On macOS: spawn `SystemAudioDump` for `Them` audio pipe
- Emit `change-listen-capture-state: start` → renderer begins mic/system capture, IPC audio to main

2. Receive STT events

- Renderer: Web Audio API (24kHz PCM chunks ~0.1s) for mic; `getDisplayMedia` loopback for system (Win/Linux)
- IPC: `listen:sendMicAudio`/`sendSystemAudio` → `sttService` → relay `AUDIO {stream: 'me'|'them', data: base64}`
- Relay → client: `PARTIAL {stream, text/delta}` → `sttService` appends to buffer, emits partial `stt-update {speaker, text, isPartial: true}`
- `TURN_COMPLETE`/`completed` → debounce timer (800ms), flush final buffer (noise-filtered), emit final `stt-update {isFinal: true}`, call `onTranscriptionComplete(speaker, finalText)`

3. Persist the utterance

- `ListenService.handleTranscriptionComplete` → if `text.trim().length >= 3`: `sttRepository.addTranscript({sessionId, speaker, text})`

4. Add to analysis

- `summaryService.addConversationTurn(speaker, text)` → normalize (`me: ${text}` / `them: ${text}`), push to `conversationHistory` (if meaningful), `lastAnalyzedIndex++`, `triggerAnalysisIfNeeded()`

5. Build prompt and call LLM

- If triggered: `makeOutlineAndRequests(history.slice(-30))` builds context (prev terms/questions + new transcript)
- System: role prefix (if preset) + `getSystemPrompt(profile, {context})`
- Messages: system (full), user ("Analyze...")
- `llmClient.chat(messages)` → server /api/llm/chat

6. Parse and emit results

- `parseResponseText`: JSON extract/parse first (from ```json)
- `summary` (reverse bullets), `actions` (❓/📘 prefixed)
- Save via `summaryRepository.saveSummary({sessionId, text: raw, tldr: join(summary), action_json: JSON(actions)})`
- Emit `summary-update {summary, actions, followUps}` (prepend recap if `history.length > threshold`)
- Advance `lastAnalyzedIndex`; store `previousAnalysisResult`

---

## Data formats

### Transcript line (in-memory)

```
"me: I think we should upgrade to Next.js 15."
"them: Let's first check compatibility with our Tailwind setup."
```

### LLM messages

```json
[
    {
        "role": "system",
        "content": "<role>[preset role]</role>\n\n[base prompt]\n\nContext\n---\nPrevious Terms: [list]\nPrevious Questions: [list]\n\nTranscript\n---\nme: ...\nthem: ..."
    },
    {
        "role": "user",
        "content": "Analyze **ONLY** the conversation provided in the Transcript context above IN THE **LANGUAGE OF THE TRANSCRIPT**. If nothing is detected then DO NOT RETURN ANYTHING."
    }
]
```

### Required LLM output (JSON format)

```json
{
    "sections": [
        {
            "type": "insights",
            "title": "Meeting Insights",
            "items": ["- Key point 2", "- Key point 1"]
        },
        {
            "type": "questions",
            "title": "Questions Detected",
            "items": ["- What is our upgrade timeline?", "- Do we have any blockers?"]
        },
        {
            "type": "defines",
            "title": "Terms to Define",
            "items": ["- RSC", "- Turbopack"]
        }
    ]
}
```

### Parsed structure sent to renderer

```json
{
    "summary": ["Key point 2", "Key point 1"],
    "actions": [
        "❓ What is our upgrade timeline?",
        "❓ Do we have any blockers?",
        "📘 Define RSC",
        "📘 Define Turbopack",
        "❗❗Gap: Skill shortage in frontend",
        "👆 Suggested Question: What's the hiring timeline?",
        "❗❗ Objection: Pricing too high"
    ],
    "followUps": ["✉️ Draft a follow-up email", "✅ Generate action items", "📝 Show summary"]
}
```

Note: If long session, prepends "🗒️ Recap meeting so far" to actions.

---

## Configuration and extensibility

### Key config knobs (see `src/features/common/config/config.js`)

- `sttRelayUrl`: WS endpoint (default 'ws://localhost:8080')
- `utteranceSilenceMs: 800` (debounce for finals)
- `analysisStep: 1` (fallback trigger every N utts)
- `smartTrigger.enabled: true`, `minCharCount:80`, `minTokenCount:12`, `maxWaitUtterances:6` (batching gates)
- `recapStep: 15` (show recap after N utts)

Extensibility: Add profiles to `promptTemplates.js`, seed presets in DB init; toggle Firebase repo if needed. Mock mode toggle via `setMockMode(enabled)` for testing (loads from `mockAnalysisData.js`).
