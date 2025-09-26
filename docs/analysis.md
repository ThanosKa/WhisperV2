## Analysis pipeline: STT conversation to meeting insights

This document explains the end-to-end pipeline that turns live speech into structured meeting insights, questions, and "define" suggestions. It follows the flow from audio capture and transcription (STT) through prompt building, LLM analysis, parsing, persistence, and UI updates.

### What you get

- Real-time analysis of the ongoing conversation
- Consistent LLM output format with strict sections
- Deduplicated action items like detected questions and terms to define
- Saved transcript and summary per session for later retrieval

---

## High-level flow

1. User starts a Listen session (via the UI) → `ListenService` initializes a DB session and connects to the STT relay WebSocket.
2. Renderer captures microphone and system audio, streams chunks via IPC to main; `sttService` forwards audio to the relay.
3. STT relay processes audio server-side (proxies to OpenAI/Gemini), streams partial text for both speakers ("Me" and "Them") and signals turn completion.
4. On each final utterance (debounced ~1200ms silence), `ListenService`:
    - Pre-filters very short text (<3 chars, e.g., noise)
    - Saves the transcript row to SQLite
    - Forwards the utterance to `SummaryService.addConversationTurn` (which further skips <5 chars for analysis)
5. `SummaryService` decides when to trigger analysis (smart batching or step-based). When it does:
    - Builds the system prompt by combining the analysis profile template with contextual elements (prior summary, dedup terms/questions, recent transcript window)
    - Optionally prefixes with a role from the selected preset
    - Calls the server-backed LLM via `llmClient.chat`
    - Parses the output (JSON preferred, fallback to strict headings) and converts to structured object with deduplication
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
- Receives: `PARTIAL` (deltas/transcripts) → emits partial `stt-update` to renderer; `TURN_COMPLETE`/`completed` → debounces (1200ms), filters noise (e.g., [NOISE]), aggregates final text, calls `onTranscriptionComplete` callback, sends final `stt-update`.
- Separate buffers/timers per speaker; smart handling for provider messages (e.g., OpenAI `conversation.item.input_audio_transcription.delta/completed`).

Key details:

- Noise filtering of placeholders (e.g., `[NOISE]`, `<noise>`)
- Debounce via `utteranceSilenceMs: 1200`
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
    - `conversationHistory`: normalized lines like `me: ...` or `them: ...` (last ~30 for prompts)
    - `definedTerms`: dedup Set for previously suggested "Define" items
    - `detectedQuestions`: dedup Set for previously detected questions
    - `previousAnalysisResult`, `analysisHistory`, `lastAnalyzedIndex` (tracks analyzed utterances)
    - `analysisProfile`: base template (default 'meeting_analysis')
    - `selectedPresetId`, `selectedRoleText` (from preset)
    - `mockMode`: boolean (default true for testing; injects fake conversation data from `mockAnalysisData.js` but runs real LLM analysis once)
- `addConversationTurn(speaker, text)`: normalizes/pushes to history (skips very short >=5 chars), advances index, calls `triggerAnalysisIfNeeded()`. In mock mode, adds without auto-triggering to build full history.
- `triggerAnalysisIfNeeded()` uses smart gating (if `config.smartTrigger.enabled`):
    - Batches 3-5 meaningful utterances (tracks deltas via `lastAnalyzedIndex`)
    - Content gate: trigger if batch >=80 chars OR ~12 tokens (rough estimate via `_roughTokenCount`, skips fluff)
    - Max wait: force at 6 utterances
    - Time fallback: 120s timer from first utterance (clears on activity)
    - Fallback: every `analysisStep:5` utterances for responsiveness
    - In mock mode: Forces single analysis on full injected history after simulation via `simulateMockAnalysis()`
- Only sends NEW utterances since last analysis to LLM (with priors for dedup); mock uses full history once.
- When triggered: calls `makeOutlineAndRequests(newUtterances)`:

#### Flow in `makeOutlineAndRequests`

