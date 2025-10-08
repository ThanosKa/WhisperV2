# WebApp AI Agent: Implement Server-Side LLM Prompts

## Mission

Implement server-side LLM prompt management by migrating prompts from client to server. Follow the detailed plan in `prompts-migration-plan.md`.

## Required Actions

### 1. Create Server-Side Prompt Files

**Create `whisper_web/lib/prompts/promptTemplates.ts`**

- Convert `src/features/common/prompts/promptTemplates.js` to TypeScript
- Keep exact same `profilePrompts` object structure
- Add TypeScript interfaces:

```typescript
interface ProfilePrompt {
    system: string;
}

interface ProfilePrompts {
    [key: string]: ProfilePrompt;
}
```

**Create `whisper_web/lib/prompts/promptBuilder.ts`**

- Convert `src/features/common/prompts/promptBuilder.js` to TypeScript
- Keep exact same logic for `buildSystemPrompt()` and `getSystemPrompt()`
- Add proper TypeScript types
- Export both functions

### 2. Update API Endpoints

**Modify `/api/llm/chat/route.ts`:**

- Change request body parsing from `{ messages }` to `{ profile, userMessage, context?, screenshotBase64? }`
- Add import: `import { getSystemPrompt } from '@/lib/prompts/promptBuilder';`
- Build messages server-side:

```typescript
const systemPrompt = getSystemPrompt(profile, context || {});
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

- Keep all existing auth, usage limits, and error handling

**Modify `/api/llm/stream/route.ts`:**

- Same changes as chat endpoint
- Ensure streaming format remains: `data: {"choices":[{"delta":{"content":"chunk"}}]}\ndata: [DONE]\n\n`

### 3. TypeScript Types

**Create proper interfaces for API requests:**

```typescript
interface LLMChatRequest {
    profile: string;
    userMessage: string;
    context?: any;
    screenshotBase64?: string;
}

interface LLMStreamRequest extends LLMChatRequest {}
```

### 4. Testing Requirements

- Verify all prompt profiles work (whisper, sales_analysis, customer_support_analysis, etc.)
- Test multimodal support (screenshots)
- Test streaming and non-streaming responses
- Ensure context injection works: `<Transcription>{context}</Transcription>`
- Confirm auth and usage limits still function

### 5. Documentation Output

After implementation, create detailed documentation of all changes made:

**`webapp-changes-documentation.md`** containing:

- Files created/modified with before/after code snippets
- API endpoint changes with request/response examples
- TypeScript interfaces added
- Any deviations from the plan and why
- Testing results
- Known issues or limitations

## Critical Requirements

- **Maintain backward compatibility** during transition
- **Preserve all existing functionality** (auth, streaming, multimodal, usage limits)
- **Keep exact same prompt logic** - just move location
- **Test thoroughly** before declaring complete
- **Document everything** in the output file

## Success Criteria

- [ ] Server can build messages from profile + userMessage + context
- [ ] All prompt profiles work correctly
- [ ] Streaming and chat APIs accept new request format
- [ ] Multimodal support maintained
- [ ] Auth and usage limits preserved
- [ ] Client can be updated to use new API format

## Output Format

Create `webapp-changes-documentation.md` with:

```
# Files Created
# Files Modified
# API Changes
# TypeScript Types Added
# Testing Results
# Issues/Limitations
```

Ready to implement. Start with creating the prompt files, then update APIs. Test each change thoroughly.
