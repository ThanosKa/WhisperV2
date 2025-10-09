const { BrowserWindow } = require('electron');
const SttService = require('./stt/sttService');
const summaryService = require('./summary/summaryService');
const authService = require('../common/services/authService');
const sessionRepository = require('../common/repositories/session');
const sttRepository = require('./stt/repositories');
const internalBridge = require('../../bridge/internalBridge');

class ListenService {
    constructor() {
        this.sttService = new SttService();
        this.summaryService = summaryService;
        this.currentSessionId = null;
        this.isInitializingSession = false;

        this.setupServiceCallbacks();
        console.log('[ListenService] Service instance created.');
    }

    setupServiceCallbacks() {
        // STT service callbacks
        this.sttService.setCallbacks({
            onTranscriptionComplete: (speaker, text) => {
                this.handleTranscriptionComplete(speaker, text);
            },
            onStatusUpdate: status => {
                this.sendToRenderer('update-status', status);
            },
        });

        // Summary service callbacks
        this.summaryService.setCallbacks({
            onAnalysisComplete: data => {
                // console.log('📊 Analysis completed:', data);
            },
            onStatusUpdate: status => {
                this.sendToRenderer('update-status', status);
            },
        });
    }

    sendToRenderer(channel, data) {
        const { windowPool } = require('../../window/windowManager');
        const listenWindow = windowPool?.get('listen');

        if (listenWindow && !listenWindow.isDestroyed()) {
            listenWindow.webContents.send(channel, data);
        }
    }

    initialize() {
        this.setupIpcHandlers();
        console.log('[ListenService] Initialized and ready.');
    }

    async handleListenRequest(listenButtonText) {
        const { windowPool } = require('../../window/windowManager');
        const listenWindow = windowPool.get('listen');
        const header = windowPool.get('header');

        try {
            let nextStatus = null;
            switch (listenButtonText) {
                case 'Listen':
                    console.log('[ListenService] changeSession to "Listen"');
                    if (this.isSessionActive()) {
                        internalBridge.emit('window:requestVisibility', { name: 'listen', visible: true });
                        setTimeout(() => {
                            try {
                                const history = this.getConversationHistory();
                                this.sendToRenderer('listen:sync-conversation-history', history);
                            } catch (e) {
                                console.warn('[ListenService] failed to sync conversation history:', e.message);
                            }
                        }, 100);
                        if (listenWindow && !listenWindow.isDestroyed()) {
                            listenWindow.webContents.send('session-state-changed', { isActive: true, mode: 'start' });
                        }
                        nextStatus = 'inSession';
                    } else {
                        const initOk = await this.initializeSession();
                        if (initOk) {
                            internalBridge.emit('window:requestVisibility', { name: 'listen', visible: true });
                            if (listenWindow && !listenWindow.isDestroyed()) {
                                listenWindow.webContents.send('session-state-changed', { isActive: true, mode: 'start' });
                            }
                            nextStatus = 'inSession';
                        } else {
                            // Initialization failed: do not flip UI to inSession, keep as beforeSession
                            nextStatus = 'beforeSession';
                            // Notify header about failure immediately and exit success path
                            header.webContents.send('listen:changeSessionResult', { success: false, nextStatus });
                            return;
                        }
                    }
                    break;

                case 'Stop':
                    console.log('[ListenService] changeSession to "Stop"');
                    await this.pauseSession();
                    if (listenWindow && !listenWindow.isDestroyed()) {
                        listenWindow.webContents.send('session-state-changed', { isActive: false, mode: 'pause' });
                    }
                    nextStatus = 'paused';
                    break;

                case 'Resume':
                    console.log('[ListenService] changeSession to "Resume"');
                    await this.resumeSession();
                    if (listenWindow && !listenWindow.isDestroyed()) {
                        listenWindow.webContents.send('session-state-changed', { isActive: true, mode: 'resume' });
                    }
                    nextStatus = 'inSession';
                    break;

                case 'Done':
                    console.log('[ListenService] changeSession to "Done"');
                    await this.closeSession();
                    internalBridge.emit('window:requestVisibility', { name: 'listen', visible: false });
                    listenWindow.webContents.send('session-state-changed', { isActive: false, mode: 'end' });
                    this.summaryService.resetConversationHistory();
                    nextStatus = 'beforeSession';
                    break;

                default:
                    throw new Error(`[ListenService] unknown listenButtonText: ${listenButtonText}`);
            }

            header.webContents.send('listen:changeSessionResult', { success: true, nextStatus });
        } catch (error) {
            console.error('[ListenService] error in handleListenRequest:', error);
            header.webContents.send('listen:changeSessionResult', { success: false });
            throw error;
        }
    }

