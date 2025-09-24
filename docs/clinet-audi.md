# STT (Speech-to-Text) Implementation in WhisperV2 Desktop App

## 1. Overview

The STT feature in the WhisperV2 desktop app (built with Electron) enables real-time speech-to-text transcription for voice input during conversations, meetings, or agent interactions. It primarily supports the &quot;Listen&quot; mode, where it captures audio from the user's microphone (&quot;me&quot; stream) and system audio (&quot;them&quot; stream, e.g., on macOS via loopback capture) to transcribe dialogues. This is used for live chat summaries, analysis, and integration with AI agents (e.g., passing transcripts to askService for question-answering). The app connects to a local gemini-relay server via WebSocket for processing, leveraging Gemini models for low-latency transcription. It handles both partial (real-time) and final transcripts, with debouncing for utterance completion. Fallback to Whisper provider is supported but less emphasized, with Gemini as the default.

## 2. Connection Flow

The app establishes a WebSocket connection to the gemini-relay server (default: `ws://localhost:8080`) only after user authentication provides a session UUID. Here's the step-by-step flow:

1. **Authentication Setup**: The `authService` (in `src/features/common/services/authService.js`) initializes a session via the webapp (e.g., POST to session init URL) and retrieves a `sessionUuid`. This is stored and validated before STT init. Deep link callbacks from the browser complete the auth flow.

2. **STT Initialization**: In `listenService.js`, `initializeSession()` calls `sttService.initializeSttSessions(language)` (default 'en'). This fetches model info from `modelStateService` (e.g., provider: 'gemini', model: 'gemini-live-2.5-flash-preview').

3. **WebSocket Connection**: In `sttService.js`, `_openRelayConnection()` creates a new `WebSocket` instance with headers including `'X-Session-UUID': sessionUuid`. If no UUID, it rejects with &quot;missing authenticated session&quot;. The connection includes retry logic (up to 10 attempts, 300ms delay) in `listenService`.

4. **Session and Streams Setup**: On 'open', generates a `relaySessionId` (randomUUID) and sends an `OPEN` message: `{ type: 'OPEN', sessionId, model, language, streams: ['me', 'them'] }`. Installs sessions for &quot;me&quot; (mic) and &quot;them&quot; (system audio). Sets `relayReady = true`.

5. **Error Handling**: On connection error, rejects promise and logs. For messages, handles 'ERROR' type by dispatching to callbacks and closing socket. Reconnection closes existing socket first. If relay URL unset, throws &quot;STT relay URL is not configured.&quot;

6. **Readiness**: Once 'CONNECTED' message received, dispatches to handlers and updates status to &quot;Listening...&quot;. Callbacks notify UI via `sendToRenderer('update-status')`.

## 3. Audio Capture &amp; Sending

Audio capture occurs in the renderer process (`src/ui/listen/audioCore/listenCapture.js`) using Web APIs, then forwarded to main via IPC for WebSocket sending.

- **Mic Capture (&quot;me&quot; stream)**: Uses `navigator.mediaDevices.getUserMedia({ audio: { sampleRate: 24000, channelCount: 1, echoCancellation: true, noiseSuppression: true } })` to get a `MediaStream`. Creates `MediaRecorder` with `mimeType: 'audio/webm;codecs=opus'` (or PCM fallback). Records in chunks (e.g., 250ms timeslice), converts blobs to ArrayBuffer, then base64-encodes the raw PCM data (24kHz, mono). Sends via `ipcRenderer.invoke('listen:sendMicAudio', { data: base64, mimeType })`.

- **System Audio (&quot;them&quot; stream)**: Platform-specific. On macOS, spawns `SystemAudioDump` child process (via `child_process.spawn`) to capture loopback audio at 24kHz/16-bit PCM, stereo. Converts stereo to mono if needed (`convertStereoToMono`), buffers chunks (1024 bytes), base64-encodes, and sends via `ipcRenderer.invoke('listen:sendSystemAudio')`. On Windows, uses Electron's `desktopCapturer` with `audio: 'loopback'` for screen audio. Starts/stops via IPC handlers in `bridge/featureBridge.js`.

