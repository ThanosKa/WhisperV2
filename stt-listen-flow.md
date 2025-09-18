# STT Listen Flow

This document summarizes the speech-to-text (STT) pipeline that powers the Listen experience. It focuses on how a user action in the UI results in audio capture, Gemini Live streaming, and transcript updates back in the renderer.

## 1. High-Level Sequence

1. User toggles the Listen button in the header UI.
2. Renderer invokes an IPC channel exposed by the preload script.
3. The main process (`listenService`) orchestrates session state, persistence, and STT session creation.
4. `sttService` opens real-time Gemini sessions for microphone ("Me") and system audio ("Them").
5. Renderer (and macOS helper) stream 24 kHz PCM audio chunks to the main process.
6. Chunks are forwarded to Gemini via `sendRealtimeInput`.
7. Gemini responses are routed back to the renderer as partial/final transcript updates.
8. Completed utterances are stored and forwarded to downstream features (summary, Ask, etc.).

## 2. UI Trigger → IPC

- **Component**: `src/ui/app/MainHeader.js`
- On click, `sendListenButtonClick(listenButtonText)` resolves the current button label (`Listen`, `Stop`, `Resume`, `Done`) and invokes the main-process channel `listen:changeSession` exposed via the preload script (`src/preload.js`).
- The preload layer isolates the renderer from Electron APIs and provides helpers under `window.api.mainHeader` and `window.api.listenCapture` for audio streaming.

## 3. Main Process Orchestration

- **Bridge**: `src/bridge/featureBridge.js`
  - Registers all Listen-related IPC channels, delegating to `listenService`.
  - For audio channels, it passes Base64 PCM payloads straight through to `sttService`.
- **Service**: `src/features/listen/listenService.js`
  - Acts as the session state machine. Depending on the button text it calls `initializeSession`, `pauseSession`, `resumeSession`, or `closeSession`.
  - Wires `sttService` callbacks so completed utterances are saved to the transcript repository and forwarded to the summarizer.
  - Emits renderer events such as `session-state-changed`, `stt-update`, `system-audio-data`, and `change-listen-capture-state` through `listenWindow.webContents`.

### Session Initialization

- Ensures a database session and resets summary state.
- Retries `sttService.initializeSttSessions(language)` up to ten times, emitting status updates to the renderer.
- Once STT is ready, instructs the renderer to start local capture (`change-listen-capture-state: start`).

## 4. STT Service & Gemini Sessions

- **File**: `src/features/listen/stt/sttService.js`
- Maintains two parallel Gemini Live sessions:
  - `mySttSession` for microphone input (`Me`).
  - `theirSttSession` for system/loopback audio (`Them`).
- Sessions are created via the provider factory:

```js
const { createSTT } = require('../../common/ai/factory');
[this.mySttSession, this.theirSttSession] = await Promise.all([
  createSTT(this.modelInfo.provider, myOptions),
  createSTT(this.modelInfo.provider, theirOptions),
]);
```

- `modelStateService` supplies the provider, model ID, and API key.
- Keep-alive and auto-renew timers refresh the sockets every four minutes to avoid provider-side timeouts, with a one-second overlap to prevent dropped frames.

### Gemini Provider

- **File**: `src/features/common/ai/providers/gemini.js`
- Uses the official Google GenAI SDK to open a Gemini Live session:
  - Model: `gemini-live-2.5-flash-preview`.
  - Config: `speechConfig.languageCode` derived from UI language.
  - Callback chain injects `provider: 'gemini'` and forwards messages to `sttService` handlers.
- Exposes minimal primitives: `sendRealtimeInput(payload)` and `close()`.

## 5. Audio Capture & Streaming

### Renderer (Mic + System on Windows/Linux)

- **File**: `src/ui/listen/audioCore/listenCapture.js`
  - Captures microphone audio via Web Audio API, processes 0.1 s chunks (2400 samples at 24 kHz), optionally applies AEC using the latest system audio snapshot, and sends Base64 PCM via `window.api.listenCapture.sendMicAudioContent`.
  - Captures system audio through `getDisplayMedia` when available (Windows/Linux), slices into the same chunk size, and sends via `sendSystemAudioContent`.
  - Maintains a rolling buffer of system audio frames to feed the echo canceller and mirrors `system-audio-data` events from the main process.
  - Guards against starting capture before STT sessions are ready by checking `listen:isSessionActive`.

### macOS Loopback

- **File**: `src/features/listen/stt/sttService.js` (`startMacOSAudioCapture`)
  - Spawns the `SystemAudioDump` helper (bundled binary) to capture loopback audio directly in the main process.
  - Converts interleaved stereo PCM to mono, encodes to Base64, mirrors the chunk to the renderer for AEC, and forwards the payload to Gemini.
  - Ensures only one helper instance runs at a time (`pkill -f SystemAudioDump`).

### Payload Shape

All audio chunks—mic and system—are streamed as:

```json
{
  "audio": {
    "data": "<base64-encoded PCM>",
    "mimeType": "audio/pcm;rate=24000"
  }
}
```

`sttService` falls back to raw Base64 when the provider is not Gemini (legacy Whisper path).

## 6. Gemini → Renderer Messaging

- Incoming events are processed in `handleMyMessage` and `handleTheirMessage`.
- For Gemini:
  - Partial text is read from `message.serverContent.inputTranscription.text`.
  - `turnComplete` signals when to flush the accumulated buffer and emit a final transcription.
  - Optional `usageMetadata` provides token counts (logged for “Them”).
- Final messages invoke `onTranscriptionComplete`, which persists the utterance and informs the summary service.
- Renderer receives updates through `listenWindow.webContents.send('stt-update', { speaker, text, isPartial, isFinal, timestamp })` and renders them in `src/ui/listen/stt/SttView.js`.

## 7. Lifecycle Controls

- **Start** (`Listen`): create DB session, initialize STT sockets, start capture.
- **Stop**: stop local capture but keep Gemini sessions active for quick resume; database session stays open.
- **Resume**: restart capture; sockets remain live.
- **Done**: stop capture, close STT sessions, end DB session, and trigger meeting title generation.
- `closeSessions` cleans up timers, closes sockets, stops macOS helper, and resets internal buffers.

## 8. Persistence & Downstream Consumers

- Completed utterances are saved via `sttRepository.addTranscript` with speaker labels.
- The summary service maintains a running conversation buffer to power real-time insights and the Ask feature.
- When the session ends, Listen triggers meeting title generation (LLM-backed when available) and stores the result alongside the session record.

## 9. File Map Summary

| Area | Key Files |
| --- | --- |
| UI trigger | `src/ui/app/MainHeader.js`, `src/preload.js` |
| Renderer capture | `src/ui/listen/audioCore/listenCapture.js`, `src/ui/listen/audioCore/renderer.js` |
| IPC bridge | `src/bridge/featureBridge.js` |
| Session orchestration | `src/features/listen/listenService.js` |
| STT sessions & macOS loopback | `src/features/listen/stt/sttService.js` |
| Gemini provider | `src/features/common/ai/providers/gemini.js` |
| Transcript UI | `src/ui/listen/stt/SttView.js` |

## 10. Troubleshooting Hints

- **No transcript updates**: confirm `listen:isSessionActive` returns `true`, check for API key configuration via `modelStateService`, and inspect Gemini session logs in the main process.
- **macOS loopback silent**: ensure microphone/system permissions are granted and that `SystemAudioDump` starts successfully (PID log).
- **Dropped utterances**: verify auto-renew logs—overlaps rely on one-second delays; unusually large chunks can block the event loop.

This document should serve as the reference that was previously missing (`docs/stt-listen-flow.md`).