1. Formats recent transcript (last 30 turns) and prepares context:
    - Prior summary bullets (most meaningful from `previousAnalysisResult`, up to 2)
    - Previously defined terms/questions (for duplication avoidance)
    - New batch transcript window
2. Builds system prompt: `getSystemPrompt(analysisProfile, { context: fullContext })`
    - If `selectedRoleText`, prefixes as `<role>[trimmed role ~100 words]</role>\n\n[base prompt]`
    - Role extracted via `_extractRoleFromPrompt` (e.g., "You are a sales coach...") from preset JSON/raw
3. Calls `llmClient.chat` with:
    - system: full prompt (enforces transcript language)
    - user: "Analyze **ONLY** the conversation provided in the Transcript context above IN THE **LANGUAGE OF THE TRANSCRIPT**. If nothing is detected then DO NOT RETURN ANYTHING."
4. Logs full input/output to `src/analysis.txt` for debugging (includes timestamp, mode: Mock STT + Real LLM, profile).
5. Parses response via `parseResponseText`:
    - First, extracts/parses JSON from ```json blocks (preferred; uses `sections`array with`type` like "insights", "gaps"; strips quotes/dashes, filters placeholders like "no questions detected")
    - Fallback: strict heading rules for sections (exact `### Meeting Insights` → bullets to `summary`; handles variants like `### Gaps`)
    - Handles profile-specific sections (e.g., sales: Opportunities → summary, Objections → 🔄 Address Objection actions)
    - Extracts: `summary` (up to 5 recent bullets, most-recent-first, plain text), `actions` (varied emoji prefixes, e.g., ❓ questions, 📘 defines, 🔍 gaps)
    - Deduplicates terms/questions against Sets (case-insensitive), updates them; limits actions to 10
    - Additional: `_extractDefineCandidates` heuristically pulls 1-3 terms from recent lines (proper nouns/acronyms, filters common/short)
6. Structures as `{ summary, actions, followUps }`; if session long (>=15 utts via `recapStep`), prepends `🗒️ Recap meeting so far` to actions.
7. Saves raw text + `tldr` (joined bullets), `bullet_json` (legacy empty), `action_json` (emoji-prefixed array) to `summaries` table via `summaryRepository`. Touches session via `sessionRepository`.
8. Emits `summary-update` to Listen UI (includes `presetId`); calls `onAnalysisComplete` callback; stores in `analysisHistory` (prunes >10).

#### Emoji Mapping in Parsing

Emojis are added post-LLM in `parseResponseText` for UI consistency (raw LLM outputs plain bullets/headings/JSON without them). Unified `actions` array uses descriptive prefixes; `summary` remains plain. Dedup before prefixing.

- Detected Questions (`### Questions Detected` or `type: "questions"`): `❓ ${question}`
- Terms to Define (`### Terms to Define` or `type: "defines"`): `📘 Define ${coreTerm}` (core extracted before explanations)
- Gaps (`### Gaps`/`### Skill Gaps` or `type: "gaps"`): `⚠️ Gap: ${gap}`
- Suggested Questions (`### Suggested Questions` or `type: "suggested_questions"`): `👆 Suggested Question: ${question}`
- Objections & Needs (`### Objections & Needs` or `type: "objections"`): `❗❗ Address Objection: ${objection}`
- Root Causes (`### Root Causes` or `type: "root_causes"`): `🔎 Root Cause: ${cause}`
- Unclear Points (`### Unclear Points` or `type: "unclear_points"`): `❓ Clarify: ${unclear}`
- Study Questions (`### Study Questions` or `type: "study_questions"`): `📚 Study Question: ${question}`
- Troubleshooting Steps (`### Troubleshooting Steps` or `type: "troubleshooting"`): `🔍 Troubleshooting Step: ${step}`
- Follow-Ups (`### Follow-Up Questions` or `type: "follow_ups"`): `💡 Sales Follow-up: ${followup}` (sales-specific)
- Strengths/Key Concepts/Opportunities/Issue Summary (various, e.g., `type: "strengths"`): Plain bullets to `summary`
- Default Follow-Ups (always): `['✉️ Draft a follow-up email', '✅ Generate action items', '📝 Show summary']`
- Recap (if long): `🗒️ Recap meeting so far` (prepended to actions)
- Error Fallback: `['✨ What should I say next?', '💬 Suggest follow-up questions']`

