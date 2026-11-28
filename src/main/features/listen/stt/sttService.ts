import { spawn, type ChildProcessByStdio } from 'child_process';
import { randomUUID } from 'crypto';
import type { Readable } from 'stream';
import WebSocket from 'ws';
import { z } from 'zod';
import authService from '../../common/services/authService';
import { app } from 'electron';
import path from 'path';
import config from '../../common/config/config';
import { env } from '../../common/config/env';
import { logger } from '../../common/utils/logger';
import { windowPool } from '../../../window/windowManager';

const log = logger.child({ module: 'SttService' });

const MAX_UTTERANCE_CHARS = (() => {
    const value = Number(config.get('maxUtteranceChars'));
    return Number.isFinite(value) && value > 0 ? value : 0;
})();
const DB_FALLBACK_MS = 3000;
const DEFAULT_RELAY_URL = env.STT_RELAY_URL ?? config.get('sttRelayUrl');
const DEFAULT_MIME_TYPE = 'audio/pcm;rate=16000';

export type Speaker = 'Me' | 'Them';
type RelayStream = 'me' | 'them';
type CommittedKey = 'meCommittedLength' | 'themCommittedLength';

// A message from the STT relay (`../websocket`), with the fields this service reads. The relay
// also sends fields nobody reads here (session ids, quota status); those are dropped.
const RelayMessageSchema = z.object({
    type: z.string().optional(),
    stream: z.string().optional(),
    speaker: z.string().optional(),
    text: z.string().optional(),
    promptTokens: z.number().optional(),
    candidateTokens: z.number().optional(),
    message: z.string().optional(),
    code: z.string().optional(),
});

export type RelayMessage = z.infer<typeof RelayMessageSchema>;

// One relay event as the per-speaker handlers read it.
type StreamMessage = {
    serverContent: {
        inputTranscription?: { text: string };
        turnComplete?: boolean;
        usageMetadata?: { promptTokenCount: number | undefined; candidatesTokenCount: number | undefined };
    };
};

export type AudioPayload = { audio: { data: string; mimeType: string } };

export type AudioContent = { data: string; mimeType?: string | undefined };

type RelaySession = {
    sendRealtimeInput: (payload: AudioPayload) => Promise<void>;
    close: () => Promise<void>;
};

export type SttCallbacks = {
    onTranscriptionComplete: ({ speaker, text }: { speaker: Speaker; text: string }) => void;
    onQuotaExceeded: (resetAt: string) => void;
};

type SystemAudioProcess = ChildProcessByStdio<null, Readable, Readable>;

class SttService {
    meSttSession: RelaySession | null = null;
    themSttSession: RelaySession | null = null;
    // Current utterance variables are not needed for relay; we rely on buffered partials

    // Turn-completion debouncing
    meCompletionBuffer = '';
    themCompletionBuffer = '';
    meCompletionTimer: NodeJS.Timeout | null = null;
    themCompletionTimer: NodeJS.Timeout | null = null;
    meCommittedLength = 0;
    themCommittedLength = 0;

    // System audio capture
    systemAudioProc: SystemAudioProcess | null = null;

    // Callbacks
    onTranscriptionComplete: SttCallbacks['onTranscriptionComplete'] | null = null;
    onQuotaExceeded: SttCallbacks['onQuotaExceeded'] | null = null;

    // Relay connection state
    relaySocket: WebSocket | null = null;
    relaySessionId: string | null = null;
    relayReady = false;

    setCallbacks({ onTranscriptionComplete, onQuotaExceeded }: SttCallbacks): void {
        this.onTranscriptionComplete = onTranscriptionComplete;
        this.onQuotaExceeded = onQuotaExceeded;
    }

    sendToRenderer({ channel, data }: { channel: string; data: unknown }): void {
        // Send Listen-related events only to Listen window (prevent Ask window conflicts)
        const listenWindow = windowPool?.get('listen');

        if (listenWindow && !listenWindow.isDestroyed()) {
            listenWindow.webContents.send(channel, data);
        }
    }

    flushMeCompletion(sendToUI = true): void {
        const rawText = this.meCompletionBuffer || '';
        const finalText = rawText.slice(this.meCommittedLength).trim();
        if (!finalText) return;

        this._emitFinalUtterance({ speaker: 'Me', text: finalText, sendToUI });

        this.meCompletionBuffer = '';
        this.meCompletionTimer = null;
        this.meCommittedLength = 0;
    }

