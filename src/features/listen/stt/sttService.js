const { spawn } = require('child_process');
const { randomUUID } = require('crypto');
const WebSocket = require('ws');
const authService = require('../../common/services/authService');
const config = require('../../common/config/config');

const COMPLETION_DEBOUNCE_MS = config.get('utteranceSilenceMs') ?? 800;
const MAX_UTTERANCE_CHARS = (() => {
    const value = Number(config.get('maxUtteranceChars'));
    return Number.isFinite(value) && value > 0 ? value : 0;
})();
const DB_FALLBACK_MS = 3000;
const DEFAULT_RELAY_URL = process.env.STT_RELAY_URL || config.get('sttRelayUrl') || 'wss://websocket-production-395f.up.railway.app';

class SttService {
    constructor() {
        this.meSttSession = null;
        this.themSttSession = null;
        // Current utterance variables are not needed for relay; we rely on buffered partials

        // Turn-completion debouncing
        this.meCompletionBuffer = '';
        this.themCompletionBuffer = '';
        this.meCompletionTimer = null;
        this.themCompletionTimer = null;
        this.meCommittedLength = 0;
        this.themCommittedLength = 0;

        // System audio capture
        this.systemAudioProc = null;

        // Callbacks
        this.onTranscriptionComplete = null;
        this.onStatusUpdate = null;

        // Model/provider info is no longer needed on client; relay abstracts providers

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

    flushMeCompletion(sendToUI = true) {
        const rawText = this.meCompletionBuffer || '';
        const uncommitted = rawText.slice(this.meCommittedLength).trim();
        const finalText = uncommitted;
        if (!finalText) return;

        this._emitFinalUtterance('Me', finalText, sendToUI);

        this.meCompletionBuffer = '';
        this.meCompletionTimer = null;
        this.meCommittedLength = 0;
        // Reset state

        if (this.onStatusUpdate) {
            this.onStatusUpdate('Listening...');
        }
    }

    flushThemCompletion(sendToUI = true) {
        const rawText = this.themCompletionBuffer || '';
        const uncommitted = rawText.slice(this.themCommittedLength).trim();
        const finalText = uncommitted;
        if (!finalText) return;

        this._emitFinalUtterance('Them', finalText, sendToUI);

        this.themCompletionBuffer = '';
        this.themCompletionTimer = null;
        this.themCommittedLength = 0;
        // Reset state

        if (this.onStatusUpdate) {
            this.onStatusUpdate('Listening...');
        }
    }

    _handlePartialSegmentation({ speakerLabel, textChunk, committedKey }) {
        if (!textChunk) return '';
        if (!MAX_UTTERANCE_CHARS) {
            this[committedKey] = 0;
            return textChunk;
        }

        let committedLength = this[committedKey] || 0;
        committedLength = Math.max(0, Math.min(committedLength, textChunk.length));

        while (textChunk.length - committedLength > MAX_UTTERANCE_CHARS) {
            const splitIndex = this._findSplitIndex(textChunk, committedLength);
            if (splitIndex <= committedLength) {
                // Safety: avoid infinite loops by hard-advancing at least the limit
                committedLength = Math.min(textChunk.length, committedLength + MAX_UTTERANCE_CHARS);
            } else {
                const segment = textChunk.slice(committedLength, splitIndex).trim();
                committedLength = splitIndex;
                if (segment) {
                    console.log(
                        `[SttService] Forced utterance split (${speakerLabel}) - ${segment.length} chars (limit ${MAX_UTTERANCE_CHARS})`
                    );
                    this._emitFinalUtterance(speakerLabel, segment, true);
                }
            }
        }

        this[committedKey] = committedLength;
        return textChunk.slice(committedLength);
    }

    _findSplitIndex(text, startIdx) {
        const hardLimit = Math.min(text.length, startIdx + MAX_UTTERANCE_CHARS);
        if (hardLimit <= startIdx) {
            return startIdx;
        }

        const window = text.slice(startIdx, hardLimit);
        const preferredMarkers = ['\n', '. ', '? ', '! ', '; ', ': ', ', ', ' '];
        const minSplitOffset = Math.floor(MAX_UTTERANCE_CHARS * 0.3);

        for (const marker of preferredMarkers) {
            const relativeIdx = window.lastIndexOf(marker);
            if (relativeIdx !== -1 && relativeIdx >= minSplitOffset) {
                return startIdx + relativeIdx + marker.length;
            }
        }

        return hardLimit;
    }

    _emitFinalUtterance(speaker, text, sendToUI = true) {
        const finalText = (text || '').trim();
        if (!finalText) return;

        if (this.onTranscriptionComplete) {
            this.onTranscriptionComplete(speaker, finalText);
        }

        if (sendToUI) {
            this.sendToRenderer('stt-update', {
                speaker,
                text: finalText,
                isPartial: false,
                isFinal: true,
                timestamp: Date.now(),
            });
        }
    }

    debounceMeCompletion(text) {
        // Soniox sends full rewrites - replace buffer instead of concatenating
        this.meCompletionBuffer = text;

        if (this.meCompletionTimer) clearTimeout(this.meCompletionTimer);
        this.meCompletionTimer = setTimeout(() => this.flushMeCompletion(), COMPLETION_DEBOUNCE_MS);
    }

    debounceThemCompletion(text) {
        // Soniox sends full rewrites - replace buffer instead of concatenating
        this.themCompletionBuffer = text;

        if (this.themCompletionTimer) clearTimeout(this.themCompletionTimer);
        this.themCompletionTimer = setTimeout(() => this.flushThemCompletion(), COMPLETION_DEBOUNCE_MS);
    }

    async initializeSttSessions(language = 'en') {
        const effectiveLanguage = process.env.OPENAI_TRANSCRIBE_LANG || language || 'en';

        console.log('[SttService] Initializing STT relay');

        const handleMeMessage = message => {
            if (!message || typeof message !== 'object') return;

            // Turn complete flush
            if (message.serverContent?.turnComplete) {
                if (this.meCompletionTimer) {
                    clearTimeout(this.meCompletionTimer);
                    this.flushMeCompletion();
                }
                return;
            }

            const transcription = message.serverContent?.inputTranscription;
            const textChunk = transcription?.text || '';
            const trimmed = textChunk.trim();
            if (!transcription || !trimmed || trimmed === '<noise>' || trimmed === '<end>') return;

            this.meCompletionBuffer = textChunk;

            const remainder = this._handlePartialSegmentation({
                speakerLabel: 'Me',
                textChunk,
                committedKey: 'meCommittedLength',
            });

            if (remainder) {
                this.sendToRenderer('stt-update', {
                    speaker: 'Me',
                    text: remainder,
                    isPartial: true,
                    isFinal: false,
                    timestamp: Date.now(),
                });
            }

            // Clear and reset debounce timer for DB persistence
            if (this.meCompletionTimer) clearTimeout(this.meCompletionTimer);
            this.meCompletionTimer = setTimeout(() => {
                // Fallback: Save to DB if no TURN_COMPLETE received after long pause
                this.flushMeCompletion(false); // Save to DB but don't send FINAL to UI
            }, DB_FALLBACK_MS); // 3 second fallback for DB save only

            if (message?.serverContent?.usageMetadata) {
                console.log('[STT - Me] Tokens In:', message.serverContent.usageMetadata.promptTokenCount);
                console.log('[STT - Me] Tokens Out:', message.serverContent.usageMetadata.candidatesTokenCount);
            }

            if (message.error) {
                console.error('[Me] STT Session Error:', message.error);
            }
        };

        const handleThemMessage = message => {
            if (!message || typeof message !== 'object') return;

            if (message?.serverContent?.usageMetadata) {
                console.log('[STT - Them] Tokens In:', message.serverContent.usageMetadata.promptTokenCount);
                console.log('[STT - Them] Tokens Out:', message.serverContent.usageMetadata.candidatesTokenCount);
            }

            if (message.serverContent?.turnComplete) {
                if (this.themCompletionTimer) {
                    clearTimeout(this.themCompletionTimer);
                    this.flushThemCompletion();
                }
                return;
            }

            const transcription = message.serverContent?.inputTranscription;
            const textChunk = transcription?.text || '';
            const trimmed = textChunk.trim();
            if (!transcription || !trimmed || trimmed === '<noise>' || trimmed === '<end>') return;

            this.themCompletionBuffer = textChunk;

            const remainder = this._handlePartialSegmentation({
                speakerLabel: 'Them',
                textChunk,
                committedKey: 'themCommittedLength',
            });

            if (remainder) {
                this.sendToRenderer('stt-update', {
                    speaker: 'Them',
                    text: remainder,
                    isPartial: true,
                    isFinal: false,
                    timestamp: Date.now(),
                });
            }

            // Clear and reset debounce timer for DB persistence
            if (this.themCompletionTimer) clearTimeout(this.themCompletionTimer);
            this.themCompletionTimer = setTimeout(() => {
                // Fallback: Save to DB if no TURN_COMPLETE received after long pause
                this.flushThemCompletion(false); // Save to DB but don't send FINAL to UI
            }, DB_FALLBACK_MS); // 3 second fallback for DB save only

            if (message.error) {
                console.error('[Them] STT Session Error:', message.error);
            }
        };

        await this._openRelayConnection({
            language: effectiveLanguage,
            handleMeMessage: handleMeMessage,
            handleThemMessage: handleThemMessage,
        });

        console.log('✅ STT relay connected successfully.');

        return true;
    }

    async renewSessions() {
        console.log('[SttService] renewSessions skipped - relay handles upstream renewal.');
    }

    async sendMicAudioContent(data, mimeType) {
        if (!this.meSttSession) {
            throw new Error('User STT session not active');
        }
        const payload = { audio: { data, mimeType: mimeType || 'audio/pcm;rate=16000' } };
        await this.meSttSession.sendRealtimeInput(payload);
    }

    async sendSystemAudioContent(data, mimeType) {
        if (!this.themSttSession) {
            throw new Error('Them STT session not active');
        }
        const payload = { audio: { data, mimeType: mimeType || 'audio/pcm;rate=16000' } };
        await this.themSttSession.sendRealtimeInput(payload);
        return { success: true };
    }

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

            const sessionUuid = authService.sessionUuid || null; // Direct access instead of authService?.getCurrentUser()?.sessionUuid
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
                    streams: ['me', 'them'],
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

        this.meSttSession = {
            sendRealtimeInput: payload => this._sendRelayAudio('me', payload),
            close: closeRelay,
        };

        this.themSttSession = {
            sendRealtimeInput: payload => this._sendRelayAudio('them', payload),
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
            mimeType: audioPayload.mimeType || payload?.mimeType || 'audio/pcm;rate=16000',
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
        this.meCommittedLength = 0;
        this.themCommittedLength = 0;
        this.meSttSession = null;
        this.themSttSession = null;
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
        if (process.platform !== 'darwin' || !this.themSttSession) return false;

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
        const SAMPLE_RATE = 16000;
        const BYTES_PER_SAMPLE = 2;
        const CHANNELS = 2;
        const CHUNK_SIZE = SAMPLE_RATE * BYTES_PER_SAMPLE * CHANNELS * CHUNK_DURATION;

        let audioBuffer = Buffer.alloc(0);

        // Payload always uses relay format

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
                        const payload = { audio: { data: base64Data, mimeType: 'audio/pcm;rate=16000' } };
                        await this.themSttSession.sendRealtimeInput(payload);
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
        return !!this.meSttSession && !!this.themSttSession;
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
        if (this.meCompletionTimer) {
            clearTimeout(this.meCompletionTimer);
            this.meCompletionTimer = null;
        }
        if (this.themCompletionTimer) {
            clearTimeout(this.themCompletionTimer);
            this.themCompletionTimer = null;
        }

        await this._closeRelayConnection();
        console.log('All STT sessions closed.');

        // Reset state
        this.meCompletionBuffer = '';
        this.themCompletionBuffer = '';
        this.meCommittedLength = 0;
        this.themCommittedLength = 0;
    }
}

module.exports = SttService;