#### Optimized Triggering for Enterprise Responsiveness

To avoid spammy LLM calls in chit-chat, batches 3-5 finalized utterances, gating on substance while streaming partials instantly to UI.

**Flow**:

1. On utterance final (~1200ms silence): Pre-filter <3 chars in `ListenService`; in `SummaryService`, add only meaningful (>=5 chars) to batch.
2. Accumulate in `conversationHistory`; track new via `lastAnalyzedIndex`.
3. In `triggerAnalysisIfNeeded()`: If batch <3, wait (uses `batchTimer`).
    - Substance: >=80 chars OR ~12 tokens total (skips "Yeah, cool.").
    - Force at 6 utterances (prevents backlog).
    - Time: 120s timer from first (forces if quiet, clears on activity).
4. Triggered: Analyze only new batch + priors (prev terms/questions). Emit insights on completion. In mock: Single full-history analysis.

**Config Knobs** (`config.js`):

- `smartTrigger.enabled: true` (batches; fallback `analysisStep:5` if false)
- `minCharCount:80`, `minTokenCount:12` (thresholds)
- `maxWaitUtterances:6` (batch max)
- `utteranceSilenceMs:1200` (STT final speed)

Cuts LLM calls 50-70% (e.g., 3-4 in chit-chat), focuses on key moments (like Otter.ai). All utterances saved to DB—no discards.

### Prompt building and templates

- Files:
    - `src/features/common/prompts/promptBuilder.js`
    - `src/features/common/prompts/promptTemplates.js`
- `getSystemPrompt(profile, context)`: Selects from `profilePrompts`, assembles (intro + format + content), injects context block at end.
- Analysis uses `analysisProfile` (default 'meeting_analysis') which enforces strict output (headings, no placeholders, short noun terms, prioritize 'me'-helpful items).

`meeting_analysis` enforces:

- Output ONLY these sections, in order:
    1. `### Meeting Insights` (bullets, recent-first)
    2. `### Questions Detected` (numbered 1.)
    3. `### Terms to Define` (bullets, transcript-present nouns)
- Speaker tags: `me:` vs `them:`
- No "No questions detected"; empty sections OK

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
    - 'personal'/'meetings' → 'meeting_analysis': Sections `### Meeting Insights` (bullets → plain summary), `### Questions Detected` (numbered → ❓ actions), `### Terms to Define` (bullets → 📘 actions)
    - 'sales' → 'sales_analysis': `### Sales Opportunities` (bullets → plain summary), `### Objections & Needs` (bullets → ❗❗ Address Objection actions), `### Follow-Up Questions` (numbered → 💡 Sales Follow-up actions), `### Terms to Define` (bullets → 📘 actions)
    - 'recruiting' → 'recruiting_analysis': `### Candidate Strengths`/`### Strengths` (bullets → plain summary), `### Skill Gaps`/`### Gaps` (bullets → ⚠️ Gap actions), `### Suggested Questions` (numbered → 👆 Suggested Question actions), `### Terms to Define` (bullets → 📘 actions)
    - 'customer-support' → 'customer_support_analysis': `### Issue Summary` (bullets → plain summary), `### Root Causes` (bullets → 🔎 Root Cause actions), `### Troubleshooting Steps` (bullets → 🔍 Troubleshooting Step actions), `### Terms to Define` (bullets → 📘 actions)
    - 'school' → 'school_analysis': `### Key Concepts` (bullets → plain summary), `### Unclear Points` (bullets → ❓ Clarify actions), `### Study Questions` (numbered → 📚 Study Question actions), `### Terms to Define` (bullets → 📘 actions)
