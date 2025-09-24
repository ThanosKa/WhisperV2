## Analysis pipeline: STT conversation to meeting insights

This document explains the end-to-end pipeline that turns live speech into structured meeting insights, questions, and "define" suggestions. It follows the flow from audio capture and transcription (STT) through prompt building, LLM analysis, parsing, persistence, and UI updates.

### What you get

- Real-time analysis of the ongoing conversation
- Consistent LLM output format with strict sections
- Deduplicated action items like detected questions and terms to define
- Saved transcript and summary per session for later retrieval

---

## High-level flow

1. User starts a Listen session (via the UI) → `ListenService` initializes an STT relay connection and a DB session.

2. STT relay streams partial text for both speakers ("Me" and "Them") and signals turn completion.

3. On each final utterance, `ListenService`:
    - Saves the transcript row
    - Forwards the utterance to `SummaryService.addConversationTurn`

4. `SummaryService` decides when to trigger analysis (step-based or smart gating). When it does:
    - Builds the system prompt by combining the meeting-analysis template with contextual transcript
    - Calls the server-backed LLM via `llmClient.chat`
    - Parses the strict output sections and converts them to a structured object
    - Persists the summary and sends a `summary-update` event to the Listen window

5. UI updates the summary/actions pane accordingly and keeps accruing results as the meeting continues.

---

## Components and responsibilities

### STT: capture, debounce, and finalize

- File: `src/features/listen/stt/sttService.js`
- Handles two streams: `Me` (microphone) and `Them` (system audio on macOS via `SystemAudioDump`).
- Connects to an STT relay (`WS` at `config.sttRelayUrl`), receives messages, filters noise, aggregates chunks, and fires completion events.
- Debounce windows are controlled via `utteranceSilenceMs`.
- When a turn is complete, calls the `onTranscriptionComplete` callback and sends a final `stt-update` to the renderer.

Key details:

- Noise filtering of common placeholders (e.g., `[NOISE]`, `<noise>`)
- Separate completion buffers/timers per speaker
- Smart handling for different providers (e.g., Gemini vs Whisper)

### Orchestrator: `ListenService`

- File: `src/features/listen/listenService.js`
- Sets STT callbacks and Summary callbacks, manages session lifecycle (initialize/pause/resume/close).
- On each final utterance (`handleTranscriptionComplete`):
    - Persists a transcript row in the local SQLite database via `sttRepository.addTranscript`
    - Forwards the utterance to `summaryService.addConversationTurn`
- At session end, optionally generates and saves a concise meeting title (LLM-backed with a fallback heuristic).

### Analysis engine: `SummaryService`

- File: `src/features/listen/summary/summaryService.js`
- Maintains in-memory state over the session:
    - `conversationHistory`: normalized lines like `me: ...` or `them: ...`
    - `definedTerms`: dedup set for previously suggested "Define" items
    - `detectedQuestions`: dedup set for previously detected questions
    - `previousAnalysisResult`, `analysisHistory`, and `lastAnalyzedIndex`
- `addConversationTurn(speaker, text)`: normalizes and stores a new line, then calls `triggerAnalysisIfNeeded()`.
- `triggerAnalysisIfNeeded()` uses either:
    - Step-based rule: every `config.analysisStep` utterances (default is 1 for responsiveness)
    - Smart gating (if `config.smartTrigger.enabled`): analyze when enough new content has accumulated or max wait reached
- When analysis triggers, only NEW utterances since the previous analysis are sent.

#### Optimized Triggering for Enterprise Responsiveness

To reduce spammy per-utterance LLM calls (common in chit-chat), the trigger now batches 3-5 finalized utterances before analysis, gating on substance while maintaining real-time UI updates (partials stream instantly).

**Flow**:

1. On utterance final (from STT, ~800ms silence): Pre-filter in `ListenService` skips <3 chars (e.g., "uh"). In `SummaryService`, skip adding <5 chars to batch history.
2. Stack meaningful utterances in `conversationHistory` (deltas tracked via `lastAnalyzedIndex`).
3. In `triggerAnalysisIfNeeded()`: If batch <3 utterances, wait. Else:
    - Content gate: Trigger if batch >=80 chars OR ~12 tokens total (skips fluff like "Yeah, cool.").
    - Max wait: Force at 6 utterances (prevents backlog).
    - Time fallback: 120s timer starts on first utterance—forces if quiet (clears on activity).
