# System Prompt Migration: Client to Server

## Overview

This document outlines the current system architecture for LLM interactions and the planned migration of system prompt construction from client-side to server-side.

## Current System Architecture

The application uses a client-server architecture where the client (Electron app) handles all LLM prompt construction before sending requests to the server.

### Key Components

#### 1. LLM Client (`src/features/common/ai/llmClient.js`)

**Purpose:** Handles HTTP communication with LLM API endpoints

**Current Payload Structure:**

```javascript
// Sent to /api/llm/chat and /api/llm/stream
{
    messages: [
        { role: 'system', content: 'pre-built system prompt...' },
        { role: 'user', content: 'user message' },
    ];
}
```

**Functions:**

- `chat(messages)` - Synchronous LLM requests
- `stream(messages)` - Streaming LLM requests

#### 2. Ask Service (`src/features/ask/askService.js`)

**Purpose:** Handles user questions, manual requests, and multimodal interactions (text + screenshots)

**Current Flow:**

1. **Intent Detection:** `_detectIntentFromClickPill()` determines user intent from pill clicks
    - Exact string matching for UI defaults (e.g., "✨ What should I say next?")
    - Prefix matching for analysis results (e.g., "📘 Define", "❗❗ Objection")
    - Heuristic fallbacks for localization
2. **Preset Routing:** `_resolveProfileForIntent()` maps (intent + active preset) to specific prompt profile
    - Routing table: `default`, `sales`, `recruiting`, `customer-support`, `school`
    - Each preset has custom prompt mappings (e.g., `sales.next` → `sales_next`)
3. **Context Building:** Determines whether to include conversation history
    - Most intents include context; `define` intent excludes it
    - For analysis profiles, adds previous terms/questions from summary service
4. **Multimodal Handling:** Captures screenshots for "Assist me" requests
5. **Client-side:** Calls `getSystemPrompt()` to build system message
6. Constructs messages array with system + user content (text + optional image)
7. Sends to LLM via `llmClient.stream()` with fallback to text-only on multimodal failure

**Key Methods:**

- `sendMessage()` - Main request handler with session management
- `_detectIntentFromClickPill()` - Hierarchical intent detection (exact → prefix → heuristic)
- `_resolveProfileForIntent()` - Preset-aware profile routing with context decisions
- `captureScreenshot()` - macOS/Windows screenshot capture with Sharp processing
- `_processStream()` - Streaming response handling with UI updates

#### 3. Listen Service (`src/features/listen/listenService.js`)

**Purpose:** Manages real-time speech-to-text and meeting sessions

**Current Flow:**

1. Records audio and transcribes to text
2. Stores transcripts in database
3. Triggers summary analysis via Summary Service
4. **Client-side:** Builds system prompts for:
    - Meeting title generation
    - Comprehensive session summaries

#### 4. Summary Service (`src/features/listen/summary/summaryService.js`)

**Purpose:** Provides real-time AI analysis of conversation transcripts with intelligent batching

**Current Flow:**

1. **Conversation Accumulation:** Stores conversation turns with speaker labels (`me:`, `them:`)
2. **Smart Batching:** Uses configurable triggers (utterance count, token count, time fallback)
    - Batches 3+ utterances before analysis
    - 120-second time fallback prevents analysis starvation
    - Rough token estimation (4 chars = 1 token)
3. **Analysis Profile Selection:** Based on user-selected preset (meetings, sales, recruiting, etc.)
4. **Context Building:** Includes previous terms/questions to prevent repetition
    - Tracks `definedTerms` and `detectedQuestions` sets
    - Uses domain-specific context labels (e.g., Sales: "Previous Opportunities", "Previous Objections")
5. **Client-side:** Builds system prompts for analysis profiles
6. Sends structured analysis requests to LLM
7. **Response Parsing:** Extracts insights, actions, questions, and terms from JSON responses
8. **State Updates:** Saves results and triggers UI updates

**Key Analysis Profiles:**

- `meeting_analysis` - General meeting insights, questions, term definitions
- `sales_analysis` - Sales opportunities, objections, buyer questions, follow-up suggestions
- `recruiting_analysis` - Candidate gaps, strengths, suggested questions
- `customer_support_analysis` - Root causes, troubleshooting steps, issue summaries
- `school_analysis` - Key concepts, unclear points, study questions

**Trigger Configuration:**

- `analysisStep`: Utterance-based triggering (default: 5)
- `smartTrigger.enabled`: Advanced token/char count triggering
- `minTokenCount`: Minimum tokens before analysis (default: 12)
- `maxWaitUtterances`: Maximum utterances to wait (default: 5)

#### 5. Prompt Builder (`src/features/common/prompts/promptBuilder.js`)

**Purpose:** Intelligently constructs system prompts based on profile type and context

**Key Functions:**

- `getSystemPrompt(profile, context, googleSearchEnabled)` - Main prompt builder with type detection
- `buildSystemPrompt()` - Legacy sectional prompt construction (intro/format/content/output)
- `buildXMLContext()` - XML structure for analysis profiles with previous items and transcript

**Prompt Construction Logic:**

**For Analysis Profiles (ending with `_analysis`):**

