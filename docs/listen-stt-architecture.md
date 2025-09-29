# Listen STT Architecture (Server‑Side)

This is the single source of truth for the Listen speech‑to‑text (STT) pipeline after migrating realtime STT to a backend relay service. Speech recognition now happens entirely on the relay/backend; the desktop app only captures audio, forwards it, and renders transcripts received from the relay.

## 1) High‑Level Flow

- User clicks Listen in the header UI.
- Renderer calls IPC to main for session control and starts local audio capture when ready.
- Main orchestrates session lifecycle and connects to the STT relay over WebSocket.
- Renderer streams mic/system audio frames to main; main forwards them to the relay.
- Relay maintains upstream provider sessions (e.g., Gemini Live, Whisper, etc.) and streams partial/final text back. If transcripts need normalization (for example, adding missing spaces in certain languages) that logic must live on the relay.
- Main forwards `stt-update` events to the renderer, which renders transcript UI.

## 2) User Trigger → IPC

- UI component: `src/ui/app/MainHeader.js` (Listen/Stop/Resume/Done button)
    - On click, calls `window.api.mainHeader.sendListenButtonClick(listenButtonText)` → `listen:changeSession`.
- Preload exposes helpers to the renderer: `src/preload.js` (e.g., `window.api.listenCapture.*`).

Renderer → Main IPC channels (bridge): `src/bridge/featureBridge.js`

- `listen:changeSession` → toggle session state (`Listen` | `Stop` | `Resume` | `Done`).
- `listen:sendMicAudio` → `{ data, mimeType: 'audio/pcm;rate=24000' }` (24 kHz PCM, Base64).
- `listen:sendSystemAudio` → same payload; Win/Linux from renderer, macOS via native helper in main.
- `listen:startMacosSystemAudio` / `listen:stopMacosSystemAudio` → start/stop native loopback (macOS).
- `listen:isSessionActive` → boolean guard before starting renderer capture.

Main → Renderer events

- `listen:changeSessionResult` → header state machine feedback.
- `session-state-changed` → `{ isActive, mode }` for ListenView runtime state.
- `stt-update` → `{ speaker, text, isPartial, isFinal, timestamp }` transcript updates.
- `system-audio-data` → `{ data }` last system audio chunk (renderer AEC reference).
- `change-listen-capture-state` → `{ status: 'start'|'stop' }` to control local capture.

## 3) Main Orchestration

- Entry/IPC: `src/bridge/featureBridge.js`
- Orchestrator: `src/features/listen/listenService.js`
    - `Listen` → ensures DB session, connects STT relay, then signals renderer to start capture.
    - `Stop` → stops local capture, keeps relay connection alive for quick resume.
    - `Resume` → restarts local capture; relay still connected.
    - `Done` → stops capture, closes relay socket, ends DB session, triggers meeting title generation.
- Persists utterances and forwards to summary service.

## 4) STT Relay Connection (Server‑Side STT)

- Client STT service: `src/features/listen/stt/sttService.js`
- Instead of opening provider SDK sessions on the client, the main process connects to a backend relay WebSocket.
- Config: `STT_RELAY_URL` env or `config.get('sttRelayUrl')`; defaults to `ws://localhost:8080`.
- Auth: adds `X-Session-UUID` (from `authService.getCurrentUser().sessionUuid`) to the WebSocket request headers.

Relay protocol (client‑facing)

- Client → Relay
- `OPEN` → `{ type: 'OPEN', sessionId, language, streams: ['me','them'] }`.
- `AUDIO` → `{ type: 'AUDIO', sessionId, stream: 'me'|'them', mimeType, data }` (Base64 PCM).
    - `CLOSE` → `{ type: 'CLOSE', sessionId }`.
- Relay → Client
    - `CONNECTED` → indicates upstream sessions ready; client marks relay ready.
    - `PARTIAL` → `{ type: 'PARTIAL', stream, text }` → mapped to partial `stt-update`.
    - `TURN_COMPLETE` → `{ type: 'TURN_COMPLETE', stream }` → flushes final text.
    - `USAGE` → provider token usage for logging/telemetry.
    - `ERROR` / `CLOSED` / `ACK` → lifecycle and errors.

Client session wrappers

- `sttService` installs lightweight session objects once relay is `CONNECTED`:
    - `meSttSession.sendRealtimeInput(payload)` → wraps to `AUDIO` with `stream: 'me'`.
    - `themSttSession.sendRealtimeInput(payload)` → wraps to `AUDIO` with `stream: 'them'`.
- Renewal/keep‑alive: handled upstream by relay; local timers are no‑ops now.

## 5) Audio Capture & Streaming

Renderer capture: `src/ui/listen/audioCore/listenCapture.js`

- Microphone
    - Web Audio API at 24 kHz; chunks of 0.1 s (2400 samples).
    - Optional AEC using the latest `system-audio-data` snapshot from main.
    - Sends Base64 PCM via `listen:sendMicAudio`.
- System audio
    - Windows/Linux: `getDisplayMedia` loopback in renderer → `listen:sendSystemAudio`.
    - macOS: native helper `SystemAudioDump` spawned by main → chunks forwarded to relay and mirrored to renderer for AEC.

Payload shape (both streams)

```json
{
    "audio": {
        "data": "<base64-encoded PCM>",
        "mimeType": "audio/pcm;rate=24000"
    }
}
```

## 6) Relay → Renderer Messaging

- `sttService` maps relay events to internal handlers and emits UI updates:
    - Partial: `stt-update { speaker: 'Me'|'Them', text, isPartial: true }`.
    - Turn complete: flushes buffers and emits finals `isFinal: true`.
- The renderer subscribes in `src/ui/listen/stt/SttView.js` and renders live transcript.

## 7) Error & State Propagation

- Header status: `listen:changeSessionResult` drives header button state machine.
- Listen view: `session-state-changed { isActive, mode }`.
- Capture control: `change-listen-capture-state { status }` start/stop local capture.
- Errors: Relay `ERROR` events are logged and surfaced as status updates.

## 8) Shutdown

- Stop: stop local capture; keep relay socket.
- Done: stop capture, `CLOSE` the relay, end DB session, kick off meeting title generation.

## 9) Configuration

- `STT_RELAY_URL` env var (e.g., `wss://api.example.com/stt-relay`).
- Defaults to `ws://localhost:8080` in development.
- Requires authenticated session (relay expects `X-Session-UUID`).

## 10) File Map (Authoritative)

- Main orchestration: `src/features/listen/listenService.js`
- STT service (relay client): `src/features/listen/stt/sttService.js`
- IPC bridge: `src/bridge/featureBridge.js`
- Renderer capture: `src/ui/listen/audioCore/listenCapture.js`, `src/ui/listen/audioCore/renderer.js`
- Transcript view: `src/ui/listen/stt/SttView.js`
- Window plumbing: `src/window/windowManager.js`
- Config & auth: `src/features/common/config/config.js`, `src/features/common/services/authService.js`

## 11) Post‑Migration Cleanup Suggestions

Client no longer manages provider API keys, model selection, or Gemini/Whisper shims; all `modelStateService` logic was removed.
Relay text is passed through verbatim. Any spacing/tokenization fixes must be implemented server-side.
