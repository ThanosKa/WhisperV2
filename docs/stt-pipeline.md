# STT Pipeline in WhisperV2

## Overview

The Speech-to-Text (STT) system in WhisperV2 enables real-time transcription of conversations via microphone ("Me") and system audio ("Them") streams. It uses a server-side relay (Gemini-based) for provider-agnostic processing, abstracting SDKs/keys from the client. Audio is captured in the renderer, forwarded via IPC to main, and streamed over WebSocket to the relay at `ws://localhost:8080` (configurable). Transcripts are debounced (1200ms silence), filtered for noise, persisted to SQLite, and fed into analysis (e.g., summaryService). Supports Gemini Live (default) with fallback to Whisper; auth via session UUID.

Key goals: Low-latency partials for UI, final utterances for analysis/DB, platform-agnostic capture (macOS native loopback, Win/Linux screen audio).

## High-Level Flow

1. **User Triggers Listen**: Header UI (`MainHeader.js`) sends IPC `listen:changeSession` ("Listen").
2. **Session Init**: `listenService.js` creates DB session, initializes `sttService.js` with language (default 'en').
3. **Relay Connect**: WebSocket to relay with `X-Session-UUID` header; sends `OPEN {sessionId, language, streams: ['me','them']}`; waits for `CONNECTED`.
4. **Audio Capture Starts**: Main signals renderer (`change-listen-capture-state: 'start'`) to begin mic/system audio.
5. **Streaming**: Renderer captures 24kHz PCM chunks (~0.1s), base64-encodes, sends via IPC (`listen:sendMicAudio`/`sendSystemAudio`); main forwards as `AUDIO {stream, data, mimeType: 'audio/pcm;rate=24000'}`.
6. **Transcription**: Relay proxies to Gemini, streams `PARTIAL {text}` and `TURN_COMPLETE`; client debounces finals, emits `stt-update {speaker, text, isPartial/isFinal}` to UI (`SttView.js`).
7. **Processing**: Finals (>3 chars, noise-filtered) saved to `transcripts` table; forwarded to `summaryService.addConversationTurn` for batched LLM analysis.
8. **Stop/Done**: "Stop" halts capture (keeps relay); "Done" closes relay (`CLOSE`), ends session, generates title.

## Client Components

### Audio Capture (`listenCapture.js`, renderer)

- **Mic ("Me")**: `getUserMedia` at 24kHz mono; optional AEC using system audio ref (WASM Speex). Chunks: 2400 samples, converted to 16-bit PCM base64.
- **System ("Them")**:
    - macOS: Spawn `SystemAudioDump` (main process) for loopback; buffers 1024-byte chunks, stereo-to-mono if needed.
    - Win/Linux: `getDisplayMedia` loopback in renderer.
- IPC: `invoke('listen:sendMicAudio', {data: base64, mimeType})`; main handles forwarding.

### Orchestration (`listenService.js`, main)

- Manages lifecycle: Init DB (`sessionRepository`), connect STT (retry 10x, 300ms), signal capture.
- On final: `handleTranscriptionComplete` filters (<3 chars skip), persists (`sttRepository.addTranscript`), calls summary.
- Events: `session-state-changed {isActive, mode}`, `listen:changeSessionResult`.

### STT Service (`sttService.js`, main)

- **Connection**: `_openRelayConnection` creates WS with auth header; handles 'open'/'message'/'close'/'error'.
- **Sessions**: Post-`CONNECTED`, installs wrappers: `meSttSession.sendRealtimeInput(payload)` → `AUDIO 'me'`.
- **Handlers**: `handleMeMessage`/`handleThemMessage` parse Gemini events (e.g., `inputTranscription.text`); debounces finals (1200ms), filters noise (`<noise>`, `[BLANK_AUDIO]` etc.), emits `stt-update`.
- **macOS Helper**: `startMacOSAudioCapture` spawns/reads from `SystemAudioDump`, sends chunks directly.

### UI (`SttView.js`, renderer)

- Subscribes to `stt-update`; renders live transcript with speaker tags, partial/final states.

## Relay Protocol (Server-Side, Gemini Relay)

Client-relay WebSocket (`ws://localhost:8080`); JSON messages.

### Client → Relay

- `OPEN {type: 'OPEN', sessionId: UUID, language: 'en-US', streams: ['me','them']}`: Init.
- `AUDIO {type: 'AUDIO', sessionId, stream: 'me'|'them', mimeType: 'audio/pcm;rate=24000', data: base64}`: Audio chunk.
- `CLOSE {type: 'CLOSE', sessionId}`: End.

### Relay → Client

- `CONNECTED {type: 'CONNECTED', provider: 'gemini'}`: Ready.
- `PARTIAL {type: 'PARTIAL', stream, text, timestamp}`: Live transcript delta.
- `TURN_COMPLETE {type: 'TURN_COMPLETE', stream}`: Utterance end.
- `USAGE {type: 'USAGE', stream, promptTokens, candidateTokens}`: Metrics.
- `ERROR {type: 'ERROR', code: 'BAD_PAYLOAD'|'UPSTREAM_UNAVAILABLE', message}`: Issues.
- `CLOSED {type: 'CLOSED', sessionId}`: Shutdown.

Server setup: `npm start` with `GEMINI_API_KEY` env; handles upstream Gemini sessions, multi-stream.

## Response Handling & Integration

- **Partials**: Append to buffer, emit immediately for UI streaming.
- **Finals**: Debounce on `TURN_COMPLETE` or silence; noise filter (e.g., Whisper patterns); if valid, persist to SQLite (`transcripts: id, session_id, speaker, text, start_at`).
- **Analysis Trigger**: `summaryService` batches 3-5 utterances (smart: >=80 chars or 12 tokens; max 6 or 120s), builds prompt with history/priors, calls LLM via `/api/llm/chat`.
- **Errors**: Log/surface (e.g., "Connection failed"); retry init; fallback to prev results in analysis.

## Configuration

- **Env/Config**: `STT_RELAY_URL=ws://localhost:8080`, `utteranceSilenceMs=1200`, `OPENAI_TRANSCRIBE_LANG=en`.
- **Models**: Gemini default (`gemini-live-2.5-flash-preview`); select via `settingsService` (providerSettingsRepository).
- **Auth**: Requires `sessionUuid` from webapp login; blocks without.
- **Platform Notes**: macOS needs `SystemAudioDump`; Win/Linux uses browser APIs (permissions required).

## Files

- Core: `sttService.js`, `listenService.js`, `listenCapture.js`.
- Bridge/IPC: `featureBridge.js`.
- UI: `SttView.js`, `MainHeader.js`.
- Relay: Separate server (see SEVER-STT.md for full API).

For analysis post-STT, see `analysis-pipeline.md`.