```xml
<previous>
📘 Define term1
❓ question1
</previous>

<transcription>
me: Hello there
them: Hi, how can I help?
</transcription>
```

**For Regular Profiles (e.g., `whisper`, `sales_next`):**

```markdown
<Transcription>
me: Hello there
them: Hi, how can I help?
</Transcription>
```

**Context Handling:**

- **String context:** Appends as `<Transcription>` block
- **Object context:** Uses XML structure for analysis profiles with `previousItems` and `transcript`
- **Empty context:** Returns template as-is (for standalone prompts)

#### 6. Prompt Templates (`src/features/common/prompts/promptTemplates.js`)

**Purpose:** Contains all system prompt templates organized by functionality and domain

**Template Categories:**

**1. Core Assistant Templates:**

- `whisper` - Main multimodal assistant with screen analysis capabilities
- `whisper_*` variants - Specific task templates (question, define, next, actions, etc.)

**2. Analysis Templates (JSON Output):**

- `meeting_analysis` - General meeting insights with structured JSON response
- `sales_analysis` - Sales-focused analysis with opportunities, objections, buyer questions
- `recruiting_analysis` - Interview analysis with gaps, strengths, questions
- `customer_support_analysis` - Support analysis with root causes, troubleshooting
- `school_analysis` - Educational analysis with concepts, unclear points

**3. Domain-Specific Task Templates:**

- `sales_*` - Sales-specific responses (objection handling, follow-ups, etc.)
- `recruiting_*` - Recruiting-specific responses
- `customer_support_*` - Support-specific responses
- `school_*` - Education-specific responses

**Template Structure Examples:**

**Analysis Template (JSON Output):**

```javascript
meeting_analysis: {
    system: `Rules:
- You are analyzing real-time Speech-to-Text transcripts...
- Base ALL outputs ONLY on the Transcript...
- Respond with ONLY valid JSON matching schema...

{
  "sections": [
    {
      "type": "insights",
      "title": "Meeting Insights",
      "items": ["- Key points from transcript"]
    },
    {
      "type": "questions",
      "title": "Questions Detected",
      "items": ["- Reconstructed questions"]
    },
    {
      "type": "defines",
      "title": "Terms to Define",
      "items": ["- Terms needing definition"]
    }
  ]
}`,
}
```

**Task Template (Natural Language Output):**

```javascript
sales_next: {
    system: `You suggest natural next sales statements...
## Rules:
- 3-4 short suggestions (bullets ≤20 words)...
- Match the tone and formality...
## STRICT OUTPUT FORMAT
- Always response in the language of the transcription context.`,
}
```

**Total Templates:** ~50+ specialized templates covering different domains and tasks

#### 7. Additional Key Components

**Settings Service (`src/features/settings/settingsService.js`):**

- Manages user presets and analysis profile selection
- Stores user preferences for analysis behavior
- Provides preset definitions with prompts and configurations

**Auth Service (`src/features/common/services/authService.js`):**

- Manages user sessions and authentication
- Provides session UUID for API authentication
- Handles user context for personalized responses

**Model State Service (`src/features/common/services/modelStateService.js`):**

- Tracks available AI models and capabilities
- Handles model switching and capability detection
- Manages multimodal support detection

**Database Repositories:**

- `sessionRepository` - Manages meeting sessions and metadata
- `askRepository` - Stores AI conversations and responses
- `summaryRepository` - Persists analysis results and summaries
- `sttRepository` - Handles speech-to-text transcripts

**Configuration System (`src/features/common/config/config.js`):**

- Manages analysis triggering parameters (`analysisStep`, `smartTrigger`)
- Controls batching behavior and timing
- Handles feature flags and behavioral settings

## Current Payloads

### Ask Service Payload (Multimodal)

```json
{
    "messages": [
        {
            "role": "system",
            "content": "You are Whisper, an intelligent context-aware assistant that observes the user's screen..."
        },
        {
            "role": "user",
            "content": [
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
            ]
        }
    ]
}
```

**Notes:**

- Multimodal requests include base64-encoded screenshots
- System prompts are fully constructed client-side
- Fallback to text-only if multimodal fails

### Summary Service Payload (Analysis)

```json
{
    "messages": [
        {
            "role": "system",
            "content": "<previous>\n📘 Define API\n❓ How does authentication work?\n</previous>\n\n<transcription>\nme: Let's discuss the new API\n them: Sure, what would you like to know?\n</transcription>"
        },
        {
            "role": "user",
            "content": "Analyze **ONLY** the conversation provided in the Transcript context above IN THE **LANGUAGE OF THE TRANSCRIPT**. If nothing is detected then DO NOT RETURN ANYTHING."
        }
    ]
}
```

**Notes:**

- XML structure separates previous context from current transcript
- Requires JSON response with specific schema
- Language detection and matching enforced
- Previous terms/questions prevent repetition

### Request Flow Summary

1. **Client constructs** full system prompt + user message
2. **Sends to server** via `/api/llm/stream` or `/api/llm/chat`
3. **Server streams response** back to client
4. **Client processes** streaming tokens and updates UI
5. **Results saved** to appropriate database tables

## Migration Goal

Move system prompt construction from client-side to server-side to:
