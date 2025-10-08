# LLM Prompts Migration: Client → Server

## Current Architecture (Client-Side Prompts)

### Client-Side Components

**1. Prompt Templates (`src/features/common/prompts/promptTemplates.js`)**

- Contains 1400+ lines of system prompt templates
- Organized in `profilePrompts` object with keys like:
    - `whisper` (main assistant)
    - `whisper_question` (Q&A)
    - `whisper_define` (term definitions)
    - `sales_analysis` (sales meeting analysis)
    - `customer_support_analysis` (support ticket analysis)
    - And 20+ more specialized profiles
- Each template has detailed behavioral instructions, language rules, output formats

**2. Prompt Builder (`src/features/common/prompts/promptBuilder.js`)**

- `buildSystemPrompt(promptParts, context)`: Builds system prompts from template parts
- `getSystemPrompt(profile, context)`: Main function that selects profile and builds prompt
- Handles context injection: `<Transcription>{context}</Transcription>`
- Supports both new simplified format (single `system` string) and legacy multi-part format

**3. Ask Service (`src/features/ask/askService.js`)**

- Uses `getSystemPrompt(profileToUse, contextForPrompt)` to build system prompt
- Creates messages array:

```javascript
const messages = [
    { role: 'system', content: systemPrompt },
    {
        role: 'user',
        content: [{ type: 'text', text: userTask }],
    },
];
```

- Adds screenshot support: `messages[1].content.push({ type: 'image_url', image_url: {...} })`
- Calls `llmClient.stream(messages, { signal })`

**4. Summary Service (`src/features/listen/summary/summaryService.js`)**

- Uses `getSystemPrompt()` for analysis profiles
- Creates messages for batched analysis:

```javascript
const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: 'Analyze **ONLY** the conversation...' },
];
```

- Calls `llmClient.chat(messages)`

**5. LLM Client (`src/features/common/ai/llmClient.js`)**

- `chat(messages)`: POST to `/api/llm/chat` with `{ messages }`
- `stream(messages)`: POST to `/api/llm/stream` with `{ messages }`
- Handles auth via `X-Session-UUID` header

### Current API Flow

1. Client builds full `messages` array (system + user content)
2. Client sends `{ messages }` to server
3. Server receives messages, passes directly to Gemini
4. Server returns response (streaming or non-streaming)

## Target Architecture (Server-Side Prompts)

### Server-Side Changes

**1. New Files to Create:**

**`whisper_web/lib/prompts/promptTemplates.ts`**

- TypeScript conversion of `promptTemplates.js`
- Same `profilePrompts` object structure
- Add proper TypeScript interfaces

**`whisper_web/lib/prompts/promptBuilder.ts`**

- TypeScript conversion of `promptBuilder.js`
- Same `buildSystemPrompt()` and `getSystemPrompt()` functions
- Add proper TypeScript types

**2. API Endpoint Changes:**

**`/api/llm/chat/route.ts`**

- Change request body from: `{ messages }`
- To: `{ profile, userMessage, context?, screenshotBase64? }`
- Server builds messages using profile

**`/api/llm/stream/route.ts`**

- Same changes as chat endpoint

**3. Message Building Logic (Server-Side):**

```typescript
import { getSystemPrompt } from '@/lib/prompts/promptBuilder';

const systemPrompt = getSystemPrompt(profile, context);
const messages = [
    { role: 'system', content: systemPrompt },
    {
        role: 'user',
        content: screenshotBase64
            ? [
                  { type: 'text', text: userMessage },
                  { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${screenshotBase64}` } },
              ]
            : userMessage,
    },
];
```

### Client-Side Changes

**1. LLM Client Changes (`llmClient.js`)**

- Change `chat()` function to accept profile instead of messages:

```javascript
async function chat(profile, userMessage, context = {}, screenshotBase64 = null) {
    const body = { profile, userMessage, context, screenshotBase64 };
    // Send body instead of { messages }
}
```

- Change `stream()` function similarly

**2. Ask Service Changes**

- Instead of building messages locally, call:

```javascript
const response = await llmClient.stream(profileToUse, userTask, contextForPrompt, screenshotBase64);
```

**3. Summary Service Changes**

- Similar change:

```javascript
const completion = await llmClient.chat(profile, analysisPrompt, context);
```

## Migration Benefits

1. **Security**: System prompts not exposed in client bundle
2. **Centralization**: Single source of truth for prompts
3. **Updates**: Change prompts without redeploying Electron app
4. **Environment**: Different prompts per deployment/server
5. **Maintenance**: Easier prompt versioning and testing

## Implementation Order

1. **Server**: Create prompt files and update API endpoints
2. **Test Server**: Verify server builds messages correctly
3. **Client**: Update llmClient.js to use new API format
4. **Test Integration**: Ensure Ask and Summary services work
5. **Cleanup**: Remove client-side prompt files (optional, can keep for fallback)

## Files to Track

**Server Files (New):**

- `whisper_web/lib/prompts/promptTemplates.ts`
- `whisper_web/lib/prompts/promptBuilder.ts`

**Server Files (Modified):**

- `whisper_web/app/api/llm/chat/route.ts`
- `whisper_web/app/api/llm/stream/route.ts`

**Client Files (Modified):**

- `src/features/common/ai/llmClient.js`
- `src/features/ask/askService.js`
- `src/features/listen/summary/summaryService.js`

## Testing Checklist

- [ ] Server builds correct messages from profile + context
- [ ] Streaming works with new API format
- [ ] Non-streaming works with new API format
- [ ] Multimodal (screenshots) still works
- [ ] All prompt profiles work (whisper, sales, support, etc.)
- [ ] Context injection works properly
- [ ] Error handling maintained
- [ ] Auth still works
- [ ] Usage limits still enforced