    async handleTranscriptionComplete(speaker, text) {
        const trimmedText = text.trim();
        if (trimmedText.length < 3) {
            console.log(`[ListenService] Skipping very short transcription (${trimmedText.length} chars): "${trimmedText}"`);
            return; // Pre-filter short noise before DB or analysis
        }

        console.log(`[ListenService] Forwarding meaningful utterance (${trimmedText.length} chars): ${speaker}: "${trimmedText}"`);

        // console.log(`[ListenService] Transcription complete: ${speaker} - ${text}`);

        // Save to database
        await this.saveConversationTurn(speaker, trimmedText);

        // Add to summary service for analysis
        this.summaryService.addConversationTurn(speaker, trimmedText);
    }

    async saveConversationTurn(speaker, transcription) {
        if (!this.currentSessionId) {
            console.error('[DB] Cannot save turn, no active session ID.');
            return;
        }
        if (transcription.trim() === '') return;

        try {
            await sessionRepository.touch(this.currentSessionId);
            await sttRepository.addTranscript({
                sessionId: this.currentSessionId,
                speaker: speaker,
                text: transcription.trim(),
            });
            console.log(`[DB] Saved transcript for session ${this.currentSessionId}: (${speaker})`);
        } catch (error) {
            console.error('Failed to save transcript to DB:', error);
        }
    }

    async initializeNewSession() {
        try {
            // The UID is no longer passed to the repository method directly.
            // The adapter layer handles UID injection. We just ensure a user is available.
            const user = authService.getCurrentUser();
            if (!user) {
                // This case should ideally not happen as authService initializes a default user.
                throw new Error('Cannot initialize session: auth service not ready.');
            }

            this.currentSessionId = await sessionRepository.getOrCreateActive('listen');
            console.log(`[DB] New listen session ensured: ${this.currentSessionId}`);

            // Set session ID for summary service
            this.summaryService.setSessionId(this.currentSessionId);

            // Reset conversation history
            this.summaryService.resetConversationHistory();

            // Apply persisted analysis preset selection (Phase 1)
            try {
                const settingsService = require('../settings/settingsService');
                const currentSettings = await settingsService.getSettings();
                await this.summaryService.setAnalysisPreset(currentSettings?.analysisPresetId || 'meetings');
            } catch (e) {
                console.warn('[ListenService] Failed to apply saved analysis preset:', e.message);
            }

            console.log('New conversation session started:', this.currentSessionId);
            return true;
        } catch (error) {
            console.error('Failed to initialize new session in DB:', error);
            this.currentSessionId = null;
            return false;
        }
    }

