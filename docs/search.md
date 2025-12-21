# Whisper Web Search - Client-Side Integration Guide

This guide explains how to integrate the **native function calling** web search features into the Whisper app frontend.

## Architecture Overview

Whisper now uses **OpenAI-compatible function calling** with Tavily Search API:

- ✅ Model autonomously decides when to search (no preprocessing)
- ✅ Model-agnostic behavior (Claude generates natural ACK, GPT might skip)
- ✅ Single LLM call for simple queries (no wasted calls)
- ✅ Streaming search status events for real-time UI updates

## 1. Handling Suggested Searches (Analysis Phase)

The analysis profiles (Meeting, Sales, Recruiting, etc.) now return a new section called `searches`.

### JSON Structure

```json
{
  "sections": [
    ...
    {
      "type": "searches",
      "title": "Suggested Searches",
      "items": [
        "- SEARCH: [Button Label] | [Actual Query]"
      ]
    }
  ]
}
```

### Implementation Steps

1. **Parser Update**: Update your JSON parser to handle the `searches` section type.
2. **UI Component**: Create a `SuggestedSearchButton` component.
    - Parse the item string: `const [label, query] = item.replace("- SEARCH: ", "").split(" | ");`
    - Render as a clickable action button (similar to "Define Term").
    - On click: Trigger the `meeting_search` (or appropriate domain) profile via `/api/llm/stream`.

---

## 2. Executing Search (Streaming Phase)

When a user clicks a suggested search or asks a question, the request is sent to `/api/llm/stream`. The **model autonomously decides** whether to search.

### Request Payload

```json
{
    "profile": "whisper", // All profiles support function calling (whisper, meeting_search, sales_search, etc.)
    "userContent": "What is Apple's stock price right now?", // Simple string query
    "context": {
        "transcript": "..."
    }
}
```

**Key Changes:**

- ❌ No `forceSearch` parameter - model decides autonomously
- ❌ No structured `{ query, reason, context }` - just a simple string
- ✅ Model uses its training to determine if search is needed

### SSE Event Flow

The server emits different events during the search process:

#### 1. Optional Model Acknowledgment (Model-Dependent)

Some models (e.g., Claude) naturally generate acknowledgment text:

```
data: {"choices":[{"delta":{"content":"Let me check the latest on that..."}}]}
```

**Frontend Tip:** GPT models might skip this and go straight to tool call. Don't rely on it!

#### 2. Searching Status (Always Emitted)

When the model decides to search, you'll receive:

```
data: {"status":"searching"}
```

#### 3. Search Query Details (For UI Display)

Immediately after, you'll get the actual search query:

```
data: {"status":"searching","query":"Apple AAPL stock price December 2025"}
```

**Frontend Implementation:**

```typescript
if (chunk.status === 'searching') {
    if (chunk.query) {
        setSearchQuery(chunk.query); // Show in UI: "Searching for: ..."
    }
    setIsSearching(true); // Show loading spinner/globe animation
}
```

#### 4. Search Results (Synthesized by LLM)

After the searching phase, the LLM streams synthesized results in **clean natural language**.

**Key Change:** The model is now instructed **NOT** to include inline markers like `[1]` or `[2]`.

```
data: {"choices":[{"delta":{"content":"Apple (AAPL) is currently trading at $178.42..."}}]}
```

### Streaming Citations

The `/api/llm/stream` route sends a final data chunk containing the structured citations just before the `[DONE]` message.

**Example SSE Chunk:**

```json
data: {"citations":[{"url":"https://...","title":"...","snippet":"..."}]}
```

**Note:** `startIndex` and `endIndex` have been removed as the LLM no longer uses inline markers.

### UI Implementation

1. **Source Cards**: Create a `SourceCard` component to display the URL and Title.
2. **State Management**:
    - Add a `citations` array to your stream state.
    - When a chunk with the `citations` key arrives, update the state.
3. **Display**: Render the `SourceCard` components in a dedicated "Sources" or "References" section at the bottom of the AI response.

---

## 3. Sequential & Parallel Searching

Whisper now supports **Agentic Reasoning** (ReAct loop). This means for complex queries, the model may:

1. Trigger **multiple parallel searches** at once.
2. Receive results, analyze them, and decide to trigger **another search** (sequential) to fill in gaps.

### Frontend Handling

Your UI should remain in the "Searching" state as long as `{ "status": "searching" }` events are arriving.

- The model might stream some "thought" text, then search again.
- Always show the latest `query` provided in the searching status.

---

## 4. Language Support

The system is now fully optimized for multi-language support (English, Greek, Spanish, etc.).

- **Detection**: The backend automatically detects the transcription language.
- **Matching**: Suggested search labels and queries will match the transcription language.
- **Search Results**: The LLM will respond in the same language as the search query.

---

## 4. Model-Specific Behavior

The implementation respects each model's natural behavior:

### Claude Models (Anthropic)

- Typically generates natural acknowledgment: "Let me check the latest information..."
- Then calls `web_search` tool
- User sees: **ACK text** → **searching status** → **results**

### GPT Models (OpenAI)

- May skip acknowledgment and call tool directly
- User sees: **searching status** → **results**

### Generic OpenRouter Models

- Behavior varies by model
- Always emits `{ status: "searching" }` for UI

**Frontend Design Tip:**
Your UI should **always** show a loading indicator when `{ status: "searching" }` arrives, regardless of whether there was acknowledgment text before it.

---

## 5. Testing the Integration

To verify the search is working:

1. **Simple Query Test** (No Search):

    ```
    User: "Hello, how are you?"
    Expected: Instant response, NO searching status
    ```

2. **Real-Time Query Test** (With Search):

    ```
    User: "What's Apple's stock price right now?"
    Expected:
    - Optional ACK (model-dependent)
    - { status: "searching" }
    - { status: "searching", query: "..." }
    - Synthesized results with [1], [2] citations
    - Citations metadata
    ```

3. **Verify Citations**:
    - Check that citation numbers [1], [2], [3] appear in the response
    - Verify the `citations` array arrives before `[DONE]`
    - Test that clicking citation links works

---

## 6. Error Handling

### Graceful Fallback

If Tavily search fails, the LLM will answer using existing knowledge:

```
User: "What's the weather in Tokyo?"
→ [Search fails silently]
→ LLM responds: "I don't have access to real-time weather data..."
```

**Frontend:** No error UI needed - the response will be natural.

### Complete Failure

Only if even the fallback LLM call fails:

```
data: {"choices":[{"delta":{"content":"I apologize, but I'm having technical difficulties. Please try again."}}]}
```

---

## 7. Complete SSE Event Sequence

### Example: Search Query Flow

```bash
# User asks: "What is Italy's budget for 2025?"

# 1. Optional acknowledgment (model-dependent - Claude does this, GPT might skip)
data: {"choices":[{"delta":{"content":"Let me check the latest information..."}}]}

# 2. Searching status (always emitted)
data: {"status":"searching"}

# 3. Query details (for UI display)
data: {"status":"searching","query":"Italy budget 2025 latest news December 21 2025"}

# 4-6. Synthesized results streaming
data: {"choices":[{"delta":{"content":"Italy's"}}]}
data: {"choices":[{"delta":{"content":" 2025"}}]}
data: {"choices":[{"delta":{"content":" budget includes [1]..."}}]}

# 7. Citations metadata
data: {"citations":[{"url":"https://...","title":"Reuters","snippet":"...","startIndex":0,"endIndex":0}]}

# 8. Stream complete
data: [DONE]
```

### Example: Simple Query Flow (No Search)

```bash
# User says: "Hello, how are you?"

# 1. Direct streaming (no search)
data: {"choices":[{"delta":{"content":"Hello!"}}]}
data: {"choices":[{"delta":{"content":" I'm"}}]}
data: {"choices":[{"delta":{"content":" doing"}}]}
data: {"choices":[{"delta":{"content":" well..."}}]}

# 2. Stream complete
data: [DONE]
```

**Key Difference:** No `{ status: "searching" }` event for simple queries!

---

## 8. Frontend Implementation Example

### TypeScript Stream Handler

