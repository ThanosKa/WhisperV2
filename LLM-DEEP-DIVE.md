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
    3. LLM is server-backed; no client model/provider selection.
    4. Optionally capture a screenshot (Assist Me) and build messages: system prompt + user text (+ optional `image_url`).
    5. Call backend stream via `llmClient.stream(messages, { signal })` and process the SSE response with `_processStream`.
    6. On completion, persist assistant response to DB; on multimodal errors, retry with text-only.

Citations:

```403:621:src/features/ask/askService.js
// ... existing code ...
```

## 4. Model Selection & Provider Resolution

- Service: `src/features/common/services/modelStateService.js`
    - STT only on client; LLM selection removed. STT keys from env.
- Factory: `src/features/common/ai/factory.js`
    - STT only on client; no LLM constructors.

Citations:

```300:322:src/features/common/services/modelStateService.js
// ... existing code ...
```

```50:70:src/features/common/ai/factory.js
// ... existing code ...
```

## 5. Provider Implementations

### Gemini (client STT only)

- File: `src/features/common/ai/providers/gemini.js`
    - LLM calls are via `src/features/common/ai/llmClient.js` directly to backend.

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

- Meeting summaries pipeline calls non-stream `llmClient.chat(messages)`.
- Meeting title generation uses non-stream `llmClient.chat(messages)`.

## 10. Files That Touch LLM (single source of truth list)

- `src/preload.js`
- `src/bridge/featureBridge.js`
- `src/features/ask/askService.js`
- `src/features/common/ai/factory.js`
- `src/features/common/ai/providers/gemini.js`
- (removed) `src/features/common/ai/providers/openai.js`
- `src/features/common/services/modelStateService.js`
- `src/ui/ask/AskView.js`
- `src/features/listen/summary/summaryService.js`
- `src/features/listen/listenService.js`