4. If triggered: Send only new batch to LLM (with priors for dedup: prev terms/questions). UI emits on insights only.

**Config Knobs** (`config.js`):

- `smartTrigger.enabled: true` (on for batching; fallback to `analysisStep:5` if off).
- `minCharCount:80`, `minTokenCount:12` (substance thresholds).
- `maxWaitUtterances:6` (batch limit).
- `utteranceSilenceMs:800` (faster STT finals).

This cuts LLM calls 50-70% (e.g., 3-4 in 2-min chit-chat), focusing on "moments" like enterprise tools (Otter.ai/Gong.io). All utterances persist to DB/transcript—no discards.

Flow inside `makeOutlineAndRequests(newUtterances)`:

1. Formats recent transcript lines and prepares context:
    - Prior summary signal (selected meaningful items)
    - Previously defined terms and detected questions (to avoid duplication)
    - Transcript window (last N turns; default 30)
2. Builds a system prompt using `getSystemPrompt('meeting_analysis', { context: ... })` plus an optional role prefix from a selected preset.
3. Calls `llmClient.chat(messages)` with a system message and a short user directive.
4. Appends inputs and outputs to `src/analysis.txt` for inspectability.
5. Parses the LLM response with strict, exact-heading rules; extracts:
    - `summary`: up to 5 recent bullets (most-recent-first)
    - `actions`: questions as `❓ ...` and define suggestions as `📘 Define <Term>`
    - `followUps`: default UI actions (email, action items, show summary)
6. Saves the raw text + derived TL;DR and actions JSON into `summaries` (SQLite).
7. Emits `summary-update` to the Listen window with the structured data. If the conversation is long enough, prepends `🗒️ Recap meeting so far`.

### Prompt building and templates

- Files:
    - `src/features/common/prompts/promptBuilder.js`
    - `src/features/common/prompts/promptTemplates.js`
- `getSystemPrompt(profile, context)` chooses the profile from `profilePrompts` and assembles a final system prompt, injecting the provided context block.
- The analysis uses the `meeting_analysis` profile which enforces exact output headings and rules. This is critical for the parser.

`meeting_analysis` enforces:

- Output must include ONLY these sections, in this order:
    1. `### Meeting Insights`
    2. `### Questions Detected`
    3. `### Terms to Define`
- No placeholders (e.g., "No questions detected"). Terms must be short noun phrases present in the transcript.
- Speaker tags: `me:` vs `them:`; prioritize items that help `me`.

#### Preset Customization (Role Injection)

- Presets provide optional role prefixes to personalize the base `meeting_analysis` prompt (e.g., "You are a sales coach focused on objection handling").
- Stored and managed via the preset repository (`src/features/common/repositories/preset/`):
    - `sqlite.repository.js`: Default local storage for presets (CRUD operations like `getPresets()`, `savePreset()`).
    - `firebase.repository.js`: Alternative cloud storage (disabled by default for local-first approach).
    - `index.js`: Adapter factory (`getBaseRepository()`) that selects SQLite.
- Preset format: Raw text or JSON like `{ "kind": "analysis_role", "role": "You are a ... coach." }`.
- Flow:
    1. On session init (`ListenService.initializeNewSession`), load saved preset ID from settings (`settingsService.getSettings().analysisPresetId`, default 'personal').
    2. Call `SummaryService.setAnalysisPreset(presetId)` to fetch via `settingsService.getPresets()` (uses preset repo).
    3. Extract role text (`_extractRoleFromPrompt`), trim to ~100 words (`_trimToWordLimit`), and prefix the system prompt as `<role>[trimmed role]</role>\n\n[base prompt]`.
    4. In every analysis (`makeOutlineAndRequests`), the full prompt (role + base + context) is sent to LLM.
- UI: Presets are editable in Settings; changes apply to new Listen sessions. Mid-session switches via `summaryService.setAnalysisPreset(id)`.
- Extensibility: Add new base profiles in `promptTemplates.js` (e.g., `sales_meeting`); switch with `setAnalysisProfile('sales_meeting')`.

#### Preset-ID Mapping to Analysis Variants