- Fallback: Unknown/user-raw → 'meeting_analysis' with injected role text.
- Parsing: Maps variant sections to unified `summary`/`actions` (e.g., 'Root Causes' → 🔎 Root Cause actions; bullets to plain summary). Handles JSON `sections` array with `type` (e.g., "gaps" → ⚠️) or markdown headings exactly.

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
- `TURN_COMPLETE`/`completed` → debounce timer (1200ms), flush final buffer (noise-filtered), emit final `stt-update {isFinal: true}`, call `onTranscriptionComplete(speaker, finalText)`

3. Persist the utterance

- `ListenService.handleTranscriptionComplete` → if `text.trim().length >= 3`: `sttRepository.addTranscript({sessionId, speaker, text})`

4. Add to analysis

- `summaryService.addConversationTurn(speaker, text)` → normalize (`me: ${text}` / `them: ${text}`), push to `conversationHistory` (if meaningful), `lastAnalyzedIndex++`, `triggerAnalysisIfNeeded()`

5. Build prompt and call LLM

- If triggered: `makeOutlineAndRequests(history.slice(-30))` builds context (prev bullets + dedup lists + new transcript)
- System: role prefix (if preset) + `getSystemPrompt(profile, {context})`
- Messages: system (full), user ("Analyze...")
- `llmClient.chat(messages)` → server /api/llm/chat

6. Parse and emit results

- `parseResponseText`: JSON extract/parse first (from ```json), fallback heading scan (exact ###, bullets/numbered)
- Dedup/extract: `summary` (reverse bullets), `actions` (❓/📘 prefixed)
- Update Sets, save via `summaryRepository.saveSummary({sessionId, text: raw, tldr: join(summary), action_json: JSON(actions)})`
- Emit `summary-update {summary, actions, followUps}` (prepend recap if `history.length > threshold`)
- Advance `lastAnalyzedIndex`; store `previousAnalysisResult`

---

## Data formats

### Transcript line (in-memory)

```
|"me: I think we should upgrade to Next.js 15."
|"them: Let's first check compatibility with our Tailwind setup."
```

### LLM messages

```json
[
    {
        "role": "system",
        "content": "<role>[preset role]</role>\n\n[base prompt]\n\nContext\n---\n[prior summary]\n\nPrevious Terms: [list]\nPrevious Questions: [list]\n\nTranscript\n---\nme: ...\nthem: ..."
    },
    {
        "role": "user",
        "content": "Analyze **ONLY** the conversation provided in the Transcript context above IN THE **LANGUAGE OF THE TRANSCRIPT**. If nothing is detected then DO NOT RETURN ANYTHING."
    }
]
```

### Required LLM output (strict headings; JSON alt supported)

```
### Meeting Insights
- Key point 1
- Key point 2

### Questions Detected
1. What is our upgrade timeline?
2. Do we have any blockers?

### Terms to Define
- RSC
- Turbopack
```

Or JSON (preferred, from ```json blocks):

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
        "⚠️ Gap: Skill shortage in frontend",
        "👆 Suggested Question: What's the hiring timeline?",
        "❗❗ Address Objection: Pricing too high"
    ],
    "followUps": ["✉️ Draft a follow-up email", "✅ Generate action items", "📝 Show summary"]
}
```

Note: If long session, prepends "🗒️ Recap meeting so far" to actions. Actions limited to 10, deduped.

---

## Configuration and extensibility

### Key config knobs (see `src/features/common/config/config.js`)

- `sttRelayUrl`: WS endpoint (default 'ws://localhost:8080')
- `utteranceSilenceMs: 1200` (debounce for finals)
- `analysisStep: 5` (fallback trigger every N utts)
- `smartTrigger.enabled: true`, `minCharCount:80`, `minTokenCount:12`, `maxWaitUtterances:6` (batching gates)
- `recapStep: 15` (show recap after N utts)

Extensibility: Add profiles to `promptTemplates.js`, seed presets in DB init; toggle Firebase repo if needed. Mock mode toggle via `setMockMode(enabled)` for testing (loads from `mockAnalysisData.js`).
