# WhisperV2 System Pipeline Documentation

This document provides a comprehensive overview of the Speech-to-Text (STT) and Large Language Model (LLM) processing pipeline in the WhisperV2 system. It details the flow of data from audio capture through transcription and AI processing to the final user interface.

## Table of Contents
1. [System Architecture Overview](#system-architecture-overview)
2. [STT Pipeline](#stt-pipeline)
   - [Audio Capture](#audio-capture)
   - [STT Service](#stt-service)
   - [Provider Integration](#provider-integration)
3. [LLM Pipeline](#llm-pipeline)
   - [Ask Service](#ask-service)
   - [Provider Integration](#llm-provider-integration)
4. [Data Flow and Communication](#data-flow-and-communication)
5. [UI Components](#ui-components)
6. [Configuration and Model Management](#configuration-and-model-management)

## System Architecture Overview

The WhisperV2 system follows a modular architecture with distinct components:

```
Electron Main Process
├── Window Management (windowManager.js)
├── Feature Services
│   ├── Listen Service (listenService.js)
│   │   ├── STT Service (sttService.js)
│   │   └── Summary Service (summaryService.js)
│   ├── Ask Service (askService.js)
│   └── Common Services
│       ├── Model State Service (modelStateService.js)
│       ├── AI Factory (factory.js)
│       └── Provider Implementations
└── Communication Bridges
    ├── Feature Bridge (featureBridge.js)
    ├── Internal Bridge (internalBridge.js)
    └── Window Bridge (windowBridge.js)

Electron Renderer Process
├── UI Components
│   ├── Ask View (AskView.js)
│   ├── Listen View (ListenView.js)
│   ├── STT View (SttView.js)
│   └── Summary View (SummaryView.js)
└── Preload API (preload.js)
```

## STT Pipeline

### Audio Capture

The system captures audio from two sources:
1. **Microphone Audio** - User's voice captured via Electron's media APIs
2. **System Audio** - Other participants' audio captured differently on each platform:
   - **macOS**: Uses a native `SystemAudioDump` utility
   - **Windows**: Uses Electron's desktopCapturer API

Key files:
- [src/features/listen/stt/sttService.js](src/features/listen/stt/sttService.js) - Line 528 (`startMacOSAudioCapture`)
- [src/ui/listen/audioCore/listenCapture.js](src/ui/listen/audioCore/listenCapture.js) - Audio capture implementation

### STT Service

The [SttService](src/features/listen/stt/sttService.js) is the core component managing STT operations:

```javascript
// Initialize STT sessions for both speakers
await this.sttService.initializeSttSessions(language);

// Send audio data for transcription
await this.sttService.sendMicAudioContent(data, mimeType);
await this.sttService.sendSystemAudioContent(data, mimeType);
```

Key features:
- Manages separate STT sessions for "Me" (user) and "Them" (other participants)
- Implements debouncing to handle partial transcriptions
- Handles session renewal to prevent timeouts
- Provides keep-alive mechanisms for long-running connections

### Provider Integration

The system supports multiple STT providers through the AI factory pattern:

```javascript
// src/features/common/ai/factory.js
const PROVIDERS = {
    openai: {
        name: 'OpenAI',
        handler: () => require('./providers/openai'),
        sttModels: [{ id: 'gpt-4o-mini-transcribe', name: 'GPT-4o Mini Transcribe' }],
    },
    gemini: {
        name: 'Gemini',
        handler: () => require('./providers/gemini'),
        sttModels: [{ id: 'gemini-live-2.5-flash-preview', name: 'Gemini Live 2.5 Flash' }],
    },
};
```

Provider implementations handle:
- WebSocket connections for real-time transcription
- Audio data formatting
- Message parsing and event handling

## LLM Pipeline

### Ask Service

The [AskService](src/features/ask/askService.js) handles all LLM interactions:

```javascript
// Send a message to the LLM
await askService.sendMessage(userPrompt, conversationHistory);

// Interrupt a streaming response
askService.interruptStream();
```

Key responsibilities:
- Manages conversation context and session handling
- Captures screenshots for visual context
- Builds prompts with system instructions and user input
- Processes streaming responses from LLM providers
- Handles multimodal fallback (text-only when image processing fails)

### LLM Provider Integration

Similar to STT, LLM providers are managed through the factory:

```javascript
// src/features/common/ai/factory.js
const PROVIDERS = {
    openai: {
        name: 'OpenAI',
        handler: () => require('./providers/openai'),
        llmModels: [{ id: 'gpt-4.1', name: 'GPT-4.1' }],
    },
    gemini: {
        name: 'Gemini',
        handler: () => require('./providers/gemini'),
        llmModels: [{ id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' }],
    },
};
```

## Data Flow and Communication

### IPC Communication

The system uses Electron's IPC (Inter-Process Communication) for communication between main and renderer processes:

1. **Renderer to Main**: UI events trigger IPC calls
2. **Main to Renderer**: Services send updates back to UI

```javascript
// In preload.js - exposing IPC to renderer
ipcRenderer.invoke('ask:sendQuestionFromAsk', text)

// In featureBridge.js - handling IPC calls
ipcMain.handle('ask:sendQuestionFromAsk', async (event, userPrompt) => {
    return await askService.sendMessageManual(userPrompt, conversationHistory);
});
```

### Event Flow

1. **Audio Capture**:
   - User speaks → Audio captured → Sent to STT service
   - System audio captured → Sent to STT service

2. **Transcription**:
   - STT service receives audio → Sends to provider
   - Provider returns transcription → STT service processes
   - STT service emits events → UI updates

3. **Question Answering**:
   - User submits question → Ask service processes
   - Ask service captures context → Builds prompt
   - Prompt sent to LLM provider → Response streamed
   - Response displayed in UI

## UI Components

### Ask View

The [AskView](src/ui/ask/AskView.js) component handles the question/answer interface:

```javascript
// Handle sending text from UI
handleSendText(event, text) {
    window.api.askView.sendMessage(text);
}

// Handle streaming responses
window.api.askView.onAskStateUpdate((event, newState) => {
    // Update UI with streaming response
});
```

### Listen View

The [ListenView](src/ui/listen/ListenView.js) manages the transcription interface:

```javascript
// Handle session state changes
window.api.listenView.onSessionStateChanged((_, { isActive }) => {
    // Update UI based on session state
});
```

### STT View

The [SttView](src/ui/listen/stt/SttView.js) displays real-time transcriptions:

```javascript
// Handle transcription updates
window.api.sttView.onSttUpdate((event, { speaker, text, isFinal, isPartial }) => {
    // Update transcription display
});
```

## Configuration and Model Management

### Model State Service

The [ModelStateService](src/features/common/services/modelStateService.js) manages provider configuration:

```javascript
// Get current model information
const modelInfo = await modelStateService.getCurrentModelInfo('stt');

// Set API key
await modelStateService.setApiKey(provider, key);

// Select model
await modelStateService.setSelectedModel(type, modelId);
```

### Environment Configuration

API keys are loaded from environment variables:

```bash
# .env file
OPENAI_API_KEY=sk-...
GEMINI_API_KEY=...
```

The system automatically selects available models based on configured API keys.

## Key Integration Points

1. **Factory Pattern**: [factory.js](src/features/common/ai/factory.js) provides a unified interface for creating STT/LLM providers
2. **Service Layer**: Each feature has a dedicated service ([listenService.js](src/features/listen/listenService.js), [askService.js](src/features/ask/askService.js))
3. **Repository Pattern**: Data access is abstracted through repositories
4. **IPC Bridge**: Communication between processes uses Electron's IPC mechanisms
5. **Event-Driven Architecture**: Components communicate through events for loose coupling

## Error Handling and Resilience

The system implements several resilience patterns:

1. **STT Session Renewal**: Automatic renewal of STT sessions to prevent timeouts
2. **Multimodal Fallback**: Falls back to text-only when image processing fails
3. **Retry Logic**: Implements retry mechanisms for failed operations
4. **Graceful Degradation**: Continues functioning even when some features fail

This documentation provides a comprehensive overview of how STT and LLM calls flow through the WhisperV2 system, from audio capture to AI processing and UI display.