- Presets dynamically select specialized analysis prompts based on their ID (from seeded or user-created).
- Seeded Defaults (from sqliteClient.js):
    - 'personal'/'meetings' → 'meeting_analysis' (standard: Insights, Questions, Terms).
    - 'sales' → 'sales_analysis' (Opportunities, Objections & Needs, Follow-Up Questions, Terms).
    - 'recruiting' → 'recruiting_analysis' (Strengths, Gaps, Suggested Questions, Terms).
    - 'customer-support' → 'support_analysis' (Issue Summary, Root Causes, Troubleshooting Steps, Terms).
    - 'school' → 'school_analysis' (Key Concepts, Unclear Points, Study Questions, Terms).
- Fallback: User-created or unknown IDs use 'meeting_analysis'.
- User-Created: Inject role as raw text (e.g., "You are my custom buddy")—maps to general unless ID matches above. For variants, name ID like 'sales' when creating.
- Parsing: Handles new headings (e.g., 'Root Causes' → ⚠️ actions; unified summary/actions).

This ensures analysis insights adapt to the user's chosen "friend" style, empowering personalized outputs.

### LLM client

- File: `src/features/common/ai/llmClient.js`
- Calls a server endpoint with session auth:
    - `POST /api/llm/chat` with `X-Session-UUID` header
    - Returns `{ content, raw }`
- Errors are surfaced with context; `SummaryService` falls back to the previous result on failure.

### Persistence

Transcripts (SQLite):

- File: `src/features/listen/stt/repositories/sqlite.repository.js`
- Table: `transcripts`
- Fields: `id`, `session_id`, `start_at`, `speaker`, `text`, `created_at`

Summaries (SQLite):

- File: `src/features/listen/summary/repositories/sqlite.repository.js`
- Table: `summaries`
- Upserted by `session_id`
- Fields persisted: `text` (raw LLM), `tldr` (joined bullets), `bullet_json` (unused array placeholder), `action_json` (parsed actions), `model` (currently `server`)

Note: Firebase repository implementations exist but are disabled in favor of the local-first, web-auth strategy.

---

## Detailed sequence

1. Start listening

- `ListenService.initializeSession()` → DB session via `sessionRepository.getOrCreateActive('listen')`
- Connect STT relay (`ws://...`) for both `Me` and `Them`
- On macOS, `startMacOSAudioCapture()` pipes system audio to the relay for `Them`

2. Receive STT events

- Relay sends `PARTIAL` chunks and `TURN_COMPLETE` signals
- Debouncers coalesce text; on completion, `flush*Completion()` emits the final text and calls `onTranscriptionComplete(speaker, finalText)`

3. Persist the utterance

- `ListenService.handleTranscriptionComplete` → `sttRepository.addTranscript({ sessionId, speaker, text })`

4. Add to analysis

- `summaryService.addConversationTurn(speaker, text)` → pushes `me: ...` / `them: ...` into memory
- `triggerAnalysisIfNeeded()` decides whether to analyze now

5. Build prompt and call LLM

- Full context includes: previous meaningful summary bullets, previously defined terms, previously detected questions, and the transcript window
- System prompt: `getSystemPrompt('meeting_analysis', { context })`, optionally prefixed by a role extracted from a selected preset
- Messages sent:
    - system: the full system prompt
    - user: "Analyze the conversation provided in the Transcript context above."

6. Parse and emit results

- Parser requires exact headings. It collects bullets and numbers with minimal heuristics and deduping.
- Emits `summary-update` with `{ summary, actions, followUps }` and advances `lastAnalyzedIndex`.
- Saves DB summary for the current session.

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
    { "role": "system", "content": "<full meeting_analysis prompt with Context>" },
    { "role": "user", "content": "Analyze the conversation provided in the Transcript context above." }
]
```

### Required LLM output (strict headings)

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

### Parsed structure sent to renderer

```json
{
    "summary": ["Key point 2", "Key point 1"],
    "actions": ["❓ What is our upgrade timeline?", "❓ Do we have any blockers?", "📘 Define RSC", "📘 Define Turbopack"],
    "followUps": ["✉️ Draft a follow-up email", "✅ Generate action items", "📝 Show summary"]
}
```

---

## Configuration and extensibility

### Key config knobs (see `src/features/common/config/config.js`)

- `
