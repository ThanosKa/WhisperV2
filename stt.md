const { BrowserWindow } = require('electron');
const { spawn } = require('child_process');
// const { createSTT } = require('../../common/ai/factory');
const modelStateService = require('../../common/services/modelStateService');
const config = require('../../common/config/config');

const COMPLETION_DEBOUNCE_MS = config.get('utteranceSilenceMs') || 1200;

// -- New heartbeat / renewal constants --------------------------------------------
// Interval to send low-cost keep-alive messages so the remote service does not
// treat the connection as idle. One minute is safely below the typical 2-5 min
// idle timeout window seen on provider websockets.
const KEEP_ALIVE_INTERVAL_MS = 30 \* 1000; // 30 seconds

// Interval after which we pro-actively tear down and recreate the STT sessions
// to dodge the 5-minute hard timeout enforced by some providers. 4 minutes
// gives a 1-minute safety buffer.
const SESSION_RENEW_INTERVAL_MS = 4 _ 60 _ 1000; // 4 minutes

// Duration to allow the old and new sockets to run in parallel so we don't
// miss any packets at the exact swap moment.
const SOCKET_OVERLAP_MS = 1 \* 1000; // 1 second

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

        // Keep-alive / renewal timers
        this.keepAliveInterval = null;
        this.sessionRenewTimeout = null;

        // Callbacks
        this.onTranscriptionComplete = null;
        this.onStatusUpdate = null;

        this.modelInfo = null;

        // Rate limiting for audio logs
        this.lastAudioLog = { my: 0, their: 0 };
        this.audioLogInterval = 2000; // log every 2 seconds

        // Connection state management
        this.isServerConnected = false;
        this.sessionId = null;
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
        // Treat incoming partials as either an extension of the current utterance
        // or the start of a new token. Do not blindly insert spaces which can
        // split words when providers stream character chunks.
        const sanitized = typeof text === 'string' ? text : '';

        if (sanitized) {
            if (!this.myCurrentUtterance) {
                this.myCurrentUtterance = sanitized;
            } else if (
                // Extension (provider sending growing-prefix partials)
                sanitized.startsWith(this.myCurrentUtterance) ||
                // Or minor contraction (provider correcting text)
                this.myCurrentUtterance.startsWith(sanitized)
            ) {
                this.myCurrentUtterance = sanitized;
            } else {
                // Different chunk that doesn't look like a prefix update.
                // Commit previous utterance to the buffer as a complete token.
                if (this.myCurrentUtterance.trim()) {
                    this.myCompletionBuffer += (this.myCompletionBuffer ? ' ' : '') + this.myCurrentUtterance.trim();
                }
                this.myCurrentUtterance = sanitized;
            }

            // Emit live partial preview to the renderer without introducing extra boundary spaces
            const needsBoundarySpace =
                !!this.myCompletionBuffer &&
                !!this.myCurrentUtterance &&
                !/\s$/.test(this.myCompletionBuffer) &&
                !/^\s/.test(this.myCurrentUtterance);
            const preview = (this.myCompletionBuffer || '') + (needsBoundarySpace ? ' ' : '') + (this.myCurrentUtterance || '');
            if (preview) {
                this.sendToRenderer('stt-update', {
                    speaker: 'Me',
                    text: preview,
                    isPartial: true,
                    isFinal: false,
                    timestamp: Date.now(),
                });
            }
        }

        if (this.myCompletionTimer) clearTimeout(this.myCompletionTimer);
        this.myCompletionTimer = setTimeout(() => this.flushMyCompletion(), COMPLETION_DEBOUNCE_MS);
    }

    debounceTheirCompletion(text) {
        // Same logic as Me stream: avoid splitting words mid-stream and emit live partials
        const sanitized = typeof text === 'string' ? text : '';

        if (sanitized) {
            if (!this.theirCurrentUtterance) {
                this.theirCurrentUtterance = sanitized;
            } else if (sanitized.startsWith(this.theirCurrentUtterance) || this.theirCurrentUtterance.startsWith(sanitized)) {
                this.theirCurrentUtterance = sanitized;
            } else {
                if (this.theirCurrentUtterance.trim()) {
                    this.theirCompletionBuffer += (this.theirCompletionBuffer ? ' ' : '') + this.theirCurrentUtterance.trim();
                }
                this.theirCurrentUtterance = sanitized;
            }

            const needsBoundarySpace =
                !!this.theirCompletionBuffer &&
                !!this.theirCurrentUtterance &&
                !/\s$/.test(this.theirCompletionBuffer) &&
                !/^\s/.test(this.theirCurrentUtterance);
            const preview = (this.theirCompletionBuffer || '') + (needsBoundarySpace ? ' ' : '') + (this.theirCurrentUtterance || '');
            if (preview) {
                this.sendToRenderer('stt-update', {
                    speaker: 'Them',
                    text: preview,
                    isPartial: true,
                    isFinal: false,
                    timestamp: Date.now(),
                });
            }
        }

        if (this.theirCompletionTimer) clearTimeout(this.theirCompletionTimer);
        this.theirCompletionTimer = setTimeout(() => this.flushTheirCompletion(), COMPLETION_DEBOUNCE_MS);
    }

    _handleMyMessage(msg) {
        if (msg.type === 'PARTIAL' && msg.text && msg.text !== '<noise>') {
            console.log(`???  [ME]  PARTIAL: "${msg.text}"`);
            this.debounceMyCompletion(msg.text);
        }
        if (msg.type === 'TURN_COMPLETE' && this.myCompletionTimer) {
            clearTimeout(this.myCompletionTimer);
            this.flushMyCompletion();
        }
    }

    _handleTheirMessage(msg) {
        if (msg.type === 'PARTIAL' && msg.text && msg.text !== '<noise>') {
            console.log(`?? [THEM] PARTIAL: "${msg.text}"`);
            this.debounceTheirCompletion(msg.text);
        }
        if (msg.type === 'TURN_COMPLETE' && this.theirCompletionTimer) {
            clearTimeout(this.theirCompletionTimer);
            this.flushTheirCompletion();
        }
    }

    async initializeSttSessions(language = 'en') {
        const effectiveLanguage = process.env.OPENAI_TRANSCRIBE_LANG || language || 'en';

        // we no longer need an api-key – the server owns it
        this.modelInfo = { provider: 'gemini', model: 'gemini-live-2.5-flash-preview' };

        return new Promise((resolve, reject) => {
            const existingWs = this.mySttSession?.ws || this.theirSttSession?.ws;
            const isReady = existingWs && existingWs.readyState === 1 && this.isServerConnected;
            if (isReady) {
                // already open and ready
                resolve(true);
                return;
            }

            const WebSocket = require('ws');
            const ws = new WebSocket(process.env.STT_RELAY_URL || 'ws://localhost:8080');

            ws.once('open', () => {
                console.log(`?? Connected to STT relay: ${process.env.STT_RELAY_URL || 'ws://localhost:8080'}`);

                // Generate session ID and send single OPEN message with streams array
                this.sessionId = Date.now().toString();
                console.log(`?? Opening streams: ME + THEM (language: ${effectiveLanguage}, sessionId: ${this.sessionId})`);

                ws.send(
                    JSON.stringify({
                        type: 'OPEN',
                        streams: ['my', 'their'],
                        language: effectiveLanguage,
                        sessionId: this.sessionId,
                    })
                );

                // Don't resolve yet - wait for CONNECTED confirmation
                // Sessions will be stored after server confirms connection
            });

            ws.once('error', e => {
                console.error('[SttService] WebSocket error:', e.message);
                this.isServerConnected = false;
                reject(e);
            });
            ws.once('close', () => {
                console.log('[SttService] WebSocket closed');
                this.isServerConnected = false;
                this.closeSessions();
            });

            // forward relay messages ? existing renderer/UI callbacks
            ws.on('message', raw => {
                try {
                    const msg = JSON.parse(raw);
                    console.log(`[SttService] ?? raw server msg: ${JSON.stringify(msg)}`); // ? add this

                    if (msg.type === 'CONNECTED') {
                        console.log(`? [SERVER] Connected! Session: ${msg.sessionId}, Streams: ${msg.streams?.join(', ')}`);
                        this.isServerConnected = true;

                        // Now that server is connected, store the sessions and resolve the promise
                        this.mySttSession = { ws, stream: 'my' };
                        this.theirSttSession = { ws, stream: 'their' };
                        resolve(true);
                    } else if (msg.type === 'PARTIAL' || msg.type === 'TURN_COMPLETE') {
                        // pick correct handler (logging is now done inside the handlers)
                        const handler = msg.stream === 'my' ? this._handleMyMessage : this._handleTheirMessage;
                        handler.call(this, msg);
                    } else if (msg.type === 'ERROR') {
                        console.error(`? [SERVER ERROR] for stream ${msg.stream || 'unknown'}: ${msg.message || 'Unknown error'}`);
                        this.isServerConnected = false;
                    } else if (msg.type === 'DISCONNECTED') {
                        console.log(`?? [SERVER] Disconnected: ${msg.reason || 'Unknown reason'}`);
                        this.isServerConnected = false;
                        this.closeSessions();
                    } else {
                        console.log(`?? [SERVER] ${msg.type} for stream ${msg.stream || 'unknown'}`);
                    }
                } catch (e) {
                    console.error('[SttService] bad json from server', e);
                }
            });
        });
    }

    /**
     * Send a lightweight keep-alive to prevent idle disconnects.
     * Currently only implemented for OpenAI provider because Gemini's SDK
     * already performs its own heart-beats.
     */
    _sendKeepAlive() {
        if (!this.isSessionActive()) return;

        if (this.modelInfo?.provider === 'openai') {
            try {
                this.mySttSession?.keepAlive?.();
                this.theirSttSession?.keepAlive?.();
            } catch (err) {
                console.error('[SttService] keepAlive error:', err.message);
            }
        }
    }

    /**
     * Gracefully tears down then recreates the STT sessions. Should be invoked
     * on a timer to avoid provider-side hard timeouts.
     */
    async renewSessions(language = 'en') {
        if (!this.isSessionActive()) {
            console.warn('[SttService] renewSessions called but no active session.');
            return;
        }

        const oldMySession = this.mySttSession;
        const oldTheirSession = this.theirSttSession;

        console.log('[SttService] Spawning fresh STT sessions in the background…');

        // We reuse initializeSttSessions to create fresh sessions with the same
        // language and handlers. The method will update the session pointers
        // and timers, but crucially it does NOT touch the system audio capture
        // pipeline, so audio continues flowing uninterrupted.
        await this.initializeSttSessions(language);

        // Close the old sessions after a short overlap window.
        setTimeout(() => {
            try {
                oldMySession?.close?.();
                oldTheirSession?.close?.();
                console.log('[SttService] Old STT sessions closed after hand-off.');
            } catch (err) {
                console.error('[SttService] Error closing old STT sessions:', err.message);
            }
        }, SOCKET_OVERLAP_MS);
    }

    async sendMicAudioContent(data, mimeType = 'audio/pcm;rate=24000') {
        if (!this.mySttSession) throw new Error('User STT session not active');
        if (!this.isServerConnected) {
            console.warn('[SttService] Server not connected, skipping mic audio');
            return;
        }
        if (!this.mySttSession.ws || this.mySttSession.ws.readyState !== 1) {
            console.warn('[SttService] WebSocket not ready, skipping mic audio');
            return;
        }

        try {
            // Rate limit audio logs to reduce spam
            const now = Date.now();
            if (now - this.lastAudioLog.my > this.audioLogInterval) {
                console.log(`[SttService] ???  ME sending audio: ${data.length} bytes`);
                this.lastAudioLog.my = now;
            }

            this.mySttSession.ws.send(
                JSON.stringify({
                    type: 'AUDIO',
                    stream: 'my',
                    data,
                    mimeType,
                    sessionId: this.sessionId,
                })
            );
        } catch (error) {
            console.error('[SttService] Error sending mic audio:', error.message);
            this.isServerConnected = false;
        }
    }

    async sendSystemAudioContent(data, mimeType = 'audio/pcm;rate=24000') {
        if (!this.theirSttSession) throw new Error('Their STT session not active');
        if (!this.isServerConnected) {
            console.warn('[SttService] Server not connected, skipping system audio');
            return { success: false, error: 'Server not connected' };
        }
        if (!this.theirSttSession.ws || this.theirSttSession.ws.readyState !== 1) {
            console.warn('[SttService] WebSocket not ready, skipping system audio');
            return { success: false, error: 'WebSocket not ready' };
        }

        try {
            // Rate limit audio logs to reduce spam
            const now = Date.now();
            if (now - this.lastAudioLog.their > this.audioLogInterval) {
                console.log(`[SttService] ?? THEM sending audio: ${data.length} bytes`);
                this.lastAudioLog.their = now;
            }

            this.theirSttSession.ws.send(
                JSON.stringify({
                    type: 'AUDIO',
                    stream: 'their',
                    data,
                    mimeType,
                    sessionId: this.sessionId,
                })
            );
            return { success: true };
        } catch (error) {
            console.error('[SttService] Error sending system audio:', error.message);
            this.isServerConnected = false;
            return { success: false, error: error.message };
        }
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

        // Relay mode: model info is not needed here

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
                        await this.sendSystemAudioContent(base64Data, 'audio/pcm;rate=24000');
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
        [this.myCompletionTimer, this.theirCompletionTimer].forEach(t => t && clearTimeout(t));

        if (this.mySttSession?.ws && this.mySttSession.ws.readyState === 1) {
            console.log('?? Closing STT relay connection...');
            try {
                this.mySttSession.ws.send(
                    JSON.stringify({
                        type: 'CLOSE',
                        sessionId: this.sessionId,
                    })
                );
            } catch (error) {
                console.error('[SttService] Error sending CLOSE message:', error.message);
            }
            this.mySttSession.ws.close();
        }

        this.mySttSession = null;
        this.theirSttSession = null;
        this.isServerConnected = false;
        this.sessionId = null;
    }

}

module.exports = SttService;
