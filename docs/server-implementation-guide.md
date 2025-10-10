# WhisperV2 Go Server Implementation Guide

## Overview

This document specifies what needs to be implemented on the Go server side for the LLM API migration. The server should accept the superset payload described in `llm-api-contract.md` while maintaining backward compatibility.

## Decision: Server Approach

**Option 1 (Recommended)**: Server accepts pre-built prompts from client

- ✅ Simpler implementation
- ✅ No duplication of prompt logic
- ✅ Client maintains control over prompt versions
- ✅ Backward compatible with existing clients

**Option 2**: Server owns prompt templates

- ❌ Requires duplicating all 54 prompt templates
- ❌ Requires implementing prompt building logic
- ❌ Synchronization issues between client/server templates

**Decision**: Use **Option 1**. Server accepts `messages` array as-is and executes against LLM provider.

## Required Server Components

### 1. API Endpoints

#### `/api/llm/chat` (POST)

- **Auth**: Validate `X-Session-UUID` header against session store
- **Input**: JSON payload with `messages` (required), `request_id`, `profile`, `attachments` (optional)
- **Processing**:
    - Extract messages array
    - Handle attachments if present (optional - can ignore for now)
    - Call LLM provider (OpenAI-compatible)
- **Response**: JSON with `success`, `content`, `request_id`, `model`, `usage`
- **Error Codes**: `unauthorized`, `quota_exceeded`, `validation_error`, `provider_error`

#### `/api/llm/stream` (POST)

- **Same auth and input as `/api/llm/chat`**
- **Processing**: Same as chat but with streaming response
- **Response**: SSE format with `data:` lines containing OpenAI-style deltas
- **Final message**: Include `usage` summary before `[DONE]`

### 2. Core Services

#### Authentication Service

```go
func ValidateSession(sessionUUID string) (*Session, error)
```

- Validate session UUID exists and is active
- Return session info for quota tracking

#### LLM Service

```go
func ChatCompletion(messages []Message, options ChatOptions) (*ChatResponse, error)
func StreamCompletion(messages []Message, options ChatOptions) (<-chan StreamChunk, error)
```

- Integration with OpenAI API (or compatible provider)
- Handle model selection, temperature, max_tokens
- Parse usage statistics from provider response

#### Quota Service

```go
func CheckQuota(sessionID string) error
func TrackUsage(sessionID string, usage UsageStats) error
```

- Rate limiting per user/session
- Usage tracking (prompt_tokens, completion_tokens)
- Header injection (`x-ratelimit-*`)

### 3. Data Models

#### Request Payload

```go
type LLMRequest struct {
    RequestID   string      `json:"request_id,omitempty"`
    Profile     string      `json:"profile,omitempty"`
    Attachments []Attachment `json:"attachments,omitempty"`
    Messages    []Message    `json:"messages"`
}

type Attachment struct {
    Type       string `json:"type"`        // "image"
    MediaType  string `json:"media_type"`  // "image/jpeg"
    SizeBytes  int    `json:"size_bytes"`
    Source     string `json:"source"`      // "data_url"
    // Future: support binary uploads
}

type Message struct {
    Role    string `json:"role"`    // "system", "user", "assistant"
    Content interface{} `json:"content"` // string or []ContentPart
}

type ContentPart struct {
    Type      string `json:"type"`      // "text", "image_url"
    Text      string `json:"text,omitempty"`
    ImageURL  *ImageURL `json:"image_url,omitempty"`
}
```

#### Response Format

```go
type LLMResponse struct {
    Success   bool   `json:"success"`
    Content   string `json:"content,omitempty"`
    RequestID string `json:"request_id,omitempty"`
    Model     string `json:"model,omitempty"`
    Usage     *Usage `json:"usage,omitempty"`
    ErrorCode string `json:"error_code,omitempty"`
    Message   string `json:"message,omitempty"`
}

type Usage struct {
    PromptTokens     int `json:"prompt_tokens"`
    CompletionTokens int `json:"completion_tokens"`
    TotalTokens      int `json:"total_tokens"`
}
```

### 4. Streaming Implementation

#### SSE Response Format

```
data: {"request_id": "uuid", "choices": [{"delta": {"content": "chunk"}}], "usage": null}

data: {"request_id": "uuid", "choices": [{"delta": {"content": "chunk"}}], "usage": null}

data: {"request_id": "uuid", "usage": {"prompt_tokens": 512, "completion_tokens": 181}}

data: [DONE]
```

#### Go Implementation

