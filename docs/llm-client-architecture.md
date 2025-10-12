# LLM Client Architecture

## Overview

WhisperV2 uses a client-server architecture where the client sends simplified payloads to server-side LLM endpoints that handle all prompt construction. The client no longer builds system prompts - it only determines the appropriate profile and formats the user content and context.

## Architecture Components

### 1. LLM Client (`src/features/common/ai/llmClient.js`)

**Purpose:** Handles HTTP communication with server-side LLM API endpoints.

**Key Functions:**

- `chat(payload)` - Synchronous LLM requests
- `stream(payload)` - Streaming LLM requests with AbortController support

**Payload Validation:**

```javascript
// Validates required fields
if (!payload.profile) {
    throw new Error('Invalid payload: missing required field "profile"');
}
// userContent is optional for analysis profiles and comprehensive_summary
const requiresUserContent = payload.profile && !payload.profile.endsWith('_analysis') && payload.profile !== 'comprehensive_summary';
if (requiresUserContent && (payload.userContent === undefined || payload.userContent === null)) {
    throw new Error('Invalid payload: missing required field "userContent"');
}
```

**API Endpoints:**

- `POST /api/llm/chat` - Synchronous responses
- `POST /api/llm/stream` - Streaming responses

### 2. Ask Service (`src/features/ask/askService.js`)

**Purpose:** Handles user questions, manual requests, and multimodal interactions (text + screenshots).

**Key Features:**

#### Intent Detection (`_detectIntentFromClickPill()`)

Hierarchical intent detection from UI pill clicks:

1. **Exact string matching** for common defaults ("✨ What should I say next?")
2. **Prefix matching** for analysis results ("📘 Define", "❗❗ Objection")
3. **Heuristic fallbacks** for localization

#### Profile Routing (`_resolveProfileForIntent()`)

Maps (intent + active preset) to specific server-side profiles:

```javascript
const MAP = {
    default: {
        next: 'whisper_next',
        generic_followup: 'whisper_followup',
        define: 'whisper_define',
        // ... more mappings
    },
    sales: {
        next: 'sales_next',
        objection: 'sales_objection',
        // ... sales-specific mappings
    },
    // ... other presets
};
```

**Context Policy:**

- Most intents include conversation context
- `define` intent excludes context to avoid irrelevant information

#### Multimodal Support

Captures screenshots for "Assist me" requests and formats as multimodal content:

```javascript
const userContent = screenshotBase64
    ? [
          { type: 'text', text: userPrompt.trim() },
          {
              type: 'image_url',
              image_url: { url: `data:image/jpeg;base64,${screenshotBase64}` },
          },
      ]
    : userPrompt.trim();
```

#### Payload Construction

```javascript
const payload = {
    profile: profileToUse, // e.g., "whisper", "sales_next"
    userContent: userContent, // text or multimodal array
    context: context, // conversation history or analysis context
};
```

### 3. Summary Service (`src/features/listen/summary/summaryService.js`)

**Purpose:** Provides real-time AI analysis of conversation transcripts with intelligent batching.

**Key Features:**

#### Smart Batching System

Configurable triggers for analysis:

- **Utterance count** (default: 5)
- **Token estimation** (~4 chars = 1 token)
- **Time fallback** (120 seconds)
- **Content thresholds** (min tokens/chars)

#### Analysis Profile Selection

Based on user-selected preset:

```javascript
_mapPresetToProfile(presetId) {
    switch (presetId) {
        case 'sales': return 'sales_analysis';
        case 'recruiting': return 'recruiting_analysis';
        case 'customer-support': return 'customer_support_analysis';
        case 'school': return 'school_analysis';
        default: return 'meeting_analysis';
    }
}
```

#### Context Management

Tracks and prevents repetition of:

- **Defined terms** (`Set` for deduplication)
- **Detected questions** (`Set` for deduplication)

#### Analysis Payload Construction

```javascript
const payload = {
    profile: profileToUse, // e.g., "meeting_analysis"
    role: this.selectedRoleText || '', // From preset database
    userContent: '', // Empty userContent for server-side prompt construction
    context: {
        transcript: recentConversation,
        previousItems: [
            /* formatted previous terms/questions */
        ],
    },
};
```

## Payload Formats

### Standard Text Payload

```json
{
    "profile": "whisper_next",
    "userContent": "What should I say next?",
    "context": "me: Hello\n them: Hi there"
}
```

### Multimodal Payload (with Screenshot)

```json
{
    "profile": "whisper",
    "userContent": [
        {
            "type": "text",
            "text": "What should I say next?"
        },
        {
            "type": "image_url",
            "image_url": {
                "url": "data:image/jpeg;base64,iVBORw0KGgoAAAANSUhEUgAA..."
            }
        }
    ],
    "context": null
}
```

### Analysis Payload

```json
{
    "profile": "sales_analysis",
    "role": "You are a sales analysis expert...",
    "userContent": "",
    "context": {
        "transcript": "me: Let's discuss pricing\n them: Sure, what are your thoughts?",
        "previousItems": ["📘 Define ROI", "❓ How does the pricing work?"]
    }
}
```

