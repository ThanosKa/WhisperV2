# WhisperV2 LLM API Contract

## Purpose

- Document current Electron client payloads sent to `/api/llm/chat` and `/api/llm/stream`.
- Define the minimal contract the new Go server must implement.
- Note incremental client updates once the server supports the richer contract.

## Current Client Behaviour (Electron)

- Base URL: `API_BASE_URL` env (default `http://localhost:3000`).
- Auth: `X-Session-UUID` header from `authService.sessionUuid`; request rejected if missing.
- JSON payload:
    ```json
    {
        "messages": [
            { "role": "system", "content": "<system prompt string>" },
            {
                "role": "user",
                "content": [
                    { "type": "text", "text": "normalized user prompt" },
                    { "type": "image_url", "image_url": { "url": "data:image/jpeg;base64,<...>" } } // optional
                ]
            }
        ]
    }
    ```
- `/api/llm/chat`: client expects `{ success: true, content: string, ... }`; summary service parses `content` as plain text (JSON encoded by prompt).
- `/api/llm/stream`: Server must reply with SSE; each `data:` line contains OpenAI-style delta:
    ```json
    { "choices": [{ "delta": { "content": "chunk" } }] }
    ```
    Stream ends with `data: [DONE]`.
- No explicit request identifiers, metadata, or model hints are sent today.

## Pain Points

- Go service cannot distinguish request type (Ask vs Summary) without inspecting prompts.
- No request IDs → harder to trace logs per interaction.
- No usage metadata in responses, so quota UI relies solely on headers.
- Attachments are embedded `data:` URLs without size/type metadata.

## Proposed Contract (Server-Side Additions)

The Go server should accept a superset payload while remaining backward compatible.

### Request Fields (POST body)

- `request_id` (string, optional): client-generated UUID; echo in responses/logs. **Not stored permanently** - used only for request correlation during execution.
- `profile` (string, optional): prompt template id that determines behavior and context (`meeting_analysis`, `sales_analysis`, `whisper_question`, `comprehensive_summary`, etc.). The profile name encodes both the preset type and operation.
- `attachments` (array, optional):
    ```json
    [
        {
            "type": "image",
            "media_type": "image/jpeg",
            "size_bytes": 120345,
            "source": "data_url"
        }
    ]
    ```
    Server can choose to ignore if unsupported but should not fail.
- `messages`: unchanged array for compatibility.

### Response (sync `/api/llm/chat`)

```json
{
    "success": true,
    "content": "LLM output string",
    "request_id": "uuid",
    "model": "gpt-4o-mini",
    "usage": { "prompt_tokens": 512, "completion_tokens": 181 }
}
```

- On error: `success: false`, `error_code`, `message` (localized optional).

### Streaming Response (`/api/llm/stream`)

- SSE `data:` payload:
    ```json
    {
        "request_id": "uuid",
        "choices": [{ "delta": { "content": "chunk" } }],
        "usage": null
    }
    ```
- Final message (before `[DONE]`) may include `usage` summary.
- HTTP headers may continue to include quota info (`x-ratelimit-*`).

### Error Codes

| Code               | Meaning                      | Client Action            |
| ------------------ | ---------------------------- | ------------------------ |
| `unauthorized`     | Missing/invalid session uuid | Prompt user to sign in   |
| `quota_exceeded`   | Rate limit breached          | Show quota banner        |
| `validation_error` | Payload malformed            | Log & show generic error |
| `provider_error`   | Upstream model failure       | Allow retry              |

## Migration Guidance

1. **Server first**: Go server implements superset contract; fields it does not recognize should be optional.
2. **Client update**: once live, Electron can start sending new fields and reading metadata.
3. **Logging**: server logs should include `request_id`, `session_uuid`, `profile` for tracing.

## Planned Client Updates (Post-Server Release)

- Generate UUID per call in `llmClient` and include `request_id`.
- Pass `profile` from `askService`/`summaryService` when available.
- When response carries `usage`, broadcast via existing quota event to header window.
- Update stream parser to surface `metadata` (model, finish_reason) if provided.

## Testing Checklist

- Ask flow (stream) with and without screenshot.
- Summary flow (non-stream) across presets (`meeting`, `sales`, `customer-support`).
- Error simulation: missing session uuid, 401/403, quota 429, invalid payload.
- Regression: ensure current clients (without new fields) still succeed.

## Open Questions

- Should Go server own prompt templates or continue accepting fully formatted prompts from client?
- Does Go service need to support tool calls / structured outputs beyond JSON text?
- Should attachment payload move to binary upload instead of data URL for large screenshots?
- **Audit logging**: Should request_ids be stored in audit table for compliance/debugging? (Optional - can add later if needed)

## Client Files to Change

### Core API Client

- **`src/features/common/ai/llmClient.js`** - Add `request_id`, `profile`, `attachments` to payloads; handle new response fields (`usage`, `model`)

### Services (Populate New Fields)

- **`src/features/ask/askService.js`** - Pass `profile` from `_resolveProfileForIntent()` mapping (e.g., `whisper_question`, `sales_next`)
- **`src/features/listen/summary/summaryService.js`** - Pass `profile` from `analysisProfile` field (e.g., `meeting_analysis`, `sales_analysis`)
- **`src/features/listen/listenService.js`** - Pass `profile: 'comprehensive_summary'` for post-session summaries

### Response Handling

- **`src/features/ask/askService.js`** - Update stream parser to handle `request_id` in SSE responses
- **`src/features/common/services/quotaService.js`** - Use `usage` from responses for UI updates

## Client Files to Read (Understanding Flow)

### LLM Integration

- **`src/features/common/ai/llmClient.js`** - How client calls `/api/llm/chat` and `/api/llm/stream`
- **`docs/llm-pipeline.md`** - Overall LLM flow documentation

### Ask Flow

- **`src/features/ask/askService.js`** - How Ask questions work (`sendMessage()` → `llmClient.stream()`)
- **`src/features/ask/askService.js`** - `_resolveProfileForIntent()` - maps user intent to profile names

### Analysis Flow

- **`src/features/listen/summary/summaryService.js`** - Real-time analysis (`makeOutlineAndRequests()` → `llmClient.chat()`)
- **`src/features/listen/summary/summaryService.js`** - `setAnalysisPreset()` - how presets map to profiles

### Post-Session Processing

- **`src/features/listen/listenService.js`** - Title generation and comprehensive summaries

### Prompts & Templates

- **`src/features/common/prompts/promptBuilder.js`** - How `getSystemPrompt(profile)` builds prompts
- **`src/features/common/prompts/promptTemplates.js`** - All available profile templates

## Client Rollout Steps Once Go Server Ships

1. Update `llmClient` to include `request_id`, `profile`.
2. Extend `askService` and `summaryService` to populate the new fields.
3. Handle `usage`, `model`, `request_id` in responses; broadcast usage to UI.
4. Add telemetry/logging for mismatched schema or missing metadata to catch integration issues early.
