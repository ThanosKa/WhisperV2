# STT Pipeline in WhisperV2

## Overview

The Speech-to-Text (STT) system in WhisperV2 enables real-time transcription of conversations via microphone ("Me") and system audio ("Them") streams. It uses a server-side relay (Gemini-based) for provider-agnostic processing, abstracting SDKs/keys from the client. Audio is captured in the renderer, forwarded via IPC to main, and streamed over WebSocket to the relay at `ws://localhost:8080` (configurable). Transcripts are debounced (800ms silence), filtered for noise, persisted to SQLite, and fed into analysis (e.g., summaryService). Supports Gemini Live (default) with fallback to Whisper; auth via session UUID.

Key goals: Low-latency partials for UI, final utterances for analysis/DB, platform-agnostic capture (macOS native loopback, Win/Linux screen audio).

## High-Level Flow

1. **User Triggers Listen**: Header UI (`MainHeader.js`) sends IPC `listen:changeSession` ("Listen").
2. **Session Init**: `listenService.js` creates DB session, initializes `sttService.js` with language (default 'en').
3. **Relay Connect**: WebSocket to relay with `X-Session-UUID` header; sends `OPEN {sessionId, streams: ['me','them']}`; waits for `CONNECTED`.
4. **Audio Capture Starts**: Main signals renderer (`change-listen-capture-state: 'start'`) to begin mic/system audio.
5. **Streaming**: Renderer captures 16kHz PCM chunks (~0.1s), base64-encodes, sends via IPC (`listen:sendMicAudio`/`sendSystemAudio`); main forwards as `AUDIO {stream, data, mimeType: 'audio/pcm;rate=16000'}`.
6. **Transcription**: Relay proxies to Gemini, streams `PARTIAL {text}` and `TURN_COMPLETE`; client debounces finals, emits `stt-update {speaker, text, isPartial/isFinal}` to UI (`SttView.js`).
7. **Processing**: Finals (>3 chars, noise-filtered) saved to `transcripts` table; forwarded to `summaryService.addConversationTurn` for batched LLM analysis.
8. **Pause/Resume**: "Stop" pauses capture (keeps relay active, maintains session); "Resume" restarts capture with existing session.
9. **Stop/Done**: "Done" closes relay (`CLOSE`), ends session, generates title.

## Session State Management

The listen service supports four session states: `beforeSession`, `inSession`, `paused`, `afterSession`.

- **beforeSession**: Initial state, no active session
- **inSession**: Active listening with audio capture and relay connection
- **paused**: Relay connection maintained but audio capture stopped; session persists for resume
- **afterSession**: Session ended, relay closed, final summary generated

**State Transitions**:

- `beforeSession` → `inSession`: "Listen" button (creates new session)
- `inSession` → `paused`: "Stop" button (pauses capture, keeps relay)
- `paused` → `inSession`: "Resume" button (resumes capture)
- `inSession`/`paused` → `beforeSession`: "Done" button (closes relay, ends session)
- `inSession` → `beforeSession`: Initialization failure or errors

**Database Handling**:

- Pause: Session remains active in DB (not ended), allows Ask to attach
- Resume: Reuses existing session ID, continues transcript accumulation
- Done: Ends session in DB, generates comprehensive summary and title

## Client Components

### Audio Capture (`listenCapture.js`, renderer)

- **Mic ("Me")**: `getUserMedia` at 16kHz mono; optional AEC using WASM Speex module (`aec.js`) for acoustic echo cancellation during voice activity segments; processes 160-sample frames synchronously; chunks: 1600 samples, converted to 16-bit PCM base64.
- **System ("Them")**:
    - **macOS**: Spawn `SystemAudioDump` executable (main process) for native loopback capture; buffers 6400-byte chunks (16kHz × 2 bytes/sample × 2 channels × 0.1s), stereo-to-mono conversion; handles process lifecycle, stderr logging, and cleanup.
    - **Windows**: Uses `getDisplayMedia` with native Electron loopback for system audio; verifies audio tracks exist; processes through ScriptProcessor for chunking.
    - **Linux**: Uses `getDisplayMedia` for screen capture (no system audio loopback); microphone-only processing with separate AEC logic.