    flushThemCompletion(sendToUI = true): void {
        const rawText = this.themCompletionBuffer || '';
        const finalText = rawText.slice(this.themCommittedLength).trim();
        if (!finalText) return;

        this._emitFinalUtterance({ speaker: 'Them', text: finalText, sendToUI });

        this.themCompletionBuffer = '';
        this.themCompletionTimer = null;
        this.themCommittedLength = 0;
    }

    _handlePartialSegmentation({ speakerLabel, textChunk, committedKey }: { speakerLabel: Speaker; textChunk: string; committedKey: CommittedKey }): string {
        if (!textChunk) return '';
        if (!MAX_UTTERANCE_CHARS) {
            this[committedKey] = 0;
            return textChunk;
        }

        let committedLength = this[committedKey] || 0;
        committedLength = Math.max(0, Math.min(committedLength, textChunk.length));

        while (textChunk.length - committedLength > MAX_UTTERANCE_CHARS) {
            const splitIndex = this._findSplitIndex({ text: textChunk, startIdx: committedLength });
            if (splitIndex <= committedLength) {
                // Safety: avoid infinite loops by hard-advancing at least the limit
                committedLength = Math.min(textChunk.length, committedLength + MAX_UTTERANCE_CHARS);
            } else {
                const segment = textChunk.slice(committedLength, splitIndex).trim();
                committedLength = splitIndex;
                if (segment) {
                    log.info(
                        { relaySessionId: this.relaySessionId, speaker: speakerLabel, chars: segment.length, limit: MAX_UTTERANCE_CHARS },
                        'Forced utterance split'
                    );
                    this._emitFinalUtterance({ speaker: speakerLabel, text: segment, sendToUI: true });
                }
            }
        }

        this[committedKey] = committedLength;
        return textChunk.slice(committedLength);
    }

    _findSplitIndex({ text, startIdx }: { text: string; startIdx: number }): number {
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

    _emitFinalUtterance({ speaker, text, sendToUI = true }: { speaker: Speaker; text: string; sendToUI?: boolean }): void {
        const finalText = (text || '').trim();
        if (!finalText) return;

        if (this.onTranscriptionComplete) {
            this.onTranscriptionComplete({ speaker, text: finalText });
        }

        if (sendToUI) {
            this.sendToRenderer({
                channel: 'stt-update',
                data: {
                    speaker,
                    text: finalText,
                    isPartial: false,
                    isFinal: true,
                    timestamp: Date.now(),
                },
            });
        }
    }

    async initializeSttSessions(language = 'en'): Promise<true> {
        const effectiveLanguage = env.OPENAI_TRANSCRIBE_LANG || language || 'en';

        log.info({ language: effectiveLanguage }, 'Initializing STT relay');

        const handleMeMessage = (message: StreamMessage) => {
            // Turn complete flush
            if (message.serverContent.turnComplete) {
                if (this.meCompletionTimer) {
                    clearTimeout(this.meCompletionTimer);
                    this.flushMeCompletion();
                }
                return;
            }

            const transcription = message.serverContent.inputTranscription;
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
                this.sendToRenderer({
                    channel: 'stt-update',
                    data: {
                        speaker: 'Me',
                        text: remainder,
                        isPartial: true,
                        isFinal: false,
                        timestamp: Date.now(),
                    },
                });
            }

            // Clear and reset debounce timer for DB persistence
            if (this.meCompletionTimer) clearTimeout(this.meCompletionTimer);
            this.meCompletionTimer = setTimeout(() => {
                // Fallback: Save to DB if no TURN_COMPLETE received after long pause
                this.flushMeCompletion(false); // Save to DB but don't send FINAL to UI
            }, DB_FALLBACK_MS); // 3 second fallback for DB save only
        };

        const handleThemMessage = (message: StreamMessage) => {
            const usage = message.serverContent.usageMetadata;
            if (usage) {
                log.info(
                    { relaySessionId: this.relaySessionId, tokensIn: usage.promptTokenCount, tokensOut: usage.candidatesTokenCount },
                    'Them stream usage'
                );
            }

            if (message.serverContent.turnComplete) {
                if (this.themCompletionTimer) {
                    clearTimeout(this.themCompletionTimer);
                    this.flushThemCompletion();
                }
                return;
            }

            const transcription = message.serverContent.inputTranscription;
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
                this.sendToRenderer({
                    channel: 'stt-update',
                    data: {
                        speaker: 'Them',
                        text: remainder,
                        isPartial: true,
                        isFinal: false,
                        timestamp: Date.now(),
                    },
                });
            }

            // Clear and reset debounce timer for DB persistence
            if (this.themCompletionTimer) clearTimeout(this.themCompletionTimer);
            this.themCompletionTimer = setTimeout(() => {
                // Fallback: Save to DB if no TURN_COMPLETE received after long pause
                this.flushThemCompletion(false); // Save to DB but don't send FINAL to UI
            }, DB_FALLBACK_MS); // 3 second fallback for DB save only
        };

