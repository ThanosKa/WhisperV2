# STT How-To (Current Implementation and Server-Side Migration Guide)

## Scope

- This document explains ONLY the Speech-to-Text (STT) path.
- Covers: where the WebSocket is opened, how Mic (Me) and System (Them) audio are sent, what payloads we send to Gemini, what we receive back, and which files are involved.
- Ends with a practical checklist for migrating the STT WebSocket and API keys to a server-side service.

## Key Files

- `src/features/common/ai/providers/gemini.js` — opens Gemini Live session and wraps send/close
- `src/features/common/ai/factory.js` — provider factory (`createSTT('gemini', opts)`)
- `src/features/listen/stt/sttService.js` — owns two STT sessions (Me/Them), handles messages, forwards UI events
- `src/features/listen/listenService.js` — orchestrates session lifecycle (init/pause/resume/done) and renderer events
- `src/bridge/featureBridge.js` — IPC handlers for Listen feature (mic/system audio in, session change)
- Renderer capture (not covered here in detail): `src/ui/listen/audioCore/listenCapture.js`

## 1) Where the WebSocket Is Opened

The Gemini Live realtime connection is opened inside `createSTT`:

```12:39:src/features/common/ai/providers/gemini.js
async function createSTT({ apiKey, language = 'en-US', callbacks = {}, ...config }) {
    const liveClient = new GoogleGenAI({ vertexai: false, apiKey });
    const lang = language.includes('-') ? language : `${language}-US`;
    const session = await liveClient.live.connect({
        model: 'gemini-live-2.5-flash-preview',
        callbacks: {
            ...callbacks,
            onMessage: msg => {
                if (!msg || typeof msg !== 'object') return;
                console.log('[Gemini STT Message]:', msg);
                msg.provider = 'gemini';
                callbacks.onmessage?.(msg);
            },
        },
        config: { inputAudioTranscription: {}, speechConfig: { languageCode: lang } },
    });
    return {
        sendRealtimeInput: async payload => session.sendRealtimeInput(payload),
        close: async () => session.close(),
    };
}
```

- The `factory` routes STT creation to this function:

```16:31:src/features/common/ai/factory.js
function createSTT(provider, opts) {
    if (provider !== 'gemini') {
        throw new Error(`STT not supported for provider: ${provider}`);
    }
    const handler = PROVIDERS[provider]?.handler();
    if (!handler?.createSTT) {
        throw new Error(`STT not supported for provider: ${provider}`);
    }
    if (opts && opts.model) {
        opts = { ...opts, model: sanitizeModelId(opts.model) };
    }
    return handler.createSTT(opts);
}
```

## 2) Session Ownership (Me/Them)

Two parallel sessions are created and managed in `SttService`:

```375:405:src/features/listen/stt/sttService.js
const mySttConfig = { callbacks: { onmessage: handleMyMessage, onerror: ..., onclose: ... } };
const theirSttConfig = { callbacks: { onmessage: handleTheirMessage, onerror: ..., onclose: ... } };
const sttOptions = { apiKey: this.modelInfo.apiKey, language: effectiveLanguage };
const myOptions = { ...sttOptions, callbacks: mySttConfig.callbacks, sessionType: 'my' };
const theirOptions = { ...sttOptions, callbacks: theirSttConfig.callbacks, sessionType: 'their' };
[this.mySttSession, this.theirSttSession] = await Promise.all([
  createSTT(this.modelInfo.provider, myOptions),
  createSTT(this.modelInfo.provider, theirOptions),
]);
```

- `Me` (microphone) uses `mySttSession`.
- `Them` (system/loopback audio) uses `theirSttSession`.

## 3) What We Send (Payloads to Gemini)

All audio is 24kHz 16-bit PCM mono for STT, base64-encoded.

- Mic → Me:

```480:505:src/features/listen/stt/sttService.js
async sendMicAudioContent(data, mimeType) {
  if (!this.mySttSession) throw new Error('User STT session not active');
  let payload;
  if (modelInfo.provider === 'gemini') {
    payload = { audio: { data, mimeType: mimeType || 'audio/pcm;rate=24000' } };
  } else {
    payload = data;
  }
  await this.mySttSession.sendRealtimeInput(payload);
}
```

- System → Them (Windows/Linux via renderer, macOS via native helper):

```520:528:src/features/listen/stt/sttService.js
if (modelInfo.provider === 'gemini') {
  payload = { audio: { data, mimeType: mimeType || 'audio/pcm;rate=24000' } };
} else {
  payload = data;
}
await this.theirSttSession.sendRealtimeInput(payload);
```

- macOS native loopback capture path constructs the same payload per chunk:

```618:627:src/features/listen/stt/sttService.js
if (this.theirSttSession) {
  let payload;
  if (modelInfo.provider === 'gemini') {
    payload = { audio: { data: base64Data, mimeType: 'audio/pcm;rate=24000' } };
  } else {
    payload = base64Data;
  }
  await this.theirSttSession.sendRealtimeInput(payload);
}
```

IPC entry points for audio from renderer:

```86:93:src/bridge/featureBridge.js
ipcMain.handle('listen:sendMicAudio', (e, { data, mimeType }) => listenService.handleSendMicAudioContent(data, mimeType));
ipcMain.handle('listen:sendSystemAudio', async (e, { data, mimeType }) => {
  const result = await listenService.sttService.sendSystemAudioContent(data, mimeType);
  if (result.success) listenService.sendToRenderer('system-audio-data', { data });
  return result;
});
```

## 4) What We Receive (Messages from Gemini)

Gemini Live delivers events to the `onMessage` callback set in `createSTT`. The `SttService` handlers parse:

- Me handler (partial + turnComplete):

```206:231:src/features/listen/stt/sttService.js
const transcription = message.serverContent?.inputTranscription;
const textChunk = transcription?.text || '';
const turnComplete = !!message.serverContent?.turnComplete;
if (message.serverContent?.turnComplete) {
  if (this.myCompletionTimer) { clearTimeout(this.myCompletionTimer); this.flushMyCompletion(); }
  return;
}
if (!transcription || !textChunk.trim() || textChunk.trim() === '<noise>') return;
this.debounceMyCompletion(textChunk);
this.sendToRenderer('stt-update', { speaker: 'Me', text: this.myCompletionBuffer, isPartial: true, isFinal: false, timestamp: Date.now() });
```

- Them handler (partial + usage + turnComplete):

```309:343:src/features/listen/stt/sttService.js
if (message?.serverContent?.usageMetadata) {
  console.log('[Gemini STT - Them] Tokens In:', message.serverContent.usageMetadata.promptTokenCount);
  console.log('[Gemini STT - Them] Tokens Out:', message.serverContent.usageMetadata.candidatesTokenCount);
}
const transcription = message.serverContent?.inputTranscription;
const textChunk = transcription?.text || '';
const turnComplete = !!message.serverContent?.turnComplete;
if (message.serverContent?.turnComplete) {
  if (this.theirCompletionTimer) { clearTimeout(this.theirCompletionTimer); this.flushTheirCompletion(); }
  return;
}
if (!transcription || !textChunk.trim() || textChunk.trim() === '<noise>') return;
this.debounceTheirCompletion(textChunk);
this.sendToRenderer('stt-update', { speaker: 'Them', text: this.theirCompletionBuffer, isPartial: true, isFinal: false, timestamp: Date.now() });
```

- When a turn completes, `flushMyCompletion` / `flushTheirCompletion` emit finals to the renderer:

```86:93:src/features/listen/stt/sttService.js
this.sendToRenderer('stt-update', { speaker: 'Me', text: finalText, isPartial: false, isFinal: true, timestamp: Date.now() });
```

```114:120:src/features/listen/stt/sttService.js
this.sendToRenderer('stt-update', { speaker: 'Them', text: finalText, isPartial: false, isFinal: true, timestamp: Date.now() });
```

Renderer listens and renders text in `SttView` (see STT-DEEP-DIVE for UI details).

## 5) Session Lifecycle and Control

- Session start/stop is orchestrated in `listenService` and bridged via IPC:

```98:107:src/bridge/featureBridge.js
ipcMain.handle('listen:changeSession', async (e, listenButtonText) => listenService.handleListenRequest(listenButtonText));
```

```56:121:src/features/listen/listenService.js
switch (listenButtonText) {
  case 'Listen': await this.initializeSession(); emit('session-state-changed', { isActive: true }); break;
  case 'Stop':   await this.pauseSession();     emit('session-state-changed', { isActive: false }); break;
  case 'Resume': await this.resumeSession();    emit('session-state-changed', { isActive: true }); break;
  case 'Done':   await this.closeSession();     emit('session-state-changed', { isActive: false }); break;
}
```

- STT session creation with retry, then renderer capture starts:

```199:233:src/features/listen/listenService.js
for (attempt=1..MAX_RETRY) { await this.sttService.initializeSttSessions(language); }
this.sendToRenderer('change-listen-capture-state', { status: 'start' });
```

- The STT service also schedules keep-alives/renewals to avoid idle or hard timeouts:

```409:444:src/features/listen/stt/sttService.js
this.keepAliveInterval = setInterval(() => this._sendKeepAlive(), 30000);
this.sessionRenewTimeout = setTimeout(() => this.renewSessions(language), 4*60*1000);
```

## 6) End-to-End Shape Summary

- To Gemini (per audio chunk):
    - Payload: `{ audio: { data: <base64 PCM>, mimeType: 'audio/pcm;rate=24000' } }`
    - Sent via: `session.sendRealtimeInput(payload)`
    - Separate sessions for Me and Them
- From Gemini (events):
    - Partial text: `message.serverContent?.inputTranscription?.text`
    - Turn complete: `message.serverContent?.turnComplete === true`
    - Usage: `message.serverContent?.usageMetadata` (optional)
    - UI updates: main process forwards `'stt-update'` with `{ speaker, text, isPartial, isFinal, timestamp }`

## 7) Migrating STT to Server-Side (Keep API keys off the client)

Goal: move Gemini Live WebSocket and API key usage from the Electron main process to a backend service. The renderer still captures audio, but it posts chunks to your server, which forwards them to Gemini and streams messages back.

### Server Requirements

- Securely store Gemini API key(s) (e.g., KMS/KeyVault/SecretManager)
- Open and maintain two Gemini Live sessions per client session (Me/Them)
- Accept base64 PCM audio chunks from client for Me and Them
- Forward chunks to corresponding Gemini session via `sendRealtimeInput({ audio: { data, mimeType } })`
- Stream provider messages back to client with minimal latency (WebSocket or Server-Sent Events)
- Implement turn-complete handling and partial/final aggregation compatible with current client expectations
- Enforce auth, rate limits, and connection lifecycle (keep-alive, auto-renew)
