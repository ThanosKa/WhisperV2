# STT How‑To (Server‑Side Relay Edition)

This doc reflects the current server‑side STT implementation. We no longer open provider SDK sessions in the client. Instead, the Electron main process connects to a backend STT relay over WebSocket. For a broader architectural overview, see `docs/listen-stt-architecture.md`.

## Key Files

- `src/features/listen/stt/sttService.js` — relay WebSocket client, owns Me/Them wrappers, parses relay events, forwards UI updates
- `src/features/listen/listenService.js` — orchestrates session lifecycle and renderer capture
- `src/bridge/featureBridge.js` — IPC handlers (mic/system audio in, session change)
- Renderer capture: `src/ui/listen/audioCore/listenCapture.js`, `src/ui/listen/audioCore/renderer.js`
- Transcript UI: `src/ui/listen/stt/SttView.js`

## 1) Where the WebSocket Is Opened (Relay)

Relay URL resolution:

```9:10:src/features/listen/stt/sttService.js
const DEFAULT_RELAY_URL = process.env.STT_RELAY_URL || config.get('sttRelayUrl') || 'ws://localhost:8080';
```

Connection and protocol handling:

```416:474:src/features/listen/stt/sttService.js
async _openRelayConnection({ language, handleMyMessage, handleTheirMessage }) {
    if (!DEFAULT_RELAY_URL) {
        throw new Error('STT relay URL is not configured.');
    }
    if (this.relaySocket) {
        await this._closeRelayConnection(false);
    }
    this.relayReady = false;
    return new Promise((resolve, reject) => {
        const relayUrl = DEFAULT_RELAY_URL;
        let settled = false;
        const settleResolve = () => { if (!settled) { settled = true; resolve(true); } };
        const settleReject = error => { if (!settled) { settled = true; reject(error); } };
        const sessionUuid = authService?.getCurrentUser()?.sessionUuid;
        if (!sessionUuid) { return settleReject(new Error('STT relay connection blocked: missing authenticated session')); }
        const socket = new WebSocket(relayUrl, { headers: { 'X-Session-UUID': sessionUuid } });
        this.relaySocket = socket;
        socket.on('open', () => {
            this.relaySessionId = randomUUID();
            const openPayload = { type: 'OPEN', sessionId: this.relaySessionId, language, streams: ['me', 'them'] };
            socket.send(JSON.stringify(openPayload));
        });
```

Incoming messages mapped to local handlers and UI:

```492:552:src/features/listen/stt/sttService.js
switch (message.type) {
    case 'CONNECTED':
        this._installRelaySessions();
        this.relayReady = true;
        settleResolve();
        if (this.onStatusUpdate) this.onStatusUpdate('Listening...');
        break;
    case 'PARTIAL':
        if (message.text && message.text !== '<noise>') {
            dispatch({ serverContent: { inputTranscription: { text: message.text } } });
        }
        break;
    case 'TURN_COMPLETE':
        dispatch({ serverContent: { turnComplete: true } });
        break;
    case 'USAGE':
        dispatch({ serverContent: { usageMetadata: { promptTokenCount: message.promptTokens, candidatesTokenCount: message.candidateTokens } } });
        break;
}
```

## 2) Session Ownership (Me/Them wrappers)

Relay session wrappers are installed after CONNECTED:

```576:587:src/features/listen/stt/sttService.js
_installRelaySessions() {
    const closeRelay = () => this._closeRelayConnection();
    this.meSttSession = { sendRealtimeInput: payload => this._sendRelayAudio('me', payload), close: closeRelay };
    this.themSttSession = { sendRealtimeInput: payload => this._sendRelayAudio('them', payload), close: closeRelay };
}
```

Sending audio to the relay:

```590:609:src/features/listen/stt/sttService.js
_sendRelayAudio(stream, payload) {
    if (!this.relaySocket || this.relaySocket.readyState !== WebSocket.OPEN) throw new Error('Relay connection not ready');
    const audioPayload = payload?.audio || {};
    const data = audioPayload.data || payload?.data || payload;
    if (!data || typeof data !== 'string') throw new Error('Invalid audio payload');
    const message = { type: 'AUDIO', sessionId: this.relaySessionId, stream, mimeType: audioPayload.mimeType || payload?.mimeType || 'audio/pcm;rate=24000', data };
    this.relaySocket.send(JSON.stringify(message));
}
```

