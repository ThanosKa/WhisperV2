# WhisperV2 Integration Snippets Reference

This document provides key code snippets showing how STT and LLM functionality is integrated throughout the WhisperV2 system.

## Table of Contents
1. [STT Integration Points](#stt-integration-points)
2. [LLM Integration Points](#llm-integration-points)
3. [Data Flow Examples](#data-flow-examples)
4. [UI Communication](#ui-communication)
5. [Provider Implementation Examples](#provider-implementation-examples)

## STT Integration Points

### 1. Session Initialization

```javascript
// In listenService.js
async initializeSession(language = 'en') {
    // Initialize database session
    const sessionInitialized = await this.initializeNewSession();
    
    // Initialize STT sessions with retry logic
    const MAX_RETRY = 10;
    let sttReady = false;
    for (let attempt = 1; attempt <= MAX_RETRY; attempt++) {
        try {
            await this.sttService.initializeSttSessions(language);
            sttReady = true;
            break;
        } catch (err) {
            if (attempt < MAX_RETRY) {
                await new Promise(r => setTimeout(r, 300));
            }
        }
    }
}
```

### 2. Audio Data Handling

```javascript
// In sttService.js
async sendMicAudioContent(data, mimeType) {
    let modelInfo = this.modelInfo;
    let payload;
    
    if (modelInfo.provider === 'gemini') {
        payload = { audio: { data, mimeType: mimeType || 'audio/pcm;rate=24000' } };
    } else {
        payload = data;
    }
    
    await this.mySttSession.sendRealtimeInput(payload);
}
```

### 3. Transcription Event Handling

```javascript
// In sttService.js
const handleMyMessage = message => {
    if (this.modelInfo.provider === 'gemini') {
        const transcription = message.serverContent?.inputTranscription;
        const textChunk = transcription?.text || '';
        const turnComplete = !!message.serverContent?.turnComplete;

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

## LLM Integration Points

### 1. Message Sending

```javascript
// In askService.js
async sendMessage(userPrompt, conversationHistoryRaw = []) {
    // Session management
    const listenService = require('../listen/listenService');
    const currentListenSessionId = listenService.getCurrentSessionData()?.sessionId || null;
    const isInMeeting = Boolean(currentListenSessionId);
    
    if (isInMeeting) {
        sessionId = await sessionRepository.getOrCreateActive('listen');
    } else {
        sessionId = await sessionRepository.create('ask');
    }
    
    // Save user message
    await askRepository.addAiMessage({ sessionId, role: 'user', content: userPrompt.trim() });
    
    // Get model info
    const modelInfo = await modelStateService.getCurrentModelInfo('llm');
    
    // Build prompt with context
    const conversationHistory = this._formatConversationForPrompt(conversationHistoryRaw);
    const systemPrompt = getSystemPrompt(profileToUse, conversationHistory, false);
    
    // Create messages array
    const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: [{ type: 'text', text: userPrompt.trim() }] }
    ];
    
    // Add screenshot if available
    const screenshotResult = await captureScreenshot({ quality: 'medium' });
    if (screenshotResult.success) {
        messages[1].content.push({
            type: 'image_url',
            image_url: { url: `data:image/jpeg;base64,${screenshotResult.base64}` }
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
    const response = await streamingLLM.streamChat(messages, { signal: this.abortController.signal });
    await this._processStream(response.body.getReader(), askWin, sessionId, this.abortController.signal);
}
```

### 2. Streaming Response Processing

```javascript
// In askService.js
async _processStream(reader, askWin, sessionId, signal) {
    const decoder = new TextDecoder();
    let fullResponse = '';
    
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split('\n').filter(line => line.trim() !== '');

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.substring(6);
                    if (data === '[DONE]') {
                        return; // Stream completed
                    }
                    
                    try {
                        const json = JSON.parse(data);
                        const token = json.choices[0]?.delta?.content || '';
                        if (token) {
                            fullResponse += token;
                            this.state.currentResponse = fullResponse;
                            this._broadcastState();
                        }
                    } catch (error) {
                        // Handle parsing errors
                    }
                }
            }
        }
    } finally {
        // Save final response
        if (fullResponse) {
            await askRepository.addAiMessage({ 
                sessionId, 
                role: 'assistant', 
                content: fullResponse 
            });
        }
    }
}
```

## Data Flow Examples

### 1. STT Data Flow

```javascript
// 1. Audio capture (listenCapture.js)
ipcRenderer.invoke('listen:sendMicAudio', { data: base64Audio, mimeType: 'audio/webm' });

// 2. Feature bridge handling (featureBridge.js)
ipcMain.handle('listen:sendMicAudio', async (event, { data, mimeType }) => {
    return await listenService.handleSendMicAudioContent(data, mimeType);
});

// 3. Listen service forwarding (listenService.js)
async handleSendMicAudioContent(data, mimeType) {
    return await this.sttService.sendMicAudioContent(data, mimeType);
}

// 4. STT service processing (sttService.js)
async sendMicAudioContent(data, mimeType) {
    // Format and send to provider session
    await this.mySttSession.sendRealtimeInput(payload);
}

// 5. Provider WebSocket message handling
ws.onmessage = event => {
    let msg = JSON.parse(event.data);
    callbacks.onmessage?.(msg); // Forward to STT service
};

// 6. STT service processing transcription
const handleMyMessage = message => {
    // Process and debounce transcription
    this.debounceMyCompletion(text);
    
    // Send to UI
    this.sendToRenderer('stt-update', {
        speaker: 'Me',
        text: finalText,
        isPartial: false,
        isFinal: true,
    });
};

// 7. Save to database
await this.saveConversationTurn(speaker, text);
```

### 2. LLM Data Flow

```javascript
// 1. UI question submission (AskView.js)
window.api.askView.sendMessage(userQuestion);

// 2. Preload API call (preload.js)
sendMessage: text => ipcRenderer.invoke('ask:sendQuestionFromAsk', text)

// 3. Feature bridge handling (featureBridge.js)
ipcMain.handle('ask:sendQuestionFromAsk', async (event, userPrompt) => {
    const conversationHistory = listenService.getConversationHistory();
    return await askService.sendMessageManual(userPrompt, conversationHistory);
});

// 4. Ask service processing (askService.js)
async sendMessage(userPrompt, conversationHistoryRaw = []) {
    // Session management, prompt building, etc.
    const response = await streamingLLM.streamChat(messages, { signal });
    await this._processStream(reader, askWin, sessionId, signal);
}

// 5. Stream processing and UI updates
this.state.currentResponse = fullResponse;
this._broadcastState(); // Sends to renderer

// 6. Save to database
await askRepository.addAiMessage({ sessionId, role: 'assistant', content: fullResponse });
```

## UI Communication

### 1. STT Updates to UI

```javascript
// In sttService.js
this.sendToRenderer('stt-update', {
    speaker: 'Me',
    text: finalText,
    isPartial: false,
    isFinal: true,
});

// In preload.js
onSttUpdate: callback => ipcRenderer.on('stt-update', callback),

// In SttView.js
window.api.sttView.onSttUpdate((event, { speaker, text, isFinal, isPartial }) => {
    // Update component state with new transcription
    this.handleSttUpdate(event, { speaker, text, isFinal, isPartial });
});
```

### 2. LLM Response Streaming to UI

```javascript
// In askService.js
this._broadcastState(); // Sends current state to renderer

// In preload.js
onAskStateUpdate: callback => ipcRenderer.on('ask:stateUpdate', callback),

// In AskView.js
window.api.askView.onAskStateUpdate((event, newState) => {
    // Update UI with streaming response
    this.currentResponse = newState.currentResponse;
    this.isLoading = newState.isLoading;
    this.isStreaming = newState.isStreaming;
    this.requestUpdate(); // Trigger UI re-render
});
```

## Provider Implementation Examples

### 1. Factory Pattern Usage

```javascript
// In factory.js
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

### 2. OpenAI Provider Implementation

```javascript
// In openai.js - STT implementation
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
                        language: language,
                    },
                },
            };
            ws.send(JSON.stringify(sessionConfig));

            resolve({
                sendRealtimeInput: audioData => {
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({
                            type: 'input_audio_buffer.append',
                            audio: audioData,
                        }));
                    }
                },
                close: () => {
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.close(1000, 'Client initiated close.');
                    }
                },
            });
        };

        ws.onmessage = event => {
            let msg;
            try {
                msg = JSON.parse(event.data);
            } catch {
                return;
            }
            msg.provider = 'openai';
            callbacks.onmessage?.(msg);
        };
    });
}

// In openai.js - LLM implementation
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

This reference document provides concise code snippets showing the key integration points for STT and LLM functionality in the WhisperV2 system.