    async initializeSession(language = 'en') {
        if (this.isInitializingSession) {
            console.log('Session initialization already in progress.');
            return false;
        }

        this.isInitializingSession = true;
        this.sendToRenderer('session-initializing', true);
        this.sendToRenderer('update-status', 'Initializing sessions...');

        try {
            // Initialize database session
            const sessionInitialized = await this.initializeNewSession();
            if (!sessionInitialized) {
                throw new Error('Failed to initialize database session');
            }

            /* ---------- STT Initialization Retry Logic ---------- */
            const MAX_RETRY = 10;
            const RETRY_DELAY_MS = 300; // 0.3 seconds

            let sttReady = false;
            for (let attempt = 1; attempt <= MAX_RETRY; attempt++) {
                try {
                    await this.sttService.initializeSttSessions(language);
                    sttReady = true;
                    break; // Exit on success
                } catch (err) {
                    console.warn(`[ListenService] STT init attempt ${attempt} failed: ${err.message}`);
                    if (attempt < MAX_RETRY) {
                        await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
                    }
                }
            }
            if (!sttReady) throw new Error('STT init failed after retries');
            /* ------------------------------------------- */

            console.log('✅ Listen service initialized successfully.');

            this.sendToRenderer('update-status', 'Connected. Ready to listen.');
            this.sendToRenderer('change-listen-capture-state', { status: 'start' });

            return true;
        } catch (error) {
            console.error('❌ Failed to initialize listen service:', error);
            this.sendToRenderer('update-status', 'Initialization failed.');
            return false;
        } finally {
            this.isInitializingSession = false;
            this.sendToRenderer('session-initializing', false);
        }
    }

    async sendMicAudioContent(data, mimeType) {
        return await this.sttService.sendMicAudioContent(data, mimeType);
    }

    async startMacOSAudioCapture() {
        if (process.platform !== 'darwin') {
            throw new Error('macOS audio capture only available on macOS');
        }
        return await this.sttService.startMacOSAudioCapture();
    }

    async stopMacOSAudioCapture() {
        this.sttService.stopMacOSAudioCapture();
    }

    isSessionActive() {
        return this.sttService.isSessionActive();
    }

    async closeSession() {
        try {
            this.sendToRenderer('change-listen-capture-state', { status: 'stop' });
            // Close STT sessions
            await this.sttService.closeSessions();

            await this.stopMacOSAudioCapture();

            // End database session
            if (this.currentSessionId) {
                const endedSessionId = this.currentSessionId;
                await sessionRepository.end(endedSessionId);
                console.log(`[DB] Session ${endedSessionId} ended.`);

                // Fire-and-forget: generate and save a concise meeting title
                (async () => {
                    try {
                        await this._generateAndSaveMeetingTitle(endedSessionId);
                    } catch (e) {
                        console.warn('[ListenService] Failed to generate meeting title:', e.message);
                    }
                })();

                // Fire-and-forget: generate comprehensive summary with full transcript
                (async () => {
                    try {
                        await this._generateAndSaveComprehensiveSummary(endedSessionId);
                    } catch (e) {
                        console.warn('[ListenService] Failed to generate comprehensive summary:', e.message);
                    }
                })();
            }

            // Reset state
            this.currentSessionId = null;

            console.log('Listen service session closed.');
            return { success: true };
        } catch (error) {
            console.error('Error closing listen service session:', error);
            return { success: false, error: error.message };
        }
    }

    async pauseSession() {
        try {
            this.sendToRenderer('change-listen-capture-state', { status: 'stop' });
            // Do not close STT sessions on pause; keep websockets alive for fast resume
            await this.stopMacOSAudioCapture();

            // Do NOT end database session; keep currentSessionId so Ask can attach.
            console.log(`[DB] Session ${this.currentSessionId} paused (not ended).`);
            return { success: true };
        } catch (error) {
            console.error('Error pausing listen service session:', error);
            return { success: false, error: error.message };
        }
    }

    async resumeSession() {
        try {
            // Resume local capture; STT sockets remain active from pause
            this.sendToRenderer('change-listen-capture-state', { status: 'start' });
            this.sendToRenderer('update-status', 'Resumed listening.');
            return { success: true };
        } catch (error) {
            console.error('Error resuming listen service session:', error);
            return { success: false, error: error.message };
        }
    }

    getCurrentSessionData() {
        return {
            sessionId: this.currentSessionId,
            conversationHistory: this.summaryService.getConversationHistory(),
            totalTexts: this.summaryService.getConversationHistory().length,
            analysisData: this.summaryService.getCurrentAnalysisData(),
        };
    }

    getConversationHistory() {
        return this.summaryService.getConversationHistory();
    }