- IPC: `invoke('listen:sendMicAudio', {data: base64, mimeType})`; main handles forwarding.
- **Token Tracking**: Tracks audio processing tokens (16 tokens/second) for throttling and quota management; configurable limits with localStorage settings.

#### Audio Format Specifications

- **Sample Rate**: 16kHz for all audio streams (mic and system) - optimized for Gemini 2.5 Flash Native Audio model
- **Bit Depth**: 16-bit PCM (Int16Array), little-endian
- **Channels**: Mono (1 channel) for mic, Stereo-to-Mono conversion for system audio
- **Chunk Duration**: 0.1 seconds (1600 samples at 16kHz)
- **Encoding**: Base64-encoded binary data over IPC/WebSocket (binary preferred when supported)
- **Mime Type**: `'audio/pcm;rate=16000'` in all audio messages
- **Normalization**: Float32 [-1.0, 1.0] range converted to Int16 [-32768, 32767]
- **Model Optimization**: Gemini 2.5 Flash Native Audio automatically detects language, no language specification needed

### Orchestration (`listenService.js`, main)

- Manages lifecycle: Init DB (`sessionRepository`), connect STT with retry logic (10 attempts, 300ms delay), signal capture.
- On final: `handleTranscriptionComplete` filters transcripts (<3 chars after trim skip), persists valid transcripts (`sttRepository.addTranscript`), calls summary.
- Events: `session-state-changed {isActive, mode}`, `listen:changeSessionResult`.

### STT Service (`sttService.js`, main)

- **Connection**: `_openRelayConnection` creates authenticated WebSocket with `X-Session-UUID` header; handles connection lifecycle ('open'/'message'/'close'/'error'); supports reconnection with state cleanup.
- **Sessions**: Post-`CONNECTED`, installs wrappers: `meSttSession.sendRealtimeInput(payload)` → `AUDIO 'me'`.
- **Handlers**: `handleMeMessage`/`handleThemMessage` parse Gemini events (e.g., `inputTranscription.text`); debounces finals (1200ms), filters noise (exact `<noise>` pattern only), emits `stt-update`.
- **macOS Helper**: `startMacOSAudioCapture` spawns/reads from `SystemAudioDump`, sends chunks directly.

#### Relay Connection Lifecycle

- **Initialization**: Creates WebSocket with session authentication; sends `OPEN {sessionId, streams: ['me','them']}`; waits for `CONNECTED` response.
- **State Management**: Tracks `relaySocket`, `relaySessionId`, `relayReady` flags; installs session wrappers on successful connection.
- **Teardown**: Graceful close with `CLOSE` message; kills existing SystemAudioDump processes; cleans up timers and state.
- **Reconnection**: Supports connection restart with state cleanup; prevents multiple concurrent connections.
- **Error Handling**: Blocks unauthorized connections (missing sessionUuid); logs connection failures and state changes.

### UI (`SttView.js`, renderer)

- Subscribes to `stt-update {speaker, text, isPartial, isFinal, timestamp}`; renders live transcript with speaker tags, partial/final states.
- **Message Handling**: Maintains `sttMessages` array with partial-to-final conversion; auto-scrolls to bottom on updates.
- **Copy Functionality**: Individual message copy with visual feedback (2-second "copied" state); clipboard.writeText API.
- **Session Management**: `resetTranscript()` clears messages on new sessions; `getTranscriptText()` exports full conversation.

## IPC Communication Patterns

**Renderer → Main Process:**

- `listen:sendMicAudio {data: base64, mimeType}`: Audio chunks from microphone
- `listen:sendSystemAudio {data: base64, mimeType}`: Audio chunks from system audio
- `listen:startMacosSystemAudio`: Start macOS system audio capture
- `listen:stopMacosSystemAudio`: Stop macOS system audio capture
- `listen:isSessionActive`: Check if STT session is active

**Main Process → Renderer:**

- `stt-update {speaker, text, isPartial, isFinal, timestamp}`: Live transcription updates
- `session-state-changed {isActive, mode}`: Session state changes (start/pause/resume/end)
- `change-listen-capture-state {status: 'start'|'stop'}`: Audio capture control
- `session-initializing {boolean}`: Initialization status
- `update-status {string}`: Status messages
- `system-audio-data {data: base64}`: System audio data for AEC reference

**Header UI Integration:**