```go
func handleStream(w http.ResponseWriter, r *http.Request) {
    w.Header().Set("Content-Type", "text/event-stream")
    w.Header().Set("Cache-Control", "no-cache")
    w.Header().Set("Connection", "keep-alive")

    flusher, ok := w.(http.Flusher)
    if !ok {
        return
    }

    chunks := llmService.StreamCompletion(messages, options)

    for chunk := range chunks {
        if chunk.Error != nil {
            // Handle error
            break
        }

        data := map[string]interface{}{
            "request_id": requestID,
            "choices": []map[string]interface{}{
                {"delta": map[string]string{"content": chunk.Content}},
            },
        }

        if chunk.IsFinal && chunk.Usage != nil {
            data["usage"] = chunk.Usage
        }

        jsonData, _ := json.Marshal(data)
        fmt.Fprintf(w, "data: %s\n\n", jsonData)
        flusher.Flush()
    }

    fmt.Fprint(w, "data: [DONE]\n\n")
    flusher.Flush()
}
```

### 5. Middleware & Infrastructure

#### Auth Middleware

```go
func AuthMiddleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        sessionUUID := r.Header.Get("X-Session-UUID")
        if sessionUUID == "" {
            http.Error(w, "Missing session UUID", 401)
            return
        }

        session, err := authService.ValidateSession(sessionUUID)
        if err != nil {
            http.Error(w, "Invalid session", 401)
            return
        }

        // Add session to request context
        ctx := context.WithValue(r.Context(), "session", session)
        next.ServeHTTP(w, r.WithContext(ctx))
    })
}
```

#### Quota Middleware

```go
func QuotaMiddleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        session := r.Context().Value("session").(*Session)

        if err := quotaService.CheckQuota(session.ID); err != nil {
            w.Header().Set("X-RateLimit-Limit", "1000")
            w.Header().Set("X-RateLimit-Used", "1000")
            w.Header().Set("X-RateLimit-Remaining", "0")
            http.Error(w, "Quota exceeded", 429)
            return
        }

        next.ServeHTTP(w, r)
    })
}
```

### 6. Configuration

#### Environment Variables

```bash
# LLM Provider
OPENAI_API_KEY=sk-...
OPENAI_BASE_URL=https://api.openai.com/v1
DEFAULT_MODEL=gpt-4o-mini

# Database
DATABASE_URL=postgres://...

# Server
PORT=3000
CORS_ORIGINS=http://localhost:3000
```

### 7. Database Schema (Optional - for audit logging)

```sql
-- For request correlation and debugging
CREATE TABLE llm_requests (
    id UUID PRIMARY KEY,
    request_id VARCHAR(36) NOT NULL,
    session_uuid VARCHAR(36) NOT NULL,
    profile VARCHAR(50),
    model VARCHAR(50),
    prompt_tokens INTEGER,
    completion_tokens INTEGER,
    created_at TIMESTAMP DEFAULT NOW(),
    user_id INTEGER REFERENCES users(id)
);

-- Optional: Store request/response for debugging
CREATE TABLE llm_request_logs (
    id UUID PRIMARY KEY,
    request_id VARCHAR(36) NOT NULL,
    request_payload JSONB,
    response_payload JSONB,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);
```

### 8. Testing Requirements

#### Unit Tests

- Auth validation
- Quota checking
- LLM service integration
- Request/response parsing

#### Integration Tests

- Full API request flow
- Streaming responses
- Error scenarios
- Backward compatibility

#### Backward Compatibility Tests

- Existing clients without new fields should work
- Missing optional fields don't break functionality
- Old response format still accepted

## Implementation Priority

1. **Phase 1**: Basic endpoints (`/api/llm/chat`, `/api/llm/stream`) with auth
2. **Phase 2**: Quota system and usage tracking
3. **Phase 3**: New fields support (`request_id`, `profile`, `attachments`)
4. **Phase 4**: Audit logging and monitoring
5. **Phase 5**: Performance optimization and scaling

## Deployment Checklist

- [ ] API endpoints implemented
- [ ] Authentication working
- [ ] LLM provider integration
- [ ] Streaming SSE responses
- [ ] Error handling and codes
- [ ] Quota system
- [ ] Backward compatibility verified
- [ ] Client integration testing
- [ ] Load testing
- [ ] Monitoring and logging

---

**Note**: This guide assumes the server will NOT own prompt templates. If you decide to change this decision, you'll need to duplicate the 54 prompt profiles from `src/features/common/prompts/promptTemplates.js` and implement the prompt building logic from `src/features/common/prompts/promptBuilder.js`.