    async _generateAndSaveMeetingTitle(sessionId) {
        // Prefer summary TL;DR, then fall back to transcript snippet;
        // if LLM available, ask for a short title in the transcript language.
        try {
            const summaryRepository = require('./summary/repositories');
            const sttRepository = require('./stt/repositories');
            const llmClient = require('../common/ai/llmClient');

            // 1) Gather context
            let tldr = null;
            try {
                const s = await summaryRepository.getSummaryBySessionId(sessionId);
                tldr = s?.tldr || null;
            } catch (_) {}

            let transcriptSample = '';
            try {
                const all = await sttRepository.getAllTranscriptsBySessionId(sessionId);
                const lastFew = (all || []).slice(-8).map(t => `${t.speaker || ''}: ${t.text || ''}`.trim());
                transcriptSample = lastFew.join('\n');
            } catch (_) {}

            const baseCandidate = (tldr || '').trim() || (transcriptSample || '').trim();
            if (!baseCandidate) return; // nothing to title

            // 2) Try LLM for best-quality title (server-backed)
            let title = '';
            try {
                const messages = [
                    { role: 'system', content: 'You create concise, descriptive meeting titles. Respond with title only.' },
                    {
                        role: 'user',
                        content: `Create a short (max 8 words) meeting title in the same language as this content.\n\nContent:\n${baseCandidate}`,
                    },
                ];
                const completion = await llmClient.chat(messages);
                title = (completion?.content || '').split('\n')[0].replace(/^"|"$/g, '').trim();
            } catch (e) {
                console.warn('[ListenService] LLM title generation failed, using heuristic:', e.message);
            }

            // 3) Heuristic fallback if needed
            if (!title) {
                const from = baseCandidate.split(/\n+/)[0];
                title = (from || '')
                    .replace(/[\p{Emoji}\p{Extended_Pictographic}]/gu, '')
                    .split(/\s+/)
                    .slice(0, 10)
                    .join(' ')
                    .trim();
                if (title) title = title.charAt(0).toUpperCase() + title.slice(1);
            }

            if (title) {
                await sessionRepository.updateTitle(sessionId, title);
                console.log(`[ListenService] 🏷️ Saved meeting title for ${sessionId}: ${title}`);
            }
        } catch (err) {
            console.warn('[ListenService] Error in _generateAndSaveMeetingTitle:', err.message);
        }
    }