- **Sending**: In `sttService.js`, `handleSendMicAudioContent` or `sendSystemAudioContent` receives base64 via IPC, constructs payload `{ audio: { data: base64Data, mimeType: 'audio/pcm;rate=24000' } }` for Gemini (raw base64 for Whisper). Sends to respective session (`meSttSession.sendRealtimeInput(payload)` or `themSttSession`). Buffers data to avoid overload; filters noise for Whisper.

Format: PCM 24kHz mono (24000 sample rate), base64-encoded. No explicit 16kHz support shown; defaults to 24kHz for Gemini compatibility.

## 4. Response Handling

Server responses are processed in `sttService.js` via WebSocket 'message' event, parsed as JSON, and dispatched based on `streamId` ('me' or 'them') to handlers.

- **PARTIAL**: Real-time transcription. Extracts `message.text` (filters '&lt;noise&gt;'), constructs `{ serverContent: { inputTranscription: { text } } }`, dispatches to `handleMeMessage`/`handleThemMessage`. Appends to `meCurrentUtterance`/`themCurrentUtterance`, sends partial to UI via `sendToRenderer('stt-update', { speaker, text, isPartial: true })`. Triggers UI updates (e.g., live transcript in `SummaryView.js` or `ListenView.js`).

- **TURN_COMPLETE**: Signals utterance end. Dispatches `{ serverContent: { turnComplete: true } }`, flushes debounced buffer (`flushMyCompletion()` after 1200ms silence), calls `onTranscriptionComplete(speaker, finalText)`. Saves to DB in `listenService.saveConversationTurn()`, triggers analysis in `summaryService` (e.g., every 1 utterance per config).

- **OPEN/CONNECTED**: Confirms connection, installs sessions, sets ready state.

- **USAGE**: Logs token usage (`promptTokens`, `candidateTokens`).

- **Errors**: Dispatches error details, closes socket, updates status (e.g., &quot;Connection failed&quot;), notifies UI via `onStatusUpdate`. Retries init if needed.

Agent logic: Transcripts feed into `conversationHistory` in `listenService`, passed to `askService` for AI responses (e.g., `sendMessageManual`). UI in `ListenView.js` handles state changes (e.g., `onSessionStateChanged` for start/stop).

## 5. Model &amp; Config

- **Gemini Models**: Default provider 'gemini', model 'gemini-live-2.5-flash-preview' (from `modelStateService.getCurrentModelInfo('stt')`). Supports live audio input. API key (`GEMINI_API_KEY`) checked for validity but handled server-side via relay (no direct client calls).

- **mimeTypes**: 'audio/pcm;rate=24000' for Gemini payloads. Fallback to raw base64 for Whisper. Language via `effectiveLanguage` (env `OPENAI_TRANSCRIBE_LANG` or 'en').

- **Config References**: In `src/features/common/config/config.js`: `sttRelayUrl: process.env.STT_RELAY_URL || 'ws://localhost:8080'`, `utteranceSilenceMs: 1200` (debounce). Model selection in `settingsService.js` via `providerSettingsRepository`, auto-selects available models (prioritizes Gemini if key present).

- **16kHz/24kHz Issues**: Uses 24kHz consistently for Gemini (no explicit fixes shown). Whisper may handle 16kHz natively but filters noise like '[BLANK_AUDIO]'. No mismatches noted; macOS capture defaults to 24kHz. Potential issue: Stereo conversion assumes 16-bit, may need adjustment for varying inputs.

## 6. Key Code Snippets

