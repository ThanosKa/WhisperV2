# LLM End-to-End Flow

## 1. User Trigger

- Files: `src/ui/app/MainHeader.js`, `src/ui/ask/AskView.js`
- What happens when the user opens Ask or submits a question.
    - Ask button (header) toggles the Ask window: `window.api.mainHeader.sendAskButtonClick()` → IPC `ask:toggleAskButton`.
    - In Ask window, typing Enter triggers `window.api.askView.sendMessage(text)` → IPC `ask:sendQuestionFromAsk`.
    - From Summary view, Ask can be triggered with context: `window.api.summaryView.sendQuestionFromSummary(text)` → IPC `ask:sendQuestionFromSummary`.

## 2. Renderer → Main IPC (Ask)

| Channel                       | Payload Shape | Purpose                                            |
| ----------------------------- | ------------- | -------------------------------------------------- |
| `ask:sendQuestionFromAsk`     | `string`      | Send user prompt from Ask window                   |
| `ask:sendQuestionFromSummary` | `string`      | Send question from Summary view with convo context |
| `ask:toggleAskButton`         | none          | Show/hide Ask window; optionally start Assist Me   |
| `ask:closeAskWindow`          | none          | Close Ask window                                   |
| `ask:interruptStream`         | none          | Abort in-flight LLM stream                         |

Main → Renderer (events):

- `ask:stateUpdate` → Ask view state ({ isLoading, isStreaming, currentQuestion, currentResponse, interrupted, showTextInput })
- `ask-response-stream-error` → Streaming error payload `{ error }`

References:

- Preload: `src/preload.js:103–123`
- Bridge: `src/bridge/featureBridge.js:56–84`
- Ask UI: `src/ui/ask/AskView.js`

## 3. Main-Process Orchestration (Ask Service)

- Entry file: `src/features/ask/askService.js`
- Key methods:
    - `toggleAskButton()` shows/hides Ask window; may invoke `sendMessage('Assist me', conversationHistory)` for screen-only prompt.
    - `sendMessage(userPrompt, conversationHistoryRaw)` orchestrates an LLM streaming request with optional screenshot.
    - `interruptStream()` aborts via `AbortController`.
    - `_processStream(reader, askWin, sessionId, signal)` parses SSE lines and updates UI state.
- High-level flow in `sendMessage`:
    1. Normalize prompt, ensure Ask window visible, set state to loading.
    2. Decide session context: reuse current meeting session (`listen`) or create `ask` session; persist the user message to DB.
    3. Resolve current LLM model via `modelStateService.getCurrentModelInfo('llm')` → `{ provider, model, apiKey }`.
        - Defaults to Gemini server-backed when not selected.
    4. Optionally capture a screenshot (Assist Me) and build messages: system prompt + user text (+ optional `image_url`).
    5. Create provider stream: `createStreamingLLM(provider, { apiKey, model, temperature, maxTokens })`.
    6. Call `streamChat(messages, { signal })` and process the SSE response with `_processStream`.
    7. On completion, persist assistant response to DB; on multimodal errors, retry with text-only.

Citations:

```403:621:src/features/ask/askService.js
// ... existing code ...
```

## 4. Model Selection & Provider Resolution

- Service: `src/features/common/services/modelStateService.js`
    - Loads keys from `.env` on init; stores placeholders in DB (`loaded_from_env`).
    - `getAvailableModels('llm')` returns models available by provider: Gemini always available (server-backed); OpenAI requires `OPENAI_API_KEY`.
    - `getSelectedModels()` and `setSelectedModel(type, modelId)` track user selection and active provider.
    - `getCurrentModelInfo('llm')` returns `{ provider, model, apiKey }`; apiKey is null for Gemini LLM (server-backed), key for OpenAI.
- Factory: `src/features/common/ai/factory.js`
    - `createLLM(provider, opts)` and `createStreamingLLM(provider, opts)` delegate to provider module.
    - Model id sanitized via `sanitizeModelId()`.

Citations:

```300:322:src/features/common/services/modelStateService.js
// ... existing code ...
```

```50:70:src/features/common/ai/factory.js
// ... existing code ...
```

## 5. Provider Implementations

### OpenAI (non-stream and stream)

- File: `src/features/common/ai/providers/openai.js`
- Non-stream: `createLLM` uses OpenAI SDK `chat.completions.create({ model, messages, temperature, max_tokens })` and returns `{ content, raw }`.
- Stream: `createStreamingLLM` requests streaming completions and exposes a `ReadableStream` of SSE lines: `data: { choices[0].delta.content }`, ending with `data: [DONE]`.

### Gemini (server-backed non-stream and stream)

- File: `src/features/common/ai/providers/gemini.js`
- Non-stream: `createLLM` posts to local webapp API `POST ${API_BASE_URL}/api/llm/chat` with headers including `X-Session-UUID` from `authService`.
    - Body: `{ messages, temperature, maxTokens }`. Response expected `{ success, content, usageMetadata }`.
- Stream: `createStreamingLLM` posts to `POST ${API_BASE_URL}/api/llm/stream` and returns an SSE `Response`.
    - Provider forwards server JSON lines as-is: `data: {"choices":[{"delta":{"content":"..."}}]}`; emits `data: [DONE]` at end.
    - If server ever sends raw text, it adapts into the unified JSON shape.

Citations:

```70:145:src/features/common/ai/providers/gemini.js
// ... existing code ...
```

```153:286:src/features/common/ai/providers/gemini.js
// ... existing code ...
```

## 6. Messages We Build and Send

- Built in AskService:
    - `system` content from `getSystemPrompt(profileToUse, context, ...)`.
    - `user` content array: at least one `{ type: 'text', text }`, optional `{ type: 'image_url', image_url: { url: 'data:image/jpeg;base64,...' } }` when Assist Me screenshot present.
- Provider expectations:
    - OpenAI accepts `image_url` as-is.
    - Gemini server receives messages via Whisper app and returns unified JSON streaming structure; client keeps messages as-passed.

Citations:

```468:489:src/features/ask/askService.js
// ... existing code ...
```

## 7. Streaming → Renderer State Updates

- The stream reader `_processStream` parses each `data:` line:
    - If `[DONE]`: stop.
    - Else parse JSON and append `choices[0].delta.content` to `currentResponse`.
    - Broadcast `ask:stateUpdate` with updated `currentResponse` and flags.
- AskView subscribes to `window.api.askView.onAskStateUpdate` and updates its UI accordingly.

Citations:

```632:713:src/features/ask/askService.js
// ... existing code ...
```

```93:169:src/ui/ask/AskView.js
// ... existing code ...
```

## 8. Authentication & Authorization to Web App

- `Gemini` provider calls require `X-Session-UUID` header; obtained from `authService.getCurrentUser().sessionUuid`.
- Session is created via web app sign-in and persisted in `electron-store`.

Citations:

```90:110:src/features/common/ai/providers/gemini.js
// ... existing code ...
```

```150:173:src/features/common/services/authService.js
// ... existing code ...
```

## 9. Non-Streaming LLM Usages

- Meeting summaries pipeline calls non-stream `llm.chat(messages)`.
    - `src/features/listen/summary/summaryService.js` (LLM selection via `modelStateService.getCurrentModelInfo('llm')`).
- Meeting title generation uses non-stream `llm.chat(messages)`.
    - `src/features/listen/listenService.js:332–342`.

## 10. Files That Touch LLM (single source of truth list)

- `src/preload.js`
- `src/bridge/featureBridge.js`
- `src/features/ask/askService.js`
- `src/features/common/ai/factory.js`
- `src/features/common/ai/providers/gemini.js`
- `src/features/common/ai/providers/openai.js`
- `src/features/common/services/modelStateService.js`
- `src/ui/ask/AskView.js`
- `src/features/listen/summary/summaryService.js`
- `src/features/listen/listenService.js`
