# LLM Pipeline

This document explains how the LLM pipeline works across the Electron app: model configuration/selection, provider abstraction, streaming behavior, and how messages are built, sent, and processed in the UI.

## Summary

- Models and keys come from `process.env` and ModelState manages selection and availability.
- Providers (OpenAI, Gemini) are wired via a factory; both non‑stream and streaming interfaces are supported.
- AskService builds multimodal prompts (text + optional screenshot), starts a streaming chat, and incrementally updates UI while persisting results.
- Streaming uses SSE lines where each token arrives under `choices[0].delta.content` and ends with `[DONE]`.

## Key Files

- Factory and provider map: `src/features/common/ai/factory.js:1`
- Provider implementations:
  - OpenAI: `src/features/common/ai/providers/openai.js:1`
  - Gemini: `src/features/common/ai/providers/gemini.js:1`
- Ask orchestrator (streaming): `src/features/ask/askService.js:380`
- Meeting summary (non‑stream): `src/features/listen/summary/summaryService.js:1`
- Model state and selection: `src/features/common/services/modelStateService.js:1`

## Model State & Config

- Loads keys from env on init for OpenAI (and STT as applicable). Gemini LLM uses server; no local key.
  - `src/features/common/services/modelStateService.js:18` `initialize()` → sets OpenAI key if present
  - Keys are not stored; DB stores placeholder `loaded_from_env`.
- Availability and selection:
  - `getAvailableModels(type)` filters models by env key presence: `src/features/common/services/modelStateService.js:274`
  - `setSelectedModel(type, modelId)` persists selection and active provider: `src/features/common/services/modelStateService.js:248`
  - `getSelectedModels()` returns `{ llm, stt }`: `src/features/common/services/modelStateService.js:240`
  - `areProvidersConfigured()` checks env keys + provider model lists: `src/features/common/services/modelStateService.js:312`
- Resolve current model for runtime calls:
  - `getCurrentModelInfo('llm'|'stt')` → `{ provider, model, apiKey }` with key from env: `src/features/common/services/modelStateService.js:289`
- Provider config payload for UI:
  - `getProviderConfig()` exposes static provider metadata: `src/features/common/services/modelStateService.js:329`

## Provider Factory

- Providers map and model lists:
  - `PROVIDERS`: `src/features/common/ai/factory.js:16`
- Constructors:
  - `createLLM(provider, opts)` → non‑stream LLM: `src/features/common/ai/factory.js:32`
  - `createStreamingLLM(provider, opts)` → streaming LLM: `src/features/common/ai/factory.js:42`
  - `sanitizeModelId()` trims internal suffixes: `src/features/common/ai/factory.js:24`
- Class discovery for key validation:
  - `getProviderClass(providerId)` returns `OpenAIProvider|GeminiProvider`: `src/features/common/ai/factory.js:52`

## Provider Implementations

### OpenAI

- Non‑stream: `createLLM` wraps `openai.chat.completions.create`
  - File: `src/features/common/ai/providers/openai.js:64`
  - Input messages shape: standard OpenAI chat messages
  - Returns `{ content, raw }`
- Stream: `createStreamingLLM` uses HTTP SSE from `POST https://api.openai.com/v1/chat/completions`
  - File: `src/features/common/ai/providers/openai.js:112`
  - Headers: `Authorization: Bearer <key>`, `Content-Type: application/json`
  - Body includes: `{ model, messages, temperature, max_tokens, stream: true }`
  - Response: `ReadableStream` with lines like:
    - `data: {"choices":[{"delta":{"content":"..."}}]}` and final `data: [DONE]`

### Gemini

- Non‑stream: calls WhisperApp LLM API
  - File: `src/features/common/ai/providers/gemini.js:1`
  - Endpoint: `POST ${API_BASE_URL}/api/llm/chat`
  - Headers: `Content-Type: application/json`, `X-Session-UUID: <uuid>`
  - Body: `{ messages, model, temperature, maxTokens }`
  - Returns `{ content, raw }` from server response
- Stream: calls WhisperApp LLM API (SSE)
  - File: `src/features/common/ai/providers/gemini.js:1`
  - Endpoint: `POST ${API_BASE_URL}/api/llm/stream`
  - Headers: `Content-Type: application/json`, `X-Session-UUID: <uuid>`
  - Provider adapts plain `data: <text>` SSE to unified JSON SSE lines:
    - Emits `data: {"choices":[{"delta":{"content":"..."}}]}` and final `data: [DONE]`
  - Notes: images in messages are ignored (text-only to server); AskService still has a text-only retry path on multimodal errors.

