const { spawn } = require('child_process');
const { randomUUID } = require('crypto');
const WebSocket = require('ws');
const authService = require('../../common/services/authService');
const modelStateService = require('../../common/services/modelStateService');
const config = require('../../common/config/config');

const COMPLETION_DEBOUNCE_MS = config.get('utteranceSilenceMs') || 1200;
const DEFAULT_RELAY_URL = process.env.STT_RELAY_URL || config.get('sttRelayUrl') || 'ws://localhost:8080';

class SttService {
    constructor() {
        this.mySttSession = null;
        this.theirSttSession = null;
        this.myCurrentUtterance = '';
        this.theirCurrentUtterance = '';

        // Turn-completion debouncing
        this.myCompletionBuffer = '';
        this.theirCompletionBuffer = '';
        this.myCompletionTimer = null;
        this.theirCompletionTimer = null;

        // System audio capture
        this.systemAudioProc = null;

        // Callbacks
        this.onTranscriptionComplete = null;
        this.onStatusUpdate = null;

        this.modelInfo = null;

        // Relay connection state
        this.relaySocket = null;
        this.relaySessionId = null;
        this.relayReady = false;
    }

    setCallbacks({ onTranscriptionComplete, onStatusUpdate }) {
        this.onTranscriptionComplete = onTranscriptionComplete;
        this.onStatusUpdate = onStatusUpdate;
    }

    sendToRenderer(channel, data) {
        // Send Listen-related events only to Listen window (prevent Ask window conflicts)
        const { windowPool } = require('../../../window/windowManager');
        const listenWindow = windowPool?.get('listen');

        if (listenWindow && !listenWindow.isDestroyed()) {
            listenWindow.webContents.send(channel, data);
        }
    }

    async handleSendSystemAudioContent(data, mimeType) {
        try {
            await this.sendSystemAudioContent(data, mimeType);
            this.sendToRenderer('system-audio-data', { data });
            return { success: true };
        } catch (error) {
            console.error('Error sending system audio:', error);
            return { success: false, error: error.message };
        }
    }

    flushMyCompletion() {
        const finalText = (this.myCompletionBuffer + this.myCurrentUtterance).trim();
        if (!this.modelInfo || !finalText) return;

        // Notify completion callback
        if (this.onTranscriptionComplete) {
            this.onTranscriptionComplete('Me', finalText);
        }

        // Send to renderer as final
        this.sendToRenderer('stt-update', {
            speaker: 'Me',
            text: finalText,
            isPartial: false,
            isFinal: true,
            timestamp: Date.now(),
        });

        this.myCompletionBuffer = '';
        this.myCompletionTimer = null;
        this.myCurrentUtterance = '';

        if (this.onStatusUpdate) {
            this.onStatusUpdate('Listening...');
        }
    }

    flushTheirCompletion() {
        const finalText = (this.theirCompletionBuffer + this.theirCurrentUtterance).trim();
        if (!this.modelInfo || !finalText) return;

        // Notify completion callback
        if (this.onTranscriptionComplete) {
            this.onTranscriptionComplete('Them', finalText);
        }

        // Send to renderer as final
        this.sendToRenderer('stt-update', {
            speaker: 'Them',
            text: finalText,
            isPartial: false,
            isFinal: true,
            timestamp: Date.now(),
        });

        this.theirCompletionBuffer = '';
        this.theirCompletionTimer = null;
        this.theirCurrentUtterance = '';

        if (this.onStatusUpdate) {
            this.onStatusUpdate('Listening...');
        }
    }

    debounceMyCompletion(text) {
        if (this.modelInfo?.provider === 'gemini') {
            this.myCompletionBuffer += text;
        } else {
            this.myCompletionBuffer += (this.myCompletionBuffer ? ' ' : '') + text;
        }

        if (this.myCompletionTimer) clearTimeout(this.myCompletionTimer);
        this.myCompletionTimer = setTimeout(() => this.flushMyCompletion(), COMPLETION_DEBOUNCE_MS);
    }