- `listen:changeSession {listenButtonText}`: Start/stop/resume/done commands
- `listen:changeSessionResult {success, nextStatus}`: Operation results

## Relay Protocol (Server-Side, Gemini Relay)

Client-relay WebSocket (`ws://localhost:8080`); JSON messages.

### Client → Relay

- `OPEN {type: 'OPEN', sessionId: UUID, streams: ['me','them']}`: Initialize session with requested streams.
- `AUDIO {type: 'AUDIO', sessionId, stream: 'me'|'them', mimeType: 'audio/pcm;rate=16000', data: base64}`: Send base64-encoded PCM audio chunk for specified stream.
- `CLOSE {type: 'CLOSE', sessionId}`: Gracefully close session and clean up resources.

### Relay → Client

- `CONNECTED {type: 'CONNECTED', provider: 'gemini'}`: Session initialized and ready for audio data.
- `PARTIAL {type: 'PARTIAL', stream, text, timestamp}`: Incremental transcription update for ongoing speech.
- `TURN_COMPLETE {type: 'TURN_COMPLETE', stream}`: Speech turn ended, finalize current utterance.
- `USAGE {type: 'USAGE', stream, promptTokens, candidateTokens}`: Token usage metrics for billing/tracking.
- `ERROR {type: 'ERROR', code: 'BAD_PAYLOAD'|'UPSTREAM_UNAVAILABLE', message}`: Error conditions with specific codes.
- `CLOSED {type: 'CLOSED', sessionId}`: Session terminated, no further messages.

**Message Routing**: Client routes messages using `message.stream` field (primary) with fallback to `message.speaker` for backward compatibility.

Server setup: `npm start` with `GEMINI_API_KEY` env; handles upstream Gemini sessions, multi-stream.

## **Client-Server Payload Details**

### **What Client Sends to Server:**

#### **WebSocket Connection**

- **URL:** `ws://localhost:8080`
- **Headers:** `X-Session-UUID: <session-uuid>`

#### **Initial OPEN message**

```json
{
    "type": "OPEN",
    "sessionId": "<random-uuid>",
    "streams": ["me", "them"]
}
```

**Note:** No `language` parameter is sent as Gemini 2.5 Flash Native Audio automatically detects and handles multiple languages.

#### **Audio data messages**

```json
{
  "type": "AUDIO",
  "sessionId": "<session-uuid>",
  "stream": "me" | "them",
  "mimeType": "audio/pcm;rate=16000",
  "data": "<base64-encoded-pcm-audio>"
}
```

#### **Session close message**

```json
{
    "type": "CLOSE",
    "sessionId": "<session-uuid>"
}
```

### **What Server Sends to Client:**

#### **Connection confirmation**

```json
{
    "type": "CONNECTED",
    "provider": "gemini"
}
```

#### **Transcription updates**

```json
{
  "type": "PARTIAL",
  "stream": "me" | "them",
  "text": "partial transcription text",
  "timestamp": 1234567890
}
```

#### **Turn completion signal**

```json
{
  "type": "TURN_COMPLETE",
  "stream": "me" | "them"
}
```

#### **Token usage metrics**

```json
{
  "type": "USAGE",
  "stream": "me" | "them",
  "promptTokens": 150,
  "candidateTokens": 75
}
```

#### **Error messages**

```json
{
  "type": "ERROR",
  "code": "BAD_PAYLOAD" | "UPSTREAM_UNAVAILABLE",
  "message": "error description"
}
```

#### **Session closure**

```json
{
    "type": "CLOSED",
    "sessionId": "<session-uuid>"
}
```

### **Audio Format Specifications:**

- **Sample Rate:** 16kHz
- **Bit Depth:** 16-bit PCM
- **Channels:** Mono
- **Chunk Duration:** 0.1 seconds (1600 samples)
- **Encoding:** Base64

**Note:** Session UUID is sent in WebSocket headers (`X-Session-UUID`), not in JSON payload messages.

## Response Handling & Integration