## Ask Pipeline (Streaming)

1) Session handling and persistence
- Create/choose session depending on meeting context: `src/features/ask/askService.js:384`
- Persist user prompt right away: `askRepository.addAiMessage({ role: 'user', ... })`

2) Resolve model and provider
- `modelInfo = await modelStateService.getCurrentModelInfo('llm')` → `{ provider, model, apiKey }`: `src/features/ask/askService.js:405`

3) Build messages
- System prompt: `getSystemPrompt(profile, context, ...)`: `src/features/ask/askService.js:459`
- User content: text part plus optional screenshot as `image_url` (OpenAI shape): `src/features/ask/askService.js:473`
- Messages example:
  ```js
  [
    { role: 'system', content: '<system prompt>' },
    { role: 'user', content: [ { type: 'text', text: '<task>' }, { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,...' } } ] }
  ]
  ```
  Gemini adapter converts `image_url` to `{ inlineData: { mimeType, data } }` internally.

4) Start streaming
- Create provider stream: `createStreamingLLM(modelInfo.provider, { apiKey, model, temperature, maxTokens })`
- Begin stream: `streamingLLM.streamChat(messages, { signal })`: `src/features/ask/askService.js:532`

5) Read SSE tokens and update UI
- Reader loop parses lines; for `data: { choices[0].delta.content }` it appends tokens to `currentResponse`
- End detected by `data: [DONE]`
- File: `src/features/ask/askService.js:600`

6) Persist assistant response
- After stream, save `assistant` message to DB: `src/features/ask/askService.js:695`

7) Fallback on multimodal errors
- If screenshot was included and provider rejects multimodal, retry with text‑only: `src/features/ask/askService.js:558`

8) Interrupt/cancel
- `interruptStream()` aborts with `AbortController` and cancels the stream reader: `src/features/ask/askService.js:517`

## Non‑Streaming LLM Usage

- Meeting summaries: `src/features/listen/summary/summaryService.js:192`
  - `const llm = createLLM(provider, { apiKey, model, ... })`
  - `await llm.chat(messages)` to get single response for summaries
- Lightweight title generation in Listen: `src/features/listen/listenService.js:342`
  - Builds brief messages and calls `llm.chat(messages)`

## What We Send/Receive

- OpenAI stream request
  - POST `https://api.openai.com/v1/chat/completions`
  - Headers: `Authorization: Bearer <key>`, `Content-Type: application/json`
  - Body: `{ model, messages, temperature, max_tokens, stream: true }`
  - Receive: SSE `data:` lines with JSON chunks where `choices[0].delta.content` is the token; end with `data: [DONE]`

- Gemini stream request (via WhisperApp)
  - POST `${API_BASE_URL}/api/llm/stream`
  - Headers: `Content-Type: application/json`, `X-Session-UUID: <uuid>`
  - Body: `{ messages, model, temperature }`
  - Server emits SSE `data: <text>` lines; provider converts each to JSON SSE `choices[0].delta.content` and appends final `data: [DONE]`

## Configuration Notes

- Keys must be set in the environment; the app never stores real keys in SQLite.
- `API_BASE_URL` must be set to the WhisperApp server base (e.g., `http://localhost:3000`).
- LLM calls to Gemini require session identity; provider attaches `X-Session-UUID` from `authService`.
- `getAvailableModels(type)` returns Gemini LLM models unconditionally (server-backed), OpenAI models only if a key is present. STT still requires keys.
- `sanitizeModelId()` strips internal suffix `-glass` if present before calling providers.

## Troubleshooting

- Check logs:
  - Ask flow: `[AskService]` (creation, streaming, fallback, DB saves)
  - Provider calls: `[OpenAIProvider]`, `[Gemini Provider]`
  - Model state: `[ModelStateService]` (key validation, selection)
- Verify selection via `model:get-selected-models` and provider config via `model:get-provider-config` IPC
- STT features require provider keys; LLM via Gemini uses the server and needs no local key
- If streaming stalls, confirm SSE loop is receiving `data:` lines and not blocked by proxy/firewall

---

This pipeline abstracts providers behind a consistent streaming interface, while ModelState centralizes model/key selection and AskService orchestrates prompt building, streaming, UI updates, and persistence.