    debounceTheirCompletion(text) {
        if (this.modelInfo?.provider === 'gemini') {
            this.theirCompletionBuffer += text;
        } else {
            this.theirCompletionBuffer += (this.theirCompletionBuffer ? ' ' : '') + text;
        }

        if (this.theirCompletionTimer) clearTimeout(this.theirCompletionTimer);
        this.theirCompletionTimer = setTimeout(() => this.flushTheirCompletion(), COMPLETION_DEBOUNCE_MS);
    }

    async initializeSttSessions(language = 'en') {
        const effectiveLanguage = process.env.OPENAI_TRANSCRIBE_LANG || language || 'en';

        const modelInfo = (await modelStateService.getCurrentModelInfo('stt')) || {};
        this.modelInfo = {
            provider: modelInfo.provider || 'gemini',
            model: modelInfo.model || 'gemini-live-2.5-flash-preview',
        };
        console.log(`[SttService] Initializing STT relay for ${this.modelInfo.provider}`);

        const handleMyMessage = message => {
            if (!this.modelInfo) {
                console.log('[SttService] Ignoring message - session already closed');
                return;
            }
            // console.log('[SttService] handleMyMessage', message);

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
                        console.log(`[Whisper-Me] Filtered noise: "${finalText}"`);
                    }
                }
                return;
            } else if (this.modelInfo.provider === 'gemini') {
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

            if (message.error) {
                console.error('[Me] STT Session Error:', message.error);
            }
        };

        const handleTheirMessage = message => {
            if (!message || typeof message !== 'object') return;

            if (!this.modelInfo) {
                console.log('[SttService] Ignoring message - session already closed');
                return;
            }

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

                    // Only process if it's not noise, not a false positive, and has meaningful content
                    if (!isNoise && finalText.length > 2) {
                        this.debounceTheirCompletion(finalText);

                        this.sendToRenderer('stt-update', {
                            speaker: 'Them',
                            text: finalText,
                            isPartial: false,
                            isFinal: true,
                            timestamp: Date.now(),
                        });
                    } else {
                        console.log(`[Whisper-Them] Filtered noise: "${finalText}"`);
                    }
                }
                return;
            } else if (this.modelInfo.provider === 'gemini') {
                // Guard inside handleTheirMessage (and the same in handleMyMessage)
                if (message?.serverContent?.usageMetadata) {
                    console.log('[Gemini STT - Them] Tokens In:', message.serverContent.usageMetadata.promptTokenCount);
                    console.log('[Gemini STT - Them] Tokens Out:', message.serverContent.usageMetadata.candidatesTokenCount);
                }
                const transcription = message.serverContent?.inputTranscription;
                const textChunk = transcription?.text || '';
                const turnComplete = !!message.serverContent?.turnComplete;

                if (!message.serverContent?.modelTurn) {
                    // console.log('[Gemini STT - Them]', JSON.stringify(message, null, 2));
                }

                if (message.serverContent?.turnComplete) {
                    if (this.theirCompletionTimer) {
                        clearTimeout(this.theirCompletionTimer);
                        this.flushTheirCompletion();
                    }
                    return;
                }

                if (!transcription || !textChunk.trim() || textChunk.trim() === '<noise>') {
                    return; // Ignore empty or noise-only chunks
                }

                this.debounceTheirCompletion(textChunk);

                this.sendToRenderer('stt-update', {
                    speaker: 'Them',
                    text: this.theirCompletionBuffer,
                    isPartial: true,
                    isFinal: false,
                    timestamp: Date.now(),
                });
            } else {
                const type = message.type;
                const text = message.transcript || message.delta || (message.alternatives && message.alternatives[0]?.transcript) || '';
                if (type === 'conversation.item.input_audio_transcription.delta') {
                    if (this.theirCompletionTimer) clearTimeout(this.theirCompletionTimer);
                    this.theirCompletionTimer = null;
                    this.theirCurrentUtterance += text;
                    const continuousText = this.theirCompletionBuffer + (this.theirCompletionBuffer ? ' ' : '') + this.theirCurrentUtterance;
                    if (text && !text.includes('vq_lbr_audio_')) {
                        this.sendToRenderer('stt-update', {
                            speaker: 'Them',
                            text: continuousText,
                            isPartial: true,
                            isFinal: false,
                            timestamp: Date.now(),
                        });
                    }
                } else if (type === 'conversation.item.input_audio_transcription.completed') {
                    if (text && text.trim()) {
                        const finalUtteranceText = text.trim();
                        this.theirCurrentUtterance = '';
                        this.debounceTheirCompletion(finalUtteranceText);
                    }
                }
            }

            if (message.error) {
                console.error('[Them] STT Session Error:', message.error);
            }
        };

        await this._openRelayConnection({
            language: effectiveLanguage,
            handleMyMessage,
            handleTheirMessage,
        });

        console.log('✅ STT relay connected successfully.');

        return true;
    }

    async renewSessions() {
        console.log('[SttService] renewSessions skipped - relay handles upstream renewal.');
    }

    async sendMicAudioContent(data, mimeType) {
        if (!this.mySttSession) {
            throw new Error('User STT session not active');
        }

        let modelInfo = this.modelInfo;
        if (!modelInfo) {
            console.warn('[SttService] modelInfo not found, fetching on-the-fly as a fallback...');
            modelInfo = await modelStateService.getCurrentModelInfo('stt');
        }
        if (!modelInfo) {
            throw new Error('STT model info could not be retrieved.');
        }

        const payload = { audio: { data, mimeType: mimeType || 'audio/pcm;rate=24000' } };
        await this.mySttSession.sendRealtimeInput(payload);
    }

    async sendSystemAudioContent(data, mimeType) {
        if (!this.theirSttSession) {
            throw new Error('Their STT session not active');
        }

        let modelInfo = this.modelInfo;
        if (!modelInfo) {
            console.warn('[SttService] modelInfo not found, fetching on-the-fly as a fallback...');
            modelInfo = await modelStateService.getCurrentModelInfo('stt');
        }
        if (!modelInfo) {
            throw new Error('STT model info could not be retrieved.');
        }

        const payload = { audio: { data, mimeType: mimeType || 'audio/pcm;rate=24000' } };

        await this.theirSttSession.sendRealtimeInput(payload);
        return { success: true };
    }

    async _openRelayConnection({ language, handleMyMessage, handleTheirMessage }) {
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
                const openPayload = {
                    type: 'OPEN',
                    sessionId: this.relaySessionId,
                    language,
                    streams: ['my', 'their'],
                };

                try {
                    socket.send(JSON.stringify(openPayload));
                } catch (err) {
                    console.error('[SttService] Failed to send OPEN payload to relay:', err.message || err);
                    settleReject(err);
                }
            });

            socket.on('message', raw => {
                let message;
                try {
                    message = JSON.parse(raw.toString());
                } catch (err) {
                    console.warn('[SttService] Failed to parse relay payload:', err.message || err);
                    return;
                }

                const streamId = (message.stream || message.speaker || '').toLowerCase();
                const dispatch = streamId === 'their' ? handleTheirMessage : handleMyMessage;

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
                        if (typeof dispatch === 'function' && message.text && message.text !== '<noise>') {
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
                        console.error('[SttService] Relay error:', message.message || message.code || message);
                        if (!this.relayReady) {
                            settleReject(new Error(message.message || 'Relay error'));
                        }
                        if (this.onStatusUpdate) {
                            this.onStatusUpdate('Relay error');
                        }
                        break;

                    case 'CLOSED':
                        console.log('[SttService] Relay closed stream:', streamId || 'all');
                        break;

                    case 'ACK':
                        // No-op acknowledgements
                        break;

                    default:
                        console.log('[SttService] Relay event:', message.type);
                }
            });

            socket.on('error', err => {
                console.error('[SttService] Relay socket error:', err.message || err);
                if (!this.relayReady) {
                    settleReject(err);
                } else if (this.onStatusUpdate) {
                    this.onStatusUpdate('Relay error');
                }
            });

            socket.on('close', () => {
                console.log('[SttService] Relay socket closed');
                const wasReady = this.relayReady;
                this._teardownRelayState();
                if (!wasReady) {
                    settleReject(new Error('Relay connection closed before ready'));
                } else if (this.onStatusUpdate) {
                    this.onStatusUpdate('Relay disconnected');
                }
            });
        });
    }

    _installRelaySessions() {
        const closeRelay = () => this._closeRelayConnection();

        this.mySttSession = {
            sendRealtimeInput: payload => this._sendRelayAudio('my', payload),
            close: closeRelay,
        };

        this.theirSttSession = {
            sendRealtimeInput: payload => this._sendRelayAudio('their', payload),
            close: closeRelay,
        };
    }

    _sendRelayAudio(stream, payload) {
        if (!this.relaySocket || this.relaySocket.readyState !== WebSocket.OPEN) {
            throw new Error('Relay connection not ready');
        }

        const audioPayload = payload?.audio || {};
        const data = audioPayload.data || payload?.data || payload;
        if (!data || typeof data !== 'string') {
            throw new Error('Invalid audio payload');
        }

        const message = {
            type: 'AUDIO',
            sessionId: this.relaySessionId,
            stream,
            mimeType: audioPayload.mimeType || payload?.mimeType || 'audio/pcm;rate=24000',
            data,
        };

        try {
            this.relaySocket.send(JSON.stringify(message));
        } catch (err) {
            console.error('[SttService] Failed to send audio to relay:', err.message || err);
            throw err;
        }
    }

    async _closeRelayConnection(sendClose = true) {
        if (!this.relaySocket) return;

        const socket = this.relaySocket;

        if (sendClose && socket.readyState === WebSocket.OPEN) {
            try {
                socket.send(JSON.stringify({ type: 'CLOSE', sessionId: this.relaySessionId }));
            } catch (err) {
                console.warn('[SttService] Failed to notify relay about close:', err.message || err);
            }
        }

        try {
            socket.close();
        } catch (err) {
            console.warn('[SttService] Error while closing relay socket:', err.message || err);
        }

        this._teardownRelayState();
    }

    _teardownRelayState() {
        this.relaySocket = null;
        this.relaySessionId = null;
        this.relayReady = false;
        this.mySttSession = null;
        this.theirSttSession = null;
    }

    killExistingSystemAudioDump() {
        return new Promise(resolve => {
            console.log('Checking for existing SystemAudioDump processes...');

            const killProc = spawn('pkill', ['-f', 'SystemAudioDump'], {
                stdio: 'ignore',
            });

            killProc.on('close', code => {
                if (code === 0) {
                    console.log('Killed existing SystemAudioDump processes');
                } else {
                    console.log('No existing SystemAudioDump processes found');
                }
                resolve();
            });

            killProc.on('error', err => {
                console.log('Error checking for existing processes (this is normal):', err.message);
                resolve();
            });

            setTimeout(() => {
                killProc.kill();
                resolve();
            }, 2000);
        });
    }

    async startMacOSAudioCapture() {
        if (process.platform !== 'darwin' || !this.theirSttSession) return false;

        await this.killExistingSystemAudioDump();
        console.log('Starting macOS audio capture for "Them"...');

        const { app } = require('electron');
        const path = require('path');
        const systemAudioPath = app.isPackaged
            ? path.join(process.resourcesPath, 'app.asar.unpacked', 'src', 'ui', 'assets', 'SystemAudioDump')
            : path.join(app.getAppPath(), 'src', 'ui', 'assets', 'SystemAudioDump');

        console.log('SystemAudioDump path:', systemAudioPath);

        this.systemAudioProc = spawn(systemAudioPath, [], {
            stdio: ['ignore', 'pipe', 'pipe'],
        });

        if (!this.systemAudioProc.pid) {
            console.error('Failed to start SystemAudioDump');
            return false;
        }

        console.log('SystemAudioDump started with PID:', this.systemAudioProc.pid);

        const CHUNK_DURATION = 0.1;
        const SAMPLE_RATE = 24000;
        const BYTES_PER_SAMPLE = 2;
        const CHANNELS = 2;
        const CHUNK_SIZE = SAMPLE_RATE * BYTES_PER_SAMPLE * CHANNELS * CHUNK_DURATION;

        let audioBuffer = Buffer.alloc(0);

        // const provider = await this.getAiProvider();
        // const isGemini = provider === 'gemini';

        let modelInfo = this.modelInfo;
        if (!modelInfo) {
            console.warn('[SttService] modelInfo not found, fetching on-the-fly as a fallback...');
            modelInfo = await modelStateService.getCurrentModelInfo('stt');
        }
        if (!modelInfo) {
            throw new Error('STT model info could not be retrieved.');
        }

        this.systemAudioProc.stdout.on('data', async data => {
            audioBuffer = Buffer.concat([audioBuffer, data]);

            while (audioBuffer.length >= CHUNK_SIZE) {
                const chunk = audioBuffer.slice(0, CHUNK_SIZE);
                audioBuffer = audioBuffer.slice(CHUNK_SIZE);

                const monoChunk = CHANNELS === 2 ? this.convertStereoToMono(chunk) : chunk;
                const base64Data = monoChunk.toString('base64');

                this.sendToRenderer('system-audio-data', { data: base64Data });

                if (this.theirSttSession) {
                    try {
                        let payload;
                        if (modelInfo.provider === 'gemini') {
                            payload = { audio: { data: base64Data, mimeType: 'audio/pcm;rate=24000' } };
                        } else {
                            payload = base64Data;
                        }

                        await this.theirSttSession.sendRealtimeInput(payload);
                    } catch (err) {
                        console.error('Error sending system audio:', err.message);
                    }
                }
            }
        });

        this.systemAudioProc.stderr.on('data', data => {
            console.error('SystemAudioDump stderr:', data.toString());
        });

        this.systemAudioProc.on('close', code => {
            console.log('SystemAudioDump process closed with code:', code);
            this.systemAudioProc = null;
        });

        this.systemAudioProc.on('error', err => {
            console.error('SystemAudioDump process error:', err);
            this.systemAudioProc = null;
        });

        return true;
    }

    convertStereoToMono(stereoBuffer) {
        const samples = stereoBuffer.length / 4;
        const monoBuffer = Buffer.alloc(samples * 2);

        for (let i = 0; i < samples; i++) {
            const leftSample = stereoBuffer.readInt16LE(i * 4);
            monoBuffer.writeInt16LE(leftSample, i * 2);
        }

        return monoBuffer;
    }

    stopMacOSAudioCapture() {
        if (this.systemAudioProc) {
            console.log('Stopping SystemAudioDump...');
            this.systemAudioProc.kill('SIGTERM');
            this.systemAudioProc = null;
        }
    }

    isSessionActive() {
        return !!this.mySttSession && !!this.theirSttSession;
    }

    async closeSessions() {
        this.stopMacOSAudioCapture();

        // Clear heartbeat / renewal timers
        if (this.keepAliveInterval) {
            clearInterval(this.keepAliveInterval);
            this.keepAliveInterval = null;
        }
        if (this.sessionRenewTimeout) {
            clearTimeout(this.sessionRenewTimeout);
            this.sessionRenewTimeout = null;
        }

        // Clear timers
        if (this.myCompletionTimer) {
            clearTimeout(this.myCompletionTimer);
            this.myCompletionTimer = null;
        }
        if (this.theirCompletionTimer) {
            clearTimeout(this.theirCompletionTimer);
            this.theirCompletionTimer = null;
        }

        await this._closeRelayConnection();
        console.log('All STT sessions closed.');

        // Reset state
        this.myCurrentUtterance = '';
        this.theirCurrentUtterance = '';
        this.myCompletionBuffer = '';
        this.theirCompletionBuffer = '';
        this.modelInfo = null;
    }
}

module.exports = SttService;
