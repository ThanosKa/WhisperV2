# LLM Pipeline in WhisperV2

## Overview

The LLM integration in WhisperV2 is server-backed, using `llmClient` to call `/api/llm/chat` (non-stream) and `/api/llm/stream` (SSE streaming) with `X-Session-UUID` auth. No client-side providers/models for LLM (Gemini used only for STT). Supports text + optional multimodal (screenshots in Ask). Usages: Real-time Q&A in Ask feature; batched analysis in Listen summaries. Auth via webapp session; errors fallback to priors or retries.

Key goals: Streaming responses for Ask UI, structured outputs for analysis, session-persisted history.

## High-Level Flow

1. **Trigger**: UI events (Ask button, Enter in AskView, summary actions) → IPC (`ask:sendQuestionFromAsk`, etc.) to main.
2. **Orchestration**: Services build messages (system prompt + user text/history; optional image base64); call `llmClient.stream/chat`.
3. **Server Call**: POST to backend with JSON `{messages}`; auth header from `authService.sessionUuid`.
4. **Response Handling**:
    - Streaming (Ask): Parse SSE `data:` lines for `choices[0].delta.content`; append to UI state, emit `ask:stateUpdate`.
    - Non-streaming (Analysis): Await full `{content, raw}`; parse/log.
5. **Persistence**: Save user/assistant messages to DB (`askRepository` or `summaryRepository`); update UI (AskView, SummaryView).
6. **Interrupt/End**: Abort via `AbortController`; on done, persist response, reset state.

## Components

### LLM Client (`common/ai/llmClient.js`)

- `chat(messages)`: Non-stream POST `/api/llm/chat` → `{content, raw}`.
- `stream(messages, {signal})`: SSE POST `/api/llm/stream` → Response for line-by-line parsing.
- Auth: Throws if no `sessionUuid`; adds `X-Session-UUID` header.
- Base URL: From `getBaseUrl()` (env `pickleglass_WEB_URL` or localhost:3000).

### Ask Service (`features/ask/askService.js`)

- Handles Q&A: `sendMessage(userPrompt, history, presetId)` normalizes prompt, builds messages (system from `_expandInsightRequest` for modes like 'define'/'email'), optional screenshot (`captureScreenshot` → base64 JPEG).
- Messages: `[{role: 'system', content: prompt}, {role: 'user', content: [{type: 'text', text}, optional {type: 'image_url', image_url: {url: 'data:image/jpeg;base64,...'}}]}]`.
- Streaming: `_processStream` parses deltas, aborts on interrupt, persists via `askRepository`.
- State: `{isLoading, isStreaming, currentQuestion, currentResponse}` → emit `ask:stateUpdate`.
- Multimodal fallback: Retry text-only on image errors.

### Summary Service (`features/listen/summary/summaryService.js`)

- Batched analysis: `makeOutlineAndRequests` builds context (history slice, priors, dedup), system prompt from profile/preset (e.g., 'meeting_analysis').
- Messages: System (role + template + context), user ("Analyze ONLY..."); non-stream `chat`.
- Parse: `parseResponseText` (JSON preferred, fallback headings) → `{summary, actions}` (emoji-mapped, deduped); save to `summaries`.
- Presets: Map to profiles (e.g., 'sales' → sections like Objections); role prefixed.

### UI (AskView.js, SummaryView.js)

- Ask: Subscribes to state updates; renders chat bubbles, handles input/Enter; throttles typing animation.
- Summary: Displays parsed insights/actions; triggers Ask from actions.

### IPC Bridge (`bridge/featureBridge.js`)

- Handles: `ask:sendQuestionFromAsk` (with history from listenService), `ask:toggleAskButton`, `ask:interruptStream`.
- Emits: `ask:stateUpdate`, `ask-response-stream-error`.

## Protocol (Client-Server)

- **Endpoint**: `/api/llm/chat` (sync), `/api/llm/stream` (SSE).
- **Request**: JSON `{messages: [{role, content}]}`; `Content-Type: application/json`, `X-Session-UUID`.
- **Response (Sync)**: JSON `{content: string, raw: full}`.
- **Response (Stream)**: SSE lines `data: {"choices":[{"delta":{"content":"chunk"}}]}` or `data: [DONE]`.
- Auth: Session UUID from webapp login (`authService`); blocks without.

Server (backend_node): Processes via providers (e.g., OpenAI/Gemini), enforces quota/rate limits.

## Auth & Config

- **Auth**: `authService.sessionUuid` from webapp sign-in (deep link callback); persists in electron-store. Required for all calls.
- **Env/Config**: `pickleglass_WEB_URL` (base for API); no client LLM keys (server-handled).
- **Error Handling**: 4xx/5xx → throw/log; stream aborts on signal; analysis falls back to prev result.
- **Multimodal**: Image as base64 in `image_url`; server supports (e.g., GPT-4V).

## Files

- Core: `llmClient.js`, `askService.js`, `summaryService.js`.
- Bridge/IPC: `featureBridge.js`.
- UI: `AskView.js` (Ask), `SummaryView.js` (analysis).
- Auth: `authService.js`.
- Prompts: `promptBuilder.js`, `promptTemplates.js` (for system messages).

For STT (Gemini client-side), see `stt-pipeline.md`. Server details in backend docs.