- **Partials**: Append to buffer, emit immediately for UI streaming.
- **Finals**: Debounce on `TURN_COMPLETE` or silence (1200ms); noise filter (exact `<noise>` pattern); if valid (>3 chars), persist to SQLite (`transcripts: id, session_id, speaker, text, start_at`).
- **Analysis Trigger**: `summaryService.addConversationTurn()` accumulates utterances in `conversationHistory`; triggers analysis when meeting smart batching criteria (3-5 utterances with >=80 chars or 12 tokens; max 6 utterances or 120s timeout); builds context-aware prompts, calls LLM via `/api/llm/chat`.
- **Database Persistence**: Transcripts saved to `transcripts` table with `session_id`, `speaker`, `text`, `start_at` timestamp; sessions managed via `sessionRepository` with start/end lifecycle; pause maintains active session for resume capability.
- **Errors**: Log/surface (e.g., "Connection failed"); retry init; fallback to prev results in analysis.

## Error Handling & Recovery

**Relay Connection Failures:**

- **Authentication Errors**: Missing/invalid `sessionUuid` blocks connection entirely
- **Network Errors**: WebSocket connection failures trigger retry logic (10 attempts, 300ms delay)
- **Protocol Errors**: Invalid message formats logged but don't crash the session
- **Upstream Errors**: Gemini API failures logged with error codes ('BAD_PAYLOAD', 'UPSTREAM_UNAVAILABLE')

**Audio Capture Issues:**

- **Permission Denied**: Microphone/system audio access failures logged with platform-specific guidance
- **Device Errors**: Audio device disconnection handled gracefully without session termination
- **Format Errors**: Invalid audio data logged but processing continues with next chunk
- **macOS SystemAudioDump**: Process spawn failures with cleanup and retry logic

**Recovery Procedures:**

- **Session Recovery**: Pause/resume allows session continuation without data loss
- **Connection Recovery**: Automatic reconnection with state preservation
- **Fallback Behavior**: Previous analysis results used when LLM calls fail
- **Graceful Degradation**: System continues with reduced functionality (e.g., mic-only if system audio fails)

**Logging & Monitoring:**

- **Error Levels**: Connection issues logged as warnings, data errors as info
- **User Feedback**: Status updates sent to UI for user-visible error states
- **Debug Information**: Detailed error context preserved for troubleshooting

## Configuration

- **Env/Config**: `STT_RELAY_URL=ws://localhost:8080`, `utteranceSilenceMs=1200`, `OPENAI_TRANSCRIBE_LANG=en`.
- **Language**: Uses `process.env.OPENAI_TRANSCRIBE_LANG` as fallback if language parameter not provided (defaults to 'en').
- **Models**: Gemini default (`gemini-live-2.5-flash-preview`); select via `settingsService` (providerSettingsRepository).
- **Auth**: Requires valid `sessionUuid` from webapp authentication (`authService.sessionUuid`); blocks relay connection without authenticated session, preventing unauthorized STT usage.
- **Platform Notes**: macOS needs `SystemAudioDump`; Win/Linux uses browser APIs (permissions required).
- **Build Requirements**: macOS builds include `SystemAudioDump` binary in `electron-builder.yml`; requires executable permissions; packaged via Electron Builder for cross-platform distribution.

## Performance Metrics

**Audio Processing:**

- **Chunk Duration**: 100ms (0.1 seconds) for real-time streaming
- **Sample Rate**: 16kHz provides optimal balance of quality vs bandwidth
- **Latency**: <500ms end-to-end from audio capture to UI display
- **Memory Usage**: <50MB additional during active listening sessions

**Network & Relay:**

- **WebSocket Overhead**: JSON message encoding/decoding per chunk
- **Reconnection**: <3 seconds for session recovery on network issues
- **Token Tracking**: 16 tokens/second for quota management

**System Resources:**

- **CPU Usage**: Minimal during idle, <10% during active transcription
- **Battery Impact**: Optimized for mobile device usage
- **Background Processing**: Efficient state management during pause/resume

**Scalability:**

- **Concurrent Sessions**: Single active session per client instance
- **Message Throughput**: Handles 10 chunks/second per audio stream
- **Error Recovery**: Automatic retry with exponential backoff

## Files

- Core: `src/features/listen/stt/sttService.js`, `src/features/listen/listenService.js`, `src/ui/listen/audioCore/listenCapture.js`.
- Bridge/IPC: `src/bridge/featureBridge.js`.
- UI: `src/ui/listen/stt/SttView.js`, `src/ui/app/MainHeader.js`.
- Relay: Separate server (see SERVER-STT.md for full API).

For analysis post-STT, see `analysis-pipeline.md`.