```typescript
interface StreamState {
    content: string;
    isSearching: boolean;
    searchQuery?: string;
    citations: Citation[];
}

async function handleLLMStream(userMessage: string) {
    const state: StreamState = {
        content: '',
        isSearching: false,
        citations: [],
    };

    const response = await fetch('/api/llm/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            profile: 'whisper',
            userContent: userMessage,
            context: { transcript: 'No audio.' },
        }),
    });

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6);

            if (data === '[DONE]') {
                state.isSearching = false;
                updateUI(state);
                return;
            }

            try {
                const parsed = JSON.parse(data);

                // Handle search status
                if (parsed.status === 'searching') {
                    state.isSearching = true;
                    if (parsed.query) {
                        state.searchQuery = parsed.query;
                    }
                    updateUI(state); // Show spinner/globe
                }

                // Handle content delta
                if (parsed.choices?.[0]?.delta?.content) {
                    state.content += parsed.choices[0].delta.content;
                    updateUI(state); // Stream text
                }

                // Handle citations
                if (parsed.citations) {
                    state.citations = parsed.citations;
                    state.isSearching = false;
                    updateUI(state); // Show citation cards
                }
            } catch {
                // Skip invalid JSON
            }
        }
    }
}

function updateUI(state: StreamState) {
    // Update your React/Vue/Svelte state here
    console.log('Content:', state.content);
    console.log('Is Searching:', state.isSearching);
    console.log('Search Query:', state.searchQuery);
    console.log('Citations:', state.citations);
}
```

### React Component Example

```tsx
function ChatMessage() {
    const [content, setContent] = useState('');
    const [isSearching, setIsSearching] = useState(false);
    const [searchQuery, setSearchQuery] = useState<string | null>(null);
    const [citations, setCitations] = useState<Citation[]>([]);

    return (
        <div className="message">
            {/* Search indicator */}
            {isSearching && (
                <div className="searching-indicator">
                    <Spinner />
                    <span>Searching for: {searchQuery || 'information'}...</span>
                </div>
            )}

            {/* Streamed content */}
            <div className="content">{content}</div>

            {/* Citation cards */}
            {citations.length > 0 && (
                <div className="citations">
                    <h4>Sources:</h4>
                    {citations.map((cite, idx) => (
                        <a key={idx} href={cite.url} target="_blank" rel="noopener noreferrer" className="citation-card">
                            [{idx + 1}] {cite.title}
                        </a>
                    ))}
                </div>
            )}
        </div>
    );
}
```

---

## 9. Sequential Search UX: The Thought-Action Loop

### The Pattern: Thought → Search → More Thought

Because Whisper uses an agentic loop, the stream may look like this:

1. **Initial Thought**: `data: {"choices":[{"delta":{"content":"Let me find those stock prices..."}}]}`
2. **Action**: `data: {"status":"searching","query":"TSLA stock"}`
3. **Execution**: (Server waits for Tavily)
4. **Follow-up Thought**: `data: {"choices":[{"delta":{"content":"I have the prices. Now let me look for AI news..."}}]}`
5. **Action**: `data: {"status":"searching","query":"Tesla AI news"}`
6. **Final Synthesis**: `data: {"choices":[{"delta":{"content":"Tesla is at $481..."}}]}`
7. **Citations**: `data: {"citations":[...]}`

### Best Practices for Frontend

- **Persistence**: Don't clear the `content` when a new search starts. Keep appending the streamed text.
- **Spinner Management**: Only hide the "Searching" spinner when the `citations` chunk arrives or the stream ends.
- **Query History**: You can optionally show a history of the searches performed during that single response.

---

## 10. Summary: Key Takeaways

1. ✅ **No `forceSearch` parameter** - Model decides autonomously
2. ✅ **Clean Text** - No inline `[1]` markers; citations are references only
3. ✅ **Agentic Loop** - Supports sequential searches (Up to 5 iterations)
4. ✅ **Max Results** - Up to 10 sources per search
5. ✅ **Two SSE events for search**: `{ status: "searching" }` and `{ status: "searching", query: "..." }`
6. ✅ **Don't rely on ACK text** - Claude generates it, GPT might skip it
7. ✅ **Citations come before `[DONE]`** - Display them at the bottom
8. ✅ **Graceful fallback** - If search fails, LLM handles it naturally via background prompt instructions
