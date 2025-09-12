# WhisperV2 Technical Flow Documentation

This document details the specific code paths and implementations for STT and LLM processing in the WhisperV2 system.

## Table of Contents
1. [STT Processing Flow](#stt-processing-flow)
2. [LLM Processing Flow](#llm-processing-flow)
3. [Data Storage and Session Management](#data-storage-and-session-management)
4. [UI Communication](#ui-communication)
5. [Provider Implementations](#provider-implementations)

## STT Processing Flow

### 1. Audio Capture and Initial Processing

**Entry Point**: [src/ui/listen/audioCore/listenCapture.js](src/ui/listen/audioCore/listenCapture.js)

The audio capture process begins when the user clicks "Listen" in the UI:

```javascript
// ListenView.js triggers session initialization
await listenService.handleListenRequest('Listen');

// Which calls initializeSession in ListenService.js
await this.initializeSession();

// Which initializes STT sessions
await this.sttService.initializeSttSessions(language);
```

### 2. STT Service Initialization

**File**: [src/features/listen/stt/sttService.js](src/features/listen/stt/sttService.js) (lines 160-285)

The STT service creates separate sessions for "Me" and "Them":

```javascript
async initializeSttSessions(language = 'en') {
    const modelInfo = await modelStateService.getCurrentModelInfo('stt');
    
    // Create sessions for both speakers
    [this.mySttSession, this.theirSttSession] = await Promise.all([
        createSTT(this.modelInfo.provider, myOptions),
        createSTT(this.modelInfo.provider, theirOptions),
    ]);
}
```

### 3. Audio Data Transmission

**File**: [src/features/listen/stt/sttService.js](src/features/listen/stt/sttService.js) (lines 375-405)

Audio data is sent to the appropriate STT session:

```javascript
async sendMicAudioContent(data, mimeType) {
    // Format data based on provider
    let payload;
    if (modelInfo.provider === 'gemini') {
        payload = { audio: { data, mimeType: mimeType || 'audio/pcm;rate=24000' } };
    } else {
        payload = data;
    }
    
    // Send to "Me" session
    await this.mySttSession.sendRealtimeInput(payload);
}
```

### 4. Transcription Processing

**File**: [src/features/listen/stt/sttService.js](src/features/listen/stt/sttService.js) (lines 200-300)

Message handlers process incoming transcriptions:

```javascript
const handleMyMessage = message => {
    if (this.modelInfo.provider === 'gemini') {
        const transcription = message.serverContent?.inputTranscription;
        const textChunk = transcription?.text || '';
        const turnComplete = !!message.serverContent?.turnComplete;

        if (message.serverContent?.turnComplete) {
            if (this.myCompletionTimer) {
                clearTimeout(this.myCompletionTimer);
                this.flushMyCompletion();
            }
            return;
        }

        if (!transcription || !textChunk.trim() || textChunk.trim() === '<noise>') {
            return; // Ignore empty or noise-only chunks
        }

        this.debounceMyCompletion(textChunk);

        this.sendToRenderer('stt-update', {
            speaker: 'Me',
            text: this.myCompletionBuffer,
            isPartial: true,
            isFinal: false,
            timestamp: Date.now(),
        });
    } else {
        // OpenAI provider handling
        const type = message.type;
        const text = message.transcript || message.delta || (message.alternatives && message.alternatives[0]?.transcript) || '';

        if (type === 'conversation.item.input_audio_transcription.delta') {
            if (this.myCompletionTimer) clearTimeout(this.myCompletionTimer);
            this.myCompletionTimer = null;
            this.myCurrentUtterance += text;
            const continuousText = this.myCompletionBuffer + (this.myCompletionBuffer ? ' ' : '') + this.myCurrentUtterance;
            if (text && !text.includes('vq_lbr_audio_')) {
                this.sendToRenderer('stt-update', {
                    speaker: 'Me',
                    text: continuousText,
                    isPartial: true,
                    isFinal: false,
                    timestamp: Date.now(),
                });
            }
        } else if (type === 'conversation.item.input_audio_transcription.completed') {
            if (text && text.trim()) {
                const finalUtteranceText = text.trim();
                this.myCurrentUtterance = '';
                this.debounceMyCompletion(finalUtteranceText);
            }
        }
    }
};
```

### 5. Debouncing and Finalization

**File**: [src/features/listen/stt/sttService.js](src/features/listen/stt/sttService.js) (lines 100-130)

Transcriptions are debounced to handle provider-specific timing:

```javascript
debounceMyCompletion(text) {
    if (this.modelInfo?.provider === 'gemini') {
        this.myCompletionBuffer += text;
    } else {
        this.myCompletionBuffer += (this.myCompletionBuffer ? ' ' : '') + text;
    }

    if (this.myCompletionTimer) clearTimeout(this.myCompletionTimer);
    this.myCompletionTimer = setTimeout(() => this.flushMyCompletion(), COMPLETION_DEBOUNCE_MS);
}
```

## LLM Processing Flow

### 1. Question Submission

**Entry Point**: [src/ui/ask/AskView.js](src/ui/ask/AskView.js)

When a user submits a question:

```javascript
handleSendText(event, text) {
    window.api.askView.sendMessage(text);
}
```

This triggers the IPC call which is handled by the feature bridge:

```javascript
// featureBridge.js
ipcMain.handle('ask:sendQuestionFromAsk', async (event, userPrompt) => {
    const conversationHistory = listenService.getConversationHistory();
    return await askService.sendMessageManual(userPrompt, conversationHistory);
});
```

### 2. Ask Service Processing

**File**: [src/features/ask/askService.js](src/features/ask/askService.js) (lines 280-550)

The ask service processes the request:

```javascript
async sendMessage(userPrompt, conversationHistoryRaw = []) {
    // Determine session type (meeting context or standalone)
    const listenService = require('../listen/listenService');
    const currentListenSessionId = listenService.getCurrentSessionData()?.sessionId || null;
    const isInMeeting = Boolean(currentListenSessionId);
    
    if (isInMeeting) {
        // Use existing meeting session
        sessionId = await sessionRepository.getOrCreateActive('listen');
    } else {
        // Create new session for standalone question
        sessionId = await sessionRepository.create('ask');
    }
    
    // Save user message to database
    await askRepository.addAiMessage({ sessionId, role: 'user', content: userPrompt.trim() });
    
    // Get current model information
    const modelInfo = await modelStateService.getCurrentModelInfo('llm');
    
    // Capture screenshot for context
    const screenshotResult = await captureScreenshot({ quality: 'medium' });
    
    // Build prompt with system instructions
    const systemPrompt = getSystemPrompt(profileToUse, contextForPrompt, false);
    
    const messages = [
        { role: 'system', content: systemPrompt },
        {
            role: 'user',
            content: [{ type: 'text', text: `${userTask}` }],
        },
    ];
    
    // Add screenshot if available
    if (screenshotBase64) {
        messages[1].content.push({
            type: 'image_url',
            image_url: { url: `data:image/jpeg;base64,${screenshotBase64}` },
        });
    }
    
    // Create streaming LLM client
    const streamingLLM = createStreamingLLM(modelInfo.provider, {
        apiKey: modelInfo.apiKey,
        model: modelInfo.model,
        temperature: 0.7,
        maxTokens: 2048,
    });
    
    // Send request and process stream
    const response = await streamingLLM.streamChat(messages, { signal });
    await this._processStream(reader, askWin, sessionId, signal);
}
```

### 3. Stream Processing

**File**: [src/features/ask/askService.js](src/features/ask/askService.js) (lines 550-650)

Streaming responses are processed token by token:

```javascript
async _processStream(reader, askWin, sessionId, signal) {
    const decoder = new TextDecoder();
    let fullResponse = '';
    
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(line => line.trim() !== '');

        for (const line of lines) {
            if (line.startsWith('data: ')) {
                const data = line.substring(6);
                if (data === '[DONE]') {
                    // Stream completed
                    return;
                }
                try {
                    const json = JSON.parse(data);
                    const token = json.choices[0]?.delta?.content || '';
                    if (token) {
                        fullResponse += token;
                        // Update UI with new content
                        this.state.currentResponse = fullResponse;
                        this._broadcastState();
                    }
                } catch (error) {
                    // Handle parsing errors
                }
            }
        }
    }
    
    // Save final response to database
    await askRepository.addAiMessage({ sessionId, role: 'assistant', content: fullResponse });
}
```

## Data Storage and Session Management

### Session Repository

**File**: [src/features/common/repositories/session/index.js](src/features/common/repositories/session/index.js)

Sessions are managed through a repository pattern:

```javascript
// Create or get active session
const sessionId = await sessionRepository.getOrCreateActive('listen');

// Create standalone session
const sessionId = await sessionRepository.create('ask');

// Save conversation turns
await sttRepository.addTranscript({
    sessionId: this.currentSessionId,
    speaker: speaker,
    text: transcription.trim(),
});
```

### Database Schema

Sessions are stored in SQLite with the following structure:

```sql
-- Sessions table
CREATE TABLE sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uid TEXT NOT NULL,
    type TEXT NOT NULL, -- 'listen' or 'ask'
    title TEXT,
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    ended_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Transcripts table (for STT)
CREATE TABLE stt_transcripts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    speaker TEXT NOT NULL,
    text TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES sessions(id)
);

-- AI Messages table (for Ask)
CREATE TABLE ai_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    role TEXT NOT NULL, -- 'user' or 'assistant'
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES sessions(id)
);
```

## UI Communication

### Renderer Process Communication

**File**: [src/preload.js](src/preload.js)

The preload script exposes APIs to the renderer process:

```javascript
// Expose STT update listener
onSttUpdate: callback => ipcRenderer.on('stt-update', callback),

// Expose ask state updates
onAskStateUpdate: callback => ipcRenderer.on('ask:stateUpdate', callback),

// Expose session state changes
onSessionStateChanged: callback => ipcRenderer.on('session-state-changed', callback),
```

### UI Component Updates

**Files**: 
- [src/ui/ask/AskView.js](src/ui/ask/AskView.js)
- [src/ui/listen/stt/SttView.js](src/ui/listen/stt/SttView.js)

UI components listen for updates and render accordingly:

```javascript
// In SttView.js
handleSttUpdate(event, { speaker, text, isFinal, isPartial }) {
    // Update transcription display
    const newMessages = [...this.sttMessages];
    // Handle partial vs final updates
    // Update component state
    this.sttMessages = newMessages;
}

// In AskView.js
window.api.askView.onAskStateUpdate((event, newState) => {
    // Update UI with streaming response
    this.currentResponse = newState.currentResponse;
    this.isLoading = newState.isLoading;
    this.isStreaming = newState.isStreaming;
    // Trigger UI update
    this.requestUpdate();
});
```

## Provider Implementations

### AI Factory Pattern

**File**: [src/features/common/ai/factory.js](src/features/common/ai/factory.js)

The factory provides a unified interface for creating providers:

```javascript
function createSTT(provider, opts) {
    const handler = PROVIDERS[provider]?.handler();
    if (!handler?.createSTT) {
        throw new Error(`STT not supported for provider: ${provider}`);
    }
    return handler.createSTT(opts);
}

function createStreamingLLM(provider, opts) {
    const handler = PROVIDERS[provider]?.handler();
    if (!handler?.createStreamingLLM) {
        throw new Error(`Streaming LLM not supported for provider: ${provider}`);
    }
    return handler.createStreamingLLM(opts);
}
```

### OpenAI Provider Implementation

**File**: [src/features/common/ai/providers/openai.js](src/features/common/ai/providers/openai.js)

OpenAI provider implementation for both STT and LLM:

```javascript
// STT implementation using WebSocket
async function createSTT({ apiKey, language = 'en', callbacks = {} }) {
    const wsUrl = 'wss://api.openai.com/v1/realtime?intent=transcription';
    const ws = new WebSocket(wsUrl, { headers });

    return new Promise((resolve, reject) => {
        ws.onopen = () => {
            // Configure session
            const sessionConfig = {
                type: 'transcription_session.update',
                session: {
                    input_audio_format: 'pcm16',
                    input_audio_transcription: {
                        model: 'gpt-4o-mini-transcribe',
                        language: language || 'en',
                    },
                    // ... other configuration
                },
            };
            ws.send(JSON.stringify(sessionConfig));

            resolve({
                sendRealtimeInput: audioData => {
                    if (ws.readyState === WebSocket.OPEN) {
                        const message = {
                            type: 'input_audio_buffer.append',
                            audio: audioData,
                        };
                        ws.send(JSON.stringify(message));
                    }
                },
                close: () => {
                    // Close WebSocket connection
                },
            });
        };

        ws.onmessage = event => {
            // Process incoming messages
            let msg;
            try {
                msg = JSON.parse(event.data);
            } catch {
                return;
            }
            callbacks.onmessage?.(msg);
        };
    });
}

// LLM implementation using REST API
function createStreamingLLM({ apiKey, model = 'gpt-4.1', temperature = 0.7 }) {
    const client = new OpenAI({ apiKey });

    return {
        streamChat: async (messages, { signal }) => {
            const stream = await client.chat.completions.create({
                model: model,
                messages: messages,
                temperature: temperature,
                stream: true,
            }, { signal });

            // Return readable stream
            return new Response(
                new ReadableStream({
                    async start(controller) {
                        try {
                            for await (const chunk of stream) {
                                controller.enqueue(
                                    `data: ${JSON.stringify(chunk)}\n\n`
                                );
                            }
                            controller.enqueue('data: [DONE]\n\n');
                            controller.close();
                        } catch (error) {
                            controller.error(error);
                        }
                    }
                }),
                { headers: { 'Content-Type': 'text/event-stream' } }
            );
        }
    };
}
```

This technical documentation provides detailed insights into the implementation of STT and LLM processing flows in the WhisperV2 system, including specific code paths, data handling, and integration points.