```416:478:src/features/listen/stt/sttService.js
async _openRelayConnection({ language, handleMeMessage, handleThemMessage }) {
    if (!DEFAULT_RELAY_URL) {
        throw new Error('STT relay URL is not configured.');
    }

    if (this.relaySocket) {
        // Ensure we start from a clean state when reconnecting
        await this._closeRelayConnection(false);
    }

    this.relayReady = false;

    return new Promise((resolve, reject) => {
        const relayUrl = DEFAULT_RELAY_URL;
        let settled = false;

        console.log(`[SttService] Connecting to STT relay at ${relayUrl}`);

        const settleResolve = () => {
            if (!settled) {
                settled = true;
                resolve(true);
            }
        };

        const settleReject = error => {
            if (!settled) {
                settled = true;
                reject(error);
            }
        };

        const sessionUuid = authService?.getCurrentUser()?.sessionUuid;
        if (!sessionUuid) {
            const error = new Error('STT relay connection blocked: missing authenticated session');
            console.error('[SttService]', error.message);
            settleReject(error);
            return;
        }

        const socket = new WebSocket(relayUrl, {
            headers: {
                'X-Session-UUID': sessionUuid,
            },
        });
        this.relaySocket = socket;

        socket.on('open', () => {
            this.relaySessionId = randomUUID();
```

```480:552:src/features/listen/stt/sttService.js
socket.on('message', raw => {
    let message;
    try {
        message = JSON.parse(raw.toString());
    } catch (e) {
        console.error('[SttService] Invalid JSON from relay:', e);
        return;
    }

    const streamId = message.streamId;
    if (!streamId || !['me', 'them'].includes(streamId)) {
        console.warn('[SttService] Ignoring message without valid streamId:', streamId);
        return;
    }

    const dispatch = streamId === 'them' ? handleThemMessage : handleMeMessage;

    switch (message.type) {
        case 'CONNECTED':
            this._installRelaySessions();
            this.relayReady = true;
            settleResolve();
            if (this.onStatusUpdate) {
                this.onStatusUpdate('Listening...');
            }
            break;

        case 'PARTIAL':
            if (typeof dispatch === 'function' && message.text && message.text !== '&lt;noise&gt;') {
                dispatch({
                    serverContent: {
                        inputTranscription: { text: message.text },
                    },
                });
            }
            break;

        case 'TURN_COMPLETE':
            if (typeof dispatch === 'function') {
                dispatch({ serverContent: { turnComplete: true } });
            }
            break;

        case 'USAGE':
            if (typeof dispatch === 'function') {
                dispatch({
                    serverContent: {
                        usageMetadata: {
                            promptTokenCount: message.promptTokens,
                            candidatesTokenCount: message.candidateTokens,
                        },
                    },
                });
            }
            break;

        case 'ERROR':
            console.error(`[SttService] Relay error on stream ${streamId}:`, message);
            if (typeof dispatch === 'function') {
                dispatch({ serverContent: { error: message.error } });
            }
            // Auto-reconnect on certain errors
            if (message.error?.includes('session')) {
                this._closeRelayConnection(true);
            }
            break;

        default:
            console.log(`[SttService] Unhandled message type: ${message.type}`);
    }
});
```

```141:189:src/features/listen/stt/sttService.js
async initializeSttSessions(language = 'en') {
    const effectiveLanguage = process.env.OPENAI_TRANSCRIBE_LANG || language || 'en';

    const modelInfo = (await modelStateService.getCurrentModelInfo('stt')) || {};
    this.modelInfo = {
        provider: modelInfo.provider || 'gemini',
        model: modelInfo.model || 'gemini-live-2.5-flash-preview',
    };
    console.log(`[SttService] Initializing STT relay for ${this.modelInfo.provider}`);

    const handleMeMessage = message => {
        if (!this.modelInfo) {
            console.log('[SttService] Ignoring message - session already closed');
            return;
        }
        // console.log('[SttService] handleMeMessage', message);

        if (this.modelInfo.provider === 'whisper') {
            // Whisper STT emits 'transcription' events with different structure
            if (message.text && message.text.trim()) {
                const finalText = message.text.trim();

                // Filter out Whisper noise transcriptions
                const noisePatterns = [
                    '[BLANK_AUDIO]',
                    '[INAUDIBLE]',
                    '[MUSIC]',
                    '[SOUND]',
                    '[NOISE]',
                    '(BLANK_AUDIO)',
                    '(INAUDIBLE)',
                    '(MUSIC)',
                    '(SOUND)',
                    '(NOISE)',
                ];

                const isNoise = noisePatterns.some(pattern => finalText.includes(pattern) || finalText === pattern);

                if (!isNoise && finalText.length > 2) {
                    this.debounceMyCompletion(finalText);

                    this.sendToRenderer('stt-update', {
                        speaker: 'Me',
                        text: finalText,
                        isPartial: false,
                        isFinal: true,
                        timestamp: Date.now(),
                    });
                } else {
                    console.log(`[Whisper-Me] Filtered noise: &quot;${finalText}&quot;`);
                }
            }
            return;
        } else if (this.modelInfo.provider === 'gemini') {
            const transcription = message.serverContent?.inputTranscription;
```

