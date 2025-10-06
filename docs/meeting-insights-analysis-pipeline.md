# Analysis Pipeline: STT Transcript to Meeting Insights

## Overview

This pipeline processes finalized STT utterances into structured insights (summary, actions like questions/terms), using batched LLM calls. It maintains session state (history, dedup sets), customizes via presets/profiles, and persists to SQLite. Outputs feed UI (`summary-update`) for real-time display. Focus: Post-STT; see `stt-pipeline.md` for transcription.

## High-Level Flow

1. **Utterance Finalized**: `listenService` filters/saves transcript (>3 chars), forwards to `summaryService.addConversationTurn(speaker, text)`.
2. **Batching**: Accumulate in `conversationHistory` (last ~30); trigger analysis if batch meets gates (3-5 utts, >=80 chars/12 tokens, max 6 or 120s).
3. **Prompt Build**: Combine profile template (e.g., 'meeting_analysis') with context (priors, dedup terms/questions, recent transcript); prefix role from preset.
4. **LLM Call**: `llmClient.chat` to server `/api/llm/chat` (system: prompt+context; user: "Analyze ONLY..."); logs to `analysis.txt`.
5. **Parse & Structure**: Extract JSON or headings; map to `summary` (bullets), `actions` (emoji-prefixed: ❓ questions, 📘 defines, etc.); dedup, limit 10.
6. **Persist & Emit**: Save raw/tldr/actions to `summaries` table; emit `summary-update {summary, actions, followUps}` (add recap if >15 utts).
7. **Session End**: Generate LLM title; prune history.

## Components

### SummaryService (`summary/summaryService.js`)

- State: `conversationHistory`, `definedTerms`/`detectedQuestions` (dedup Sets), `previousAnalysisResult`, `analysisProfile` ('meeting_analysis' default), `selectedPresetId`.
- `addConversationTurn`: Normalize (e.g., "me: text"), skip <5 chars; advance index, call `triggerAnalysisIfNeeded`.
- Trigger: Smart batching (`config.smartTrigger`); fallback every 5 utts.
- `makeOutlineAndRequests`: Build context/prompt, call LLM, parse (`parseResponseText`), structure, save/emit.
- Mock: Simulates history, runs single real analysis (`mockAnalysisData.js`).

### Prompts & Presets (`prompts/promptBuilder.js`, `promptTemplates.js`)

- `getSystemPrompt(profile, context)`: Base + format rules + injected context (priors + transcript).
- Enforces: Sections like `### Meeting Insights` (bullets), `### Questions Detected` (numbered), `### Terms to Define` (nouns); no placeholders.
- Presets: SQLite (`presetRepository`); seeded (sales, recruiting, etc.); map to profiles (e.g., 'sales' → 'sales_analysis' with sections like Objections).
- Role: Trimmed ~100 words from preset prompt, prefixed as `<role>...</role>`.

### LLM Client (`ai/llmClient.js`)

- POST `/api/llm/chat` with `X-Session-UUID`; streams if supported.
- Fallback: Reuse `previousAnalysisResult` on error.

### Parsing (`parseResponseText`)

- JSON first (```json {sections: [{type: "insights", items: [...] }]}`); fallback headings (exact `### Questions Detected` → ❓ actions).
- Emoji map: Questions → ❓, Defines → 📘, Gaps → ⚠️, etc.; plain bullets to `summary`.
- Heuristics: `_extractDefineCandidates` for nouns/acronyms.
- Dedup: Case-insensitive against Sets; follow-ups: Fixed ["✉️ Draft email", ...] + recap if long.

### Persistence (`summary/repositories/sqlite.repository.js`)

- `summaries` table: Upsert by `session_id`; fields: `generated_at`, `model: 'server'`, `text` (raw), `tldr` (joined summary), `action_json` (array).
- Touches `sessions` table.

## Config (`config.js`)

- `analysisStep: 5` (fallback trigger), `smartTrigger: {enabled: true, minCharCount:80, minTokenCount:12, maxWaitUtterances:6}`.
- `recapStep:15` (long-session recap).

## Extensibility

- Add profiles in `promptTemplates.js` (e.g., 'legal_analysis').
- Presets: CRUD via UI/settings; switch mid-session.
- JSON output preferred for robustness.

For full STT, see `stt-pipeline.md`.