    async _generateAndSaveComprehensiveSummary(sessionId) {
        try {
            const sttRepository = require('./stt/repositories');
            const summaryRepository = require('./summary/repositories');
            const llmClient = require('../common/ai/llmClient');

            // Get the full transcript
            console.log(`[ListenService] Looking for transcripts for session: ${sessionId}`);
            const allTranscripts = await sttRepository.getAllTranscriptsBySessionId(sessionId);
            console.log(`[ListenService] Found ${allTranscripts ? allTranscripts.length : 0} transcripts for session ${sessionId}`);

            if (!allTranscripts || allTranscripts.length === 0) {
                console.log('[ListenService] No transcripts found for comprehensive summary');
                return;
            }

            // Format the full conversation
            const fullTranscript = allTranscripts.map(t => `${t.speaker || 'Unknown'}: ${t.text || ''}`.trim()).join('\n');

            if (!fullTranscript.trim()) {
                console.log('[ListenService] Empty transcript for comprehensive summary');
                return;
            }

            // Get current settings for analysis profile
            const settingsService = require('../settings/settingsService');
            const currentSettings = await settingsService.getSettings();
            const analysisPresetId = currentSettings?.analysisPresetId || 'meetings';

            // Get the comprehensive summary prompt template
            const { getSystemPrompt } = require('../common/prompts/promptBuilder');
            const promptData = getSystemPrompt('comprehensive_summary', { transcript: fullTranscript });

            const messages = [
                {
                    role: 'system',
                    content: promptData.system,
                },
                {
                    role: 'user',
                    content: promptData.user,
                },
            ];

            console.log(`[ListenService] Generating comprehensive summary for session ${sessionId}...`);

            const completion = await llmClient.chat(messages);
            const responseText = completion.content.trim();

            // Parse the JSON response
            let summaryData;
            try {
                // Extract JSON from markdown code blocks if present
                const jsonMatch = responseText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/i);
                const jsonString = jsonMatch ? jsonMatch[1] : responseText;
                summaryData = JSON.parse(jsonString);
            } catch (parseError) {
                console.warn('[ListenService] Failed to parse comprehensive summary JSON:', parseError.message);
                // Fallback: create basic summary
                summaryData = {
                    title: `Meeting Summary - ${new Date().toLocaleDateString()}`,
                    summary: `Meeting transcript analysis completed. ${allTranscripts.length} conversation turns recorded.`,
                    key_topics: ['Meeting recorded'],
                    action_items: [],
                };
            }

            // Save comprehensive summary to database
            await summaryRepository.saveSummary({
                sessionId: sessionId,
                tldr: summaryData.summary,
                text: responseText, // Store the full LLM response
                bullet_json: JSON.stringify(summaryData.key_topics || []),
                action_json: JSON.stringify(summaryData.action_items || []),
                model: 'comprehensive_summary',
            });

            // Update the session title if a better one was generated
            if (summaryData.title && summaryData.title !== 'Meeting Summary') {
                try {
                    await sessionRepository.updateTitle(sessionId, summaryData.title);
                    console.log(`[ListenService] 📝 Updated session title to: ${summaryData.title}`);
                } catch (titleError) {
                    console.warn('[ListenService] Could not update title:', titleError.message);
                }
            }

            // Write to summary.txt file
            const fs = require('fs');
            const path = require('path');
            const rootPath = path.resolve(__dirname, '../../');
            const summaryPath = path.join(rootPath, 'summary.txt');

            // Format the LLM input for logging
            const llmInput = messages.map(msg => `${msg.role.toUpperCase()}: ${msg.content}`).join('\n\n');

            const summaryContent = `SESSION: ${sessionId}
TIMESTAMP: ${new Date().toISOString()}
TITLE: ${summaryData.title}



---
WHAT LLM GOT:
${llmInput}

LLM OUTPUT:
${responseText}

`;

            fs.appendFileSync(summaryPath, summaryContent);
            console.log(`[ListenService] ✅ Comprehensive summary saved for session ${sessionId}`);
        } catch (err) {
            console.warn('[ListenService] Error in _generateAndSaveComprehensiveSummary:', err.message);
        }
    }

    _createHandler(asyncFn, successMessage, errorMessage) {
        return async (...args) => {
            try {
                const result = await asyncFn.apply(this, args);
                if (successMessage) console.log(successMessage);
                // `startMacOSAudioCapture` does not return { success, error } object on success,
                // Return success object here so handler sends consistent response.
                // Other functions already return success objects.
                return result && typeof result.success !== 'undefined' ? result : { success: true };
            } catch (e) {
                console.error(errorMessage, e);
                return { success: false, error: e.message };
            }
        };
    }

    // Use `_createHandler` to dynamically generate handlers.
    handleSendMicAudioContent = this._createHandler(this.sendMicAudioContent, null, 'Error sending user audio:');

    handleStartMacosAudio = this._createHandler(
        async () => {
            if (process.platform !== 'darwin') {
                return { success: false, error: 'macOS audio capture only available on macOS' };
            }
            if (this.sttService.isMacOSAudioRunning?.()) {
                return { success: false, error: 'already_running' };
            }
            await this.startMacOSAudioCapture();
            return { success: true, error: null };
        },
        'macOS audio capture started.',
        'Error starting macOS audio capture:'
    );

    handleStopMacosAudio = this._createHandler(this.stopMacOSAudioCapture, 'macOS audio capture stopped.', 'Error stopping macOS audio capture:');

    handleUpdateGoogleSearchSetting = this._createHandler(
        async enabled => {
            console.log('Google Search setting updated to:', enabled);
        },
        null,
        'Error updating Google Search setting:'
    );
}

const listenService = new ListenService();
module.exports = listenService;