```674:748:src/features/listen/stt/sttService.js
async startMacOSAudioCapture() {
    if (process.platform !== 'darwin' || !this.themSttSession) return false;

    const modelInfo = await modelStateService.getCurrentModelInfo('stt');
    if (!modelInfo) {
        throw new Error('STT model info could not be retrieved.');
    }

    this.systemAudioProc = spawn('SystemAudioDump', ['-f', '24k', '-c', '1', '-e', 'signed-integer', '-b', '16', '-r', '24000'], {
        stdio: ['ignore', 'pipe', 'pipe'],
    });

    let audioBuffer = Buffer.alloc(0);
    const CHUNK_SIZE = 1024;
    const CHANNELS = 1; // Target mono

    this.systemAudioProc.stdout.on('data', async data => {
        audioBuffer = Buffer.concat([audioBuffer, data]);

        while (audioBuffer.length >= CHUNK_SIZE) {
            const chunk = audioBuffer.slice(0, CHUNK_SIZE);
            audioBuffer = audioBuffer.slice(CHUNK_SIZE);

            const monoChunk = CHANNELS === 2 ? this.convertStereoToMono(chunk) : chunk;
            const base64Data = monoChunk.toString('base64');

            this.sendToRenderer('system-audio-data', { data: base64Data });

            if (this.themSttSession) {
                try {
                    let payload;
                    if (modelInfo.provider === 'gemini') {
                        payload = { audio: { data: base64Data, mimeType: 'audio/pcm;rate=24000' } };
                    } else {
                        payload = base64Data;
                    }

                    await this.themSttSession.sendRealtimeInput(payload);
                } catch (err) {
                    console.error('Error sending system audio:', err.message);
                }
            }
        }
    });
```

## 7. Potential Issues

- **Session Validation**: STT blocks without valid `sessionUuid` from auth; deep link failures could prevent connection. No fallback for unauthenticated use.
- **Sample Rate Mismatches**: Hardcoded 24kHz for Gemini/macOS capture; Whisper may expect 16kHz, leading to quality drops if not resampled (no explicit resampling shown). Stereo inputs require manual mono conversion, risking audio artifacts.
- **Platform Dependencies**: System audio capture is macOS-specific (SystemAudioDump); Windows relies on loopback via desktopCapturer, which may fail on multi-monitor setups or require user permission. No Linux support evident.
- **Noise/Blank Filtering**: Whisper filters common noise patterns, but Gemini may pass '&lt;noise&gt;' partials, potentially cluttering UI. Debounce (1200ms) could delay real-time feel in noisy environments.
- **Error Recovery**: Retries init (10x), but persistent relay errors (e.g., server down) require manual restart. No auto-fallback to local Whisper if Gemini fails. Token usage logging present but no rate limiting.
- **Bugs**: If `GEMINI_API_KEY` unset, auto-selection may fail STT init. Large audio buffers could cause memory leaks on long sessions; no explicit cleanup for failed spawns. UI may not handle rapid partials smoothly (throttling in `ListenView.js` inferred but not shown).