## Profile Categories

### Core Assistant Profiles

- `whisper` - Main multimodal assistant with screen analysis
- `whisper_question` - Answer user questions from context
- `whisper_define` - Define terms in user's language
- `whisper_next` - Suggest natural next statements
- `whisper_followup` - Generate follow-up questions
- `whisper_recap` - Create meeting recaps
- `whisper_actions` - Extract action items
- `whisper_summary` - Executive meeting summaries
- `whisper_email` - Draft professional emails

### Sales Profiles

- `sales_next` - Suggest next sales statements
- `sales_objection` - Handle sales objections
- `sales_followup` - Generate sales follow-up questions
- `sales_analysis` - Sales conversation analysis
- `sales_answer_buyer` - Respond as salesperson to buyer questions
- `sales_actions` - Extract sales action items
- `sales_summary` - Sales meeting summaries
- `sales_recap` - Sales meeting recaps
- `sales_email` - Sales follow-up emails

### Recruiting Profiles

- `recruiting_should_say_next` - Suggest next interview statements
- `recruiting_question` - Answer recruiting questions
- `recruiting_gap` - Handle candidate gaps
- `recruiting_suggested_question` - Generate interview questions
- `recruiting_analysis` - Interview analysis
- `recruiting_actions` - Extract recruiting action items
- `recruiting_summary` - Recruiting meeting summaries
- `recruiting_email` - Recruiting follow-up emails

### Support Profiles

- `customer_support_next` - Suggest next support statements
- `customer_support_question` - Answer support questions
- `customer_support_root_cause` - Identify root causes
- `customer_support_troubleshooting` - Provide troubleshooting steps
- `customer_support_analysis` - Support ticket analysis
- `customer_support_actions` - Extract support action items
- `customer_support_email` - Support follow-up emails

### Education Profiles

- `school_next` - Suggest next educational statements
- `school_question` - Answer educational questions
- `school_followup` - Generate educational follow-up questions
- `school_analysis` - Classroom analysis
- `school_actions` - Extract educational action items
- `school_email` - Educational follow-up emails

## Context Handling

### For Standard Interactions

- **String context**: Conversation history passed as simple string
- **Null context**: For standalone prompts (define operations)

### For Analysis Profiles

- **Object context**: Structured with `transcript` and `previousItems`
- **Previous items**: Formatted as prefixed strings ("📘 Define term", "❓ question")
- **XML structure**: Server constructs `<previous>` and `<transcription>` blocks

## Error Handling

### Client-Side Errors

- **400**: Missing `profile` field or `userContent` field (when required for non-analysis profiles)
- **401**: Invalid session/authentication
- **429**: Stream endpoint usage limits
- **500**: Internal server errors

### Multimodal Fallback

- Automatically retries with text-only if image processing fails
- Graceful degradation maintains functionality

## Key Benefits of Server-Side Prompt Construction

1. **Consistency**: All prompts managed centrally on server
2. **Security**: Sensitive prompt logic not exposed to client
3. **Maintainability**: Profile updates don't require client deployments
4. **Scalability**: Easy to add new profiles without client changes
5. **Performance**: Reduced client bundle size
6. **Flexibility**: Server can optimize prompts based on model capabilities

## Migration Impact

### Removed Components

- `getSystemPrompt()` client-side function calls
- `promptBuilder.js` and `promptTemplates.js` dependencies
- Complex client-side prompt construction logic
- **`model` and `temperature` parameters** from all API payloads

### New Architecture Benefits

- **Simplified client code**: Focus on intent detection and context formatting
- **Server-side model configuration**: Optimized model and temperature settings handled centrally
- **Centralized prompt management**: All prompts managed server-side
- **Better separation of concerns**: Client handles UI/interaction, server handles AI logic
- **Improved maintainability**: Profile updates require only server changes

## Integration Points

### Database Integration

- **Session management**: Tracks conversations and AI responses
- **Summary storage**: Persists analysis results with structured JSON
- **Preset system**: User-configurable analysis profiles with custom prompts

### UI Integration

- **Streaming responses**: Real-time token delivery to UI
- **State management**: Service state synchronized with UI components
- **Quota tracking**: Header-based usage monitoring

### Cross-Service Communication

- **Internal bridge**: Inter-process communication for UI updates
- **Window management**: Coordinated multi-window Electron app
- **Screenshot capture**: Platform-specific image capture (macOS/Windows)

## Future Considerations

### Potential Enhancements

- **Dynamic profile selection**: Server-side A/B testing of prompt variations
- **Context optimization**: Server-side context compression and relevance filtering
- **Model routing**: Intelligent model selection based on profile requirements
- **Caching**: Server-side prompt caching for improved performance

### Monitoring & Analytics

- **Usage tracking**: Profile usage statistics for optimization
- **Performance metrics**: Response time and quality monitoring
- **Error analysis**: Client/server error correlation and debugging

This architecture provides a robust, scalable foundation for AI-powered conversation assistance while maintaining clean separation between client-side interaction logic and server-side AI processing.
