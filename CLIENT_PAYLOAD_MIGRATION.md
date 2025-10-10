# Client Payload Migration Guide

## Overview

System prompt construction has been moved from client-side to server-side. The client now sends simplified payloads, and the server builds all system prompts using predefined profiles.

## New Payload Format

### Instead of this (OLD):

```json
{
  "messages": [
    {
      "role": "system",
      "content": "You are Whisper, an intelligent context-aware assistant..."
    },
    {
      "role": "user",
      "content": "What should I say next?"
    }
  ]
}
```

### Use this (NEW):

```json
{
  "profile": "whisper",
  "userContent": "What should I say next?",
  "context": null,
  "model": "gemini-2.5-flash-lite",
  "temperature": 0.7
}
```

## Available Profiles

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

- `sales_analysis` - Sales conversation analysis (opportunities, objections, questions)
- `sales_define` - Define sales/business terms
- `sales_question` - Answer sales questions
- `sales_answer_buyer` - Respond as salesperson to buyer questions
- `sales_objection` - Handle sales objections
- `sales_followup` - Generate sales follow-up questions
- `sales_actions` - Extract sales action items
- `sales_next` - Suggest next sales statements
- `sales_recap` - Sales meeting recaps
- `sales_summary` - Sales meeting summaries
- `sales_email` - Sales follow-up emails

### Recruiting Profiles

- `recruiting_analysis` - Interview analysis (strengths, gaps, questions)
- `recruiting_define` - Define HR/recruiting terms
- `recruiting_question` - Answer recruiting questions
- `recruiting_gap` - Handle candidate gaps
- `recruiting_suggested_question` - Generate interview questions
- `recruiting_should_say_next` - Suggest next interview statements
- `recruiting_email` - Recruiting follow-up emails
- `recruiting_actions` - Extract recruiting action items
- `recruiting_followup` - Generate recruiting follow-up questions
- `recruiting_recap` - Recruiting meeting recaps
- `recruiting_summary` - Recruiting meeting summaries

### Support Profiles

- `customer_support_analysis` - Support ticket analysis (issues, root causes, troubleshooting)
- `customer_support_define` - Define support/tech terms
- `customer_support_question` - Answer support questions
- `customer_support_followup` - Generate support follow-up questions
- `customer_support_actions` - Extract support action items
- `customer_support_email` - Support follow-up emails
- `customer_support_next` - Suggest next support statements
- `customer_support_recap` - Support call recaps
- `customer_support_summary` - Support call summaries
- `customer_support_root_cause` - Identify root causes
- `customer_support_troubleshooting` - Provide troubleshooting steps

### Education Profiles

- `school_analysis` - Classroom analysis (concepts, unclear points, questions)
- `school_define` - Define educational terms
- `school_question` - Answer educational questions
- `school_followup` - Generate educational follow-up questions
- `school_actions` - Extract educational action items
- `school_email` - Educational follow-up emails
- `school_next` - Suggest next educational statements
- `school_recap` - Educational session recaps
- `school_summary` - Educational session summaries

### Special Profiles

- `meeting_analysis` - General meeting analysis (insights, questions, defines)
- `comprehensive_summary` - Full session summaries

## Context Data Format

### For Analysis Profiles (transcript-based):

```json
{
  "profile": "meeting_analysis",
  "userContent": "Analyze **ONLY** the conversation provided in the Transcript context above IN THE **LANGUAGE OF THE TRANSCRIPT**. If nothing is detected then DO NOT RETURN ANYTHING.",
  "context": {
    "transcript": "me: Hello there\nthem: Hi, how can I help?",
    "previousItems": ["📘 Define API", "❓ How does authentication work?"]
  }
}
```

### For Multimodal Content:

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
  ]
}
```

## Migration Steps

### 1. Update Ask Service

Replace:

```javascript
const messages = [
  { role: "system", content: builtSystemPrompt },
  { role: "user", content: userContent },
];
```

With:

```javascript
const payload = {
  profile: detectedProfile, // e.g., "whisper", "sales_next"
  userContent: userContent, // text or multimodal array
  context: conversationHistory, // if needed
  model: "gemini-2.5-flash-lite",
  temperature: 0.7,
};
```

### 2. Update Summary Service

Replace:

```javascript
const messages = [
  { role: "system", content: xmlBuiltPrompt },
  { role: "user", content: "Analyze..." },
];
```

With:

```javascript
const payload = {
  profile: analysisProfile, // e.g., "meeting_analysis", "sales_analysis"
  userContent:
    "Analyze **ONLY** the conversation provided in the Transcript context above...",
  context: {
    previousItems: definedTerms.concat(detectedQuestions),
    transcript: currentTranscript,
  },
};
```

### 3. Remove Client Prompt Building

- Remove `getSystemPrompt()` calls
- Remove `promptBuilder.js` and `promptTemplates.js` dependencies
- Keep as fallback if needed

## API Endpoints

### LLM Endpoints (Updated)

- `POST /api/llm/chat` - Synchronous responses
- `POST /api/llm/stream` - Streaming responses

## Error Handling

The server will return:

- `400` for missing `profile` or `userContent`
- `401` for invalid sessions
- `429` for stream endpoint usage limits
- `500` for internal errors

## Backward Compatibility

The old message-based format is no longer supported. All clients must migrate to the new profile-based format.