## 3) What We Send (Payloads to Relay)

All audio is 24 kHz, 16‑bit PCM, mono, Base64.

- Mic → Me

```378:394:src/features/listen/stt/sttService.js
async sendMicAudioContent(data, mimeType) {
    if (!this.meSttSession) throw new Error('User STT session not active');
    const payload = { audio: { data, mimeType: mimeType || 'audio/pcm;rate=24000' } };
    await this.meSttSession.sendRealtimeInput(payload);
}
```

- System → Them (Win/Linux from renderer; macOS via native helper)

```396:414:src/features/listen/stt/sttService.js
async sendSystemAudioContent(data, mimeType) {
    if (!this.themSttSession) throw new Error('Them STT session not active');
    const payload = { audio: { data, mimeType: mimeType || 'audio/pcm;rate=24000' } };
    await this.themSttSession.sendRealtimeInput(payload);
    return { success: true };
}
```

macOS native loopback capture path constructs the same payload per chunk.

## 4) What We Receive (Relay → Client → UI)

Gemini‑shaped events via relay are parsed to partials/finals; finals are flushed through debounced completion:

```194:220:src/features/listen/stt/sttService.js
const transcription = message.serverContent?.inputTranscription;
const textChunk = transcription?.text || '';
if (message.serverContent?.turnComplete) { if (this.myCompletionTimer) { clearTimeout(this.myCompletionTimer); this.flushMyCompletion(); } return; }
if (!transcription || !textChunk.trim() || textChunk.trim() === '<noise>') return;
this.debounceMyCompletion(textChunk);
this.sendToRenderer('stt-update', { speaker: 'Me', text: this.myCompletionBuffer, isPartial: true, isFinal: false, timestamp: Date.now() });
```

Final emission helpers:

```65:82:src/features/listen/stt/sttService.js
this.sendToRenderer('stt-update', { speaker: 'Me', text: finalText, isPartial: false, isFinal: true, timestamp: Date.now() });
```

```101:109:src/features/listen/stt/sttService.js
this.sendToRenderer('stt-update', { speaker: 'Them', text: finalText, isPartial: false, isFinal: true, timestamp: Date.now() });
```

Renderer subscribes and renders in `SttView`.

## 5) Session Lifecycle and Control

IPC entry for session state machine:

```98:107:src/bridge/featureBridge.js
ipcMain.handle('listen:changeSession', async (event, listenButtonText) => {
    try { await listenService.handleListenRequest(listenButtonText); return { success: true }; } catch (e) { return { success: false, error: e.message }; }
});
```

On successful init we connect the relay and then start renderer capture:

```214:246:src/features/listen/listenService.js
const sessionInitialized = await this.initializeNewSession();
// retry loop...
await this.sttService.initializeSttSessions(language);
this.sendToRenderer('update-status', 'Connected. Ready to listen.');
this.sendToRenderer('change-listen-capture-state', { status: 'start' });
```

## 6) End‑to‑End Shape Summary

- To relay (per audio chunk): `{ type: 'AUDIO', sessionId, stream: 'me'|'them', mimeType: 'audio/pcm;rate=24000', data: '<base64>' }`
- From relay (events): `CONNECTED`, `PARTIAL { text }`, `TURN_COMPLETE`, `USAGE { promptTokens, candidateTokens }`, `ERROR`
- UI updates: main forwards `stt-update { speaker, text, isPartial, isFinal, timestamp }`

## 7) Configuration & Auth

- `STT_RELAY_URL` env or `config.get('sttRelayUrl')`; defaults to `ws://localhost:8080`
- Auth header: `X-Session-UUID` added to the relay WebSocket request

## 8) Post‑Migration Cleanup Notes

- Direct provider STT on client is deprecated. The legacy shim remains only for Settings UI compatibility.
- File `src/features/common/ai/providers/gemini.js` now exports a lightweight `GeminiProvider` (no SDK import) and a deprecated `createSTT()` stub.
- `createSTT()` should not be used; STT always goes through the relay.

Refer also to `docs/listen-stt-architecture.md` for the authoritative architecture.