        await this._openRelayConnection({
            language: effectiveLanguage,
            handleMeMessage: handleMeMessage,
            handleThemMessage: handleThemMessage,
        });

        log.info({ relaySessionId: this.relaySessionId }, 'STT relay connected');

        return true;
    }

    async sendMicAudioContent({ data, mimeType }: AudioContent): Promise<void> {
        if (!this.meSttSession) {
            throw new Error('User STT session not active');
        }
        const payload = { audio: { data, mimeType: mimeType || DEFAULT_MIME_TYPE } };
        await this.meSttSession.sendRealtimeInput(payload);
    }

    async sendSystemAudioContent({ data, mimeType }: AudioContent): Promise<{ success: true }> {
        if (!this.themSttSession) {
            throw new Error('Them STT session not active');
        }
        const payload = { audio: { data, mimeType: mimeType || DEFAULT_MIME_TYPE } };
        await this.themSttSession.sendRealtimeInput(payload);
        return { success: true };
    }

    async _openRelayConnection({
        language,
        handleMeMessage,
        handleThemMessage,
    }: {
        language: string;
        handleMeMessage: (message: StreamMessage) => void;
        handleThemMessage: (message: StreamMessage) => void;
    }): Promise<true> {
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

            log.info({ relayUrl, language }, 'Connecting to STT relay');

            const settleResolve = () => {
                if (!settled) {
                    settled = true;
                    resolve(true);
                }
            };

            const settleReject = (error: unknown) => {
                if (!settled) {
                    settled = true;
                    reject(error);
                }
            };

            const sessionUuid = authService.sessionUuid || null;
            if (!sessionUuid) {
                const error = new Error('STT relay connection blocked: missing authenticated session');
                log.error({ err: error }, 'STT relay connection blocked');
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
                    log.error({ err, relaySessionId: this.relaySessionId }, 'Failed to send OPEN payload to relay');
                    settleReject(err);
                }
            });

            socket.on('message', (raw: WebSocket.RawData) => {
                let json: unknown;
                try {
                    json = JSON.parse(raw.toString());
                } catch (err) {
                    log.warn({ err, relaySessionId: this.relaySessionId }, 'Failed to parse relay payload');
                    return;
                }
                const parsed = RelayMessageSchema.safeParse(json);
                if (!parsed.success) {
                    log.warn({ relaySessionId: this.relaySessionId, issues: z.prettifyError(parsed.error) }, 'Ignoring relay payload of unexpected shape');
                    return;
                }
                const message = parsed.data;

                const streamId = (message.stream || message.speaker || '').toLowerCase();
                const dispatch = streamId === 'them' ? handleThemMessage : handleMeMessage;

                switch (message.type) {
                    case 'CONNECTED':
                        this._installRelaySessions();
                        this.relayReady = true;
                        settleResolve();
                        break;

                    case 'PARTIAL':
                        if (message.text && message.text !== '<noise>') {
                            dispatch({
                                serverContent: {
                                    inputTranscription: { text: message.text },
                                },
                            });
                        }
                        break;

                    case 'TURN_COMPLETE':
                        dispatch({ serverContent: { turnComplete: true } });
                        break;

                    case 'USAGE':
                        dispatch({
                            serverContent: {
                                usageMetadata: {
                                    promptTokenCount: message.promptTokens,
                                    candidatesTokenCount: message.candidateTokens,
                                },
                            },
                        });
                        break;

                    case 'ERROR':
                        log.error(
                            { relaySessionId: this.relaySessionId, code: message.code, relayMessage: message.message },
                            'Relay error'
                        );
                        if (!this.relayReady) {
                            settleReject(new Error(message.message || 'Relay error'));
                        }
                        break;

                    case 'CLOSED':
                        log.info({ relaySessionId: this.relaySessionId, stream: streamId || 'all' }, 'Relay closed stream');
                        break;

                    case 'ACK':
                        // No-op acknowledgements
                        break;

                    default:
                        log.info({ relaySessionId: this.relaySessionId, type: message.type }, 'Relay event');
                }
            });

            socket.on('error', (err: Error) => {
                log.error({ err, relaySessionId: this.relaySessionId }, 'Relay socket error');
                if (!this.relayReady) {
                    settleReject(err);
                }
            });

            socket.on('close', (code: number, reason: Buffer) => {
                const reasonStr = reason.toString() || '';
                log.info({ relaySessionId: this.relaySessionId, code, reason: reasonStr }, 'Relay socket closed');

                // Handle STT quota exceeded (close code 4429)
                if (code === 4429) {
                    const match = reasonStr.match(/resetAt=([^\s]+)/);
                    const resetAt = match?.[1] ?? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
                    log.info({ relaySessionId: this.relaySessionId, resetAt }, 'STT quota exceeded');

                    if (this.onQuotaExceeded) {
                        this.onQuotaExceeded(resetAt);
                    }
                }

                const wasReady = this.relayReady;
                this._teardownRelayState();
                if (!wasReady) {
                    settleReject(new Error('Relay connection closed before ready'));
                }
            });
        });
    }

    _installRelaySessions(): void {
        const closeRelay = () => this._closeRelayConnection();

        this.meSttSession = {
            sendRealtimeInput: async payload => this._sendRelayAudio({ stream: 'me', payload }),
            close: closeRelay,
        };

        this.themSttSession = {
            sendRealtimeInput: async payload => this._sendRelayAudio({ stream: 'them', payload }),
            close: closeRelay,
        };
    }

    _sendRelayAudio({ stream, payload }: { stream: RelayStream; payload: AudioPayload }): void {
        if (!this.relaySocket || this.relaySocket.readyState !== WebSocket.OPEN) {
            throw new Error('Relay connection not ready');
        }

        const { data, mimeType } = payload.audio;
        if (!data) {
            throw new Error('Invalid audio payload');
        }

        const message = {
            type: 'AUDIO',
            sessionId: this.relaySessionId,
            stream,
            mimeType: mimeType || DEFAULT_MIME_TYPE,
            data,
        };

        try {
            this.relaySocket.send(JSON.stringify(message));
        } catch (err) {
            log.error({ err, relaySessionId: this.relaySessionId, stream }, 'Failed to send audio to relay');
            throw err;
        }
    }

    async _closeRelayConnection(sendClose = true): Promise<void> {
        if (!this.relaySocket) return;

        const socket = this.relaySocket;

        if (sendClose && socket.readyState === WebSocket.OPEN) {
            try {
                socket.send(JSON.stringify({ type: 'CLOSE', sessionId: this.relaySessionId }));
            } catch (err) {
                log.warn({ err, relaySessionId: this.relaySessionId }, 'Failed to notify relay about close');
            }
        }

        try {
            socket.close();
        } catch (err) {
            log.warn({ err, relaySessionId: this.relaySessionId }, 'Error while closing relay socket');
        }

        this._teardownRelayState();
    }

    _teardownRelayState(): void {
        this.relaySocket = null;
        this.relaySessionId = null;
        this.relayReady = false;
        this.meCommittedLength = 0;
        this.themCommittedLength = 0;
        this.meSttSession = null;
        this.themSttSession = null;
    }

    killExistingSystemAudioDump(): Promise<void> {
        return new Promise(resolve => {
            log.info('Checking for existing SystemAudioDump processes');

            const killProc = spawn('pkill', ['-f', 'SystemAudioDump'], {
                stdio: 'ignore',
            });

            killProc.on('close', code => {
                if (code === 0) {
                    log.info('Killed existing SystemAudioDump processes');
                } else {
                    log.info('No existing SystemAudioDump processes found');
                }
                resolve();
            });

            killProc.on('error', err => {
                log.info({ err }, 'Error checking for existing SystemAudioDump processes (this is normal)');
                resolve();
            });

            setTimeout(() => {
                killProc.kill();
                resolve();
            }, 2000);
        });
    }

    async startMacOSAudioCapture(): Promise<boolean> {
        if (process.platform !== 'darwin' || !this.themSttSession) return false;

        await this.killExistingSystemAudioDump();
        log.info({ relaySessionId: this.relaySessionId }, 'Starting macOS audio capture for "Them"');

        const systemAudioPath = app.isPackaged
            ? path.join(process.resourcesPath, 'app.asar.unpacked', 'src', 'renderer', 'assets', 'SystemAudioDump')
            : path.join(app.getAppPath(), 'src', 'renderer', 'assets', 'SystemAudioDump');

        log.info({ systemAudioPath }, 'SystemAudioDump path');

        const systemAudioProc = spawn(systemAudioPath, [], {
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        this.systemAudioProc = systemAudioProc;

        if (!systemAudioProc.pid) {
            log.error({ systemAudioPath }, 'Failed to start SystemAudioDump');
            return false;
        }

        log.info({ pid: systemAudioProc.pid }, 'SystemAudioDump started');

        const CHUNK_DURATION = 0.1;
        const SAMPLE_RATE = 16000;
        const BYTES_PER_SAMPLE = 2;
        const CHANNELS = 2;
        const CHUNK_SIZE = SAMPLE_RATE * BYTES_PER_SAMPLE * CHANNELS * CHUNK_DURATION;

        let audioBuffer = Buffer.alloc(0);

        // Payload always uses relay format

        systemAudioProc.stdout.on('data', async (data: Buffer) => {
            audioBuffer = Buffer.concat([audioBuffer, data]);

            while (audioBuffer.length >= CHUNK_SIZE) {
                const chunk = audioBuffer.subarray(0, CHUNK_SIZE);
                audioBuffer = audioBuffer.subarray(CHUNK_SIZE);

                const monoChunk = CHANNELS === 2 ? this.convertStereoToMono(chunk) : chunk;
                const base64Data = monoChunk.toString('base64');

                this.sendToRenderer({ channel: 'system-audio-data', data: { data: base64Data } });

                if (this.themSttSession) {
                    try {
                        const payload = { audio: { data: base64Data, mimeType: DEFAULT_MIME_TYPE } };
                        await this.themSttSession.sendRealtimeInput(payload);
                    } catch (err) {
                        log.error({ err, relaySessionId: this.relaySessionId }, 'Error sending system audio');
                    }
                }
            }
        });

        systemAudioProc.stderr.on('data', (data: Buffer) => {
            log.error({ stderr: data.toString() }, 'SystemAudioDump stderr');
        });

        systemAudioProc.on('close', code => {
            log.info({ code }, 'SystemAudioDump process closed');
            this.systemAudioProc = null;
        });

        systemAudioProc.on('error', err => {
            log.error({ err }, 'SystemAudioDump process error');
            this.systemAudioProc = null;
        });

        return true;
    }

    convertStereoToMono(stereoBuffer: Buffer): Buffer {
        const samples = stereoBuffer.length / 4;
        const monoBuffer = Buffer.alloc(samples * 2);

        for (let i = 0; i < samples; i++) {
            const leftSample = stereoBuffer.readInt16LE(i * 4);
            monoBuffer.writeInt16LE(leftSample, i * 2);
        }

        return monoBuffer;
    }

    stopMacOSAudioCapture(): void {
        if (this.systemAudioProc) {
            log.info('Stopping SystemAudioDump');
            this.systemAudioProc.kill('SIGTERM');
            this.systemAudioProc = null;
        }
    }

    isSessionActive(): boolean {
        return !!this.meSttSession && !!this.themSttSession;
    }

    async closeSessions(): Promise<void> {
        this.stopMacOSAudioCapture();

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
        log.info('All STT sessions closed');

        // Reset state
        this.meCompletionBuffer = '';
        this.themCompletionBuffer = '';
        this.meCommittedLength = 0;
        this.themCommittedLength = 0;
    }
}

export default SttService;
