# STT End-to-End Flow

## 1. User Trigger
- File: src/ui/app/MainHeader.js:241
- What happens when the user clicks "Listen".
  - Button text cycles per state: beforeSession → "Listen", inSession → "Stop", afterSession → "Done".
  - On click, invokes `window.api.mainHeader.sendListenButtonClick(listenButtonText)` → IPC `listen:changeSession`.

## 2. Renderer → Main IPC
| Channel | Payload Shape | Purpose |
|---------|---------------|---------|
| `listen:changeSession` | `'Listen'|'Stop'|'Done'` | Toggle session state |
| `listen:sendMicAudio` | `{ data: base64, mimeType: 'audio/pcm;rate=24000' }` | Send mic PCM chunks |
| `listen:sendSystemAudio` | `{ data: base64, mimeType: 'audio/pcm;rate=24000' }` | Send system PCM chunks (Win/Linux) |
| `listen:startMacosSystemAudio` | none | Start macOS loopback capture (native helper) |
| `listen:stopMacosSystemAudio` | none | Stop macOS loopback capture |
| `listen:isSessionActive` | none | Query STT session readiness |

Main → Renderer (events):
- `listen:changeSessionResult` → `MainHeader` state machine feedback
- `session-state-changed` → `{ isActive: boolean }` → `ListenView` runtime state
- `stt-update` → `{ speaker, text, isPartial, isFinal, timestamp }` → transcript updates
- `system-audio-data` → `{ data: base64 }` → renderer AEC reference
- `change-listen-capture-state` → `{ status: 'start'|'stop' }` → start/stop local capture

References:
- Preload: src/preload.js:71, 76, 216–233
- Bridge: src/bridge/featureBridge.js:86–107

## 3. Main-Process Orchestration
- Entry file: src/bridge/featureBridge.js:86
- Handler function: `ipcMain.handle('listen:changeSession', ...)` → `listenService.handleListenRequest()`
- Pseudo-code:
  - Switch on `listenButtonText`:
    - "Listen":
      - Show `listen` window, initialize STT if needed: `initializeSession()`
      - If already active, sync history: send `listen:sync-conversation-history`
      - Emit `session-state-changed { isActive: true }`
    - "Stop":
      - `pauseSession()` → closes STT sockets, stops system capture, keeps DB session
      - Emit `session-state-changed { isActive: false }`
    - "Done":
      - `closeSession()` → closes STT sockets, stops capture, ends DB session, triggers meeting title generation
      - Hide `listen` window, emit `session-state-changed { isActive: false }`
  - Reply to header: `listen:changeSessionResult { success: boolean }`
- Orchestration: src/features/listen/listenService.js:56–109, 169–220, 241–260

## 4. STT Session Creation
- Factory call site: src/features/listen/stt/sttService.js:402–405
- Google Live WebSocket opened here: src/features/common/ai/providers/gemini.js:42 (`liveClient.live.connect(...)`)
- Code snippet (≤ 30 lines) of the `createSTT` function:
```js
// src/features/common/ai/providers/gemini.js:36
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

## 5. Microphone → Google
- Mic library: Web Audio API (`getUserMedia` + `ScriptProcessorNode`)
- Event emitter: `micProcessor.onaudioprocess` chunks 0.1s at 24kHz, converts to Int16 PCM, base64
- Pipe line: `mic → listen:sendMicAudio → sttService.sendMicAudioContent → mySttSession.sendRealtimeInput(...)`
  - Renderer send: src/ui/listen/audioCore/listenCapture.js:315–336
  - Bridge IPC: src/bridge/featureBridge.js:86
  - Main methods: src/features/listen/listenService.js:222–224; src/features/listen/stt/sttService.js:480–505
  - Send line: src/features/listen/stt/sttService.js:503

System audio (Them):
- macOS: native helper `SystemAudioDump` spawned; stdout chunked and sent directly to STT
  - Start/pipe: src/features/listen/stt/sttService.js:563–646; send line: 626
- Win/Linux: renderer captures system loopback and sends via `listen:sendSystemAudio`
  - Renderer send: src/ui/listen/audioCore/listenCapture.js:388–406
  - Main send: src/features/listen/stt/sttService.js:527

## 6. Google → Renderer
- Shape of `msg` from Google (Gemini Live):
  - Partial text: `msg.serverContent?.inputTranscription?.text`
  - Turn complete: `msg.serverContent?.turnComplete === true`
  - Usage metadata: `msg.serverContent?.usageMetadata`
- Main forwards:
  - `listenWindow.webContents.send('stt-update', { speaker, text, isPartial, isFinal, timestamp })`
  - Lines: src/features/listen/stt/sttService.js:225–231 (Me, partial), 87–93 (Me, final), 337–343 (Them, partial), 114–120 (Them, final)

## 7. Renderer → UI
- File that listens: src/ui/listen/stt/SttView.js:28
  - Registers: `window.api.sttView.onSttUpdate(this.handleSttUpdate)`
- How text lands in DOM:
  - `handleSttUpdate(_, { speaker, text, isFinal, isPartial })` maintains `sttMessages` and renders
  - Update/render: src/ui/listen/stt/SttView.js:38–106, 146–209

## 8. Error & State Propagation
- `listenSessionStatus` updated in header via `listen:changeSessionResult`
  - src/ui/app/MainHeader.js:168–186, 116–143 (state handler and toggle flow)
- Session state to `ListenView`: `session-state-changed { isActive }`
  - Emitted: src/features/listen/listenService.js:78–80, 86–88, 95
  - Consumed: src/ui/listen/ListenView.js:43–68
- Capture control: `change-listen-capture-state { status }` → renderer starts/stops local capture
  - Emit: src/features/listen/listenService.js:218, 243
  - Consume: src/ui/listen/audioCore/renderer.js:12–22
- STT errors:
  - Provider message errors logged: src/features/listen/stt/sttService.js:259–261, 370–372
  - OpenAI WS errors via callbacks: src/features/common/ai/providers/openai.js:127–140
- Status updates (info-only):
  - Main emits `'update-status'` strings (no renderer listeners present)

## 9. Shutdown
- Stop button → `listen:changeSession('Stop')` → `listenService.pauseSession()` → `sttService.closeSessions()` → session sockets `.close()`, timers cleared
  - src/features/listen/listenService.js:83–89, 268–307
  - Provider close:
    - Gemini: `session.close()` src/features/common/ai/providers/gemini.js:61–63
    - OpenAI: send `{type:'session.close'}` then `.close()` src/features/common/ai/providers/openai.js:100–106
- Done button → additionally ends DB session and hides listen window
  - src/features/listen/listenService.js:91–99, 241–260

## 10. Files That Touch STT (single source of truth list)
- src/preload.js
- src/bridge/featureBridge.js
- src/features/listen/listenService.js
- src/features/listen/stt/sttService.js
- src/features/common/ai/factory.js
- src/features/common/ai/providers/gemini.js
- src/features/common/ai/providers/openai.js
- src/ui/app/MainHeader.js
- src/ui/listen/ListenView.js
- src/ui/listen/stt/SttView.js
- src/ui/listen/audioCore/listenCapture.js
- src/ui/listen/audioCore/renderer.js

