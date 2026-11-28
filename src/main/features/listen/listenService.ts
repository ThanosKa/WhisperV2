import { z } from 'zod';
import SttService, { type AudioContent, type Speaker } from './stt/sttService';
import summaryService from './summary/summaryService';
import authService from '../common/services/authService';
import sessionRepository from '../common/repositories/session';
import type { SessionRow } from '../common/repositories/session';
import sttRepository from './stt/repositories';
import type { TranscriptRow } from './stt/repositories';
import internalBridge from '../../bridge/internalBridge';
import summaryRepository from './summary/repositories';
import type { Insight } from './summary/repositories';
import * as llmClient from '../common/ai/llmClient';
import * as settingsService from '../settings/settingsService';
import { windowPool } from '../../window/windowManager';
import { logger } from '../common/utils/logger';
import { sendEvent } from '../../ipc/sendEvent';
import type { EventArgs, EventChannel, Outcome } from '../../../shared/ipc';
import { errorMessage } from '../common/utils/errors';

const log = logger.child({ module: 'ListenService' });

const STT_MAX_RETRY = 10;
const STT_RETRY_DELAY_MS = 300; // 0.3 seconds

// The meeting summary WhisperAPP's `comprehensive_summary` profile answers with, as JSON.
const ComprehensiveSummarySchema = z.object({
    title: z.string().nullish(),
    summary: z.string().nullish(),
    key_topics: z.unknown().optional(),
    action_items: z.unknown().optional(),
});

type ComprehensiveSummary = z.infer<typeof ComprehensiveSummarySchema>;

// A listen session left open by a crash, found at startup.
export type StrandedSession = { session: SessionRow; transcripts: TranscriptRow[]; insights: Insight[] };

export type StrandedSessionInfo = { id: string; title: string; started_at: number | null };

// Some handlers answer success with `error: null`, which the wire keeps.
export type HandlerResult = Outcome<{ error?: null }>;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

class ListenService {
    sttService = new SttService();
    summaryService = summaryService;
    currentSessionId: string | null = null;
    isInitializingSession = false;
    strandedSession: StrandedSession | null = null;
    isRecoveryDismissed = false;

    constructor() {
        this.setupServiceCallbacks();
        log.info('Service instance created');
    }

    setupServiceCallbacks(): void {
        // STT service callbacks
        this.sttService.setCallbacks({
            onTranscriptionComplete: ({ speaker, text }) => {
                void this.handleTranscriptionComplete({ speaker, text });
            },
            onQuotaExceeded: resetAt => {
                void this.handleSttQuotaExceeded(resetAt);
            },
        });

        // Summary service callbacks
        this.summaryService.setCallbacks({
            onAnalysisComplete: () => {},
        });
    }

    sendToRenderer<C extends EventChannel>({ channel, args }: { channel: C; args: EventArgs[C] }): void {
        const listenWindow = windowPool?.get('listen');

        if (listenWindow && !listenWindow.isDestroyed()) {
            sendEvent({ webContents: listenWindow.webContents, channel, args });
        }
    }

    async findStrandedSession(): Promise<StrandedSession | null> {
        try {
            const uid = authService.getCurrentUserId();
            if (!uid) {
                log.info('Recovery: no user, skipping check');
                return null;
            }

            const session = sessionRepository.findLatestUnfinishedListen();
            if (!session) {
                log.info({ uid }, 'Recovery: no unfinished sessions');
                return null;
            }

            const transcripts = await sttRepository.getAllTranscriptsBySessionId(session.id);
            if (!transcripts || transcripts.length === 0) {
                log.info({ uid, sessionId: session.id }, 'Recovery: session found but no transcripts');
                return null;
            }

            const allInsights = summaryRepository.getAllInsightsBySessionId(session.id);

            log.info(
                { uid, sessionId: session.id, transcripts: transcripts.length, insightRounds: allInsights?.length || 0 },
                'Recovery: found stranded session'
            );
            return { session, transcripts, insights: allInsights };
        } catch (err) {
            log.error({ err }, 'Recovery: failed to look for a stranded session');
            return null;
        }
    }

    async bootstrapRecovery(): Promise<void> {
        log.info('Recovery: bootstrap starting');
        this.strandedSession = await this.findStrandedSession();
        if (this.strandedSession && !this.isRecoveryDismissed) {
            log.info({ sessionId: this.strandedSession.session.id }, 'Recovery: notifying header');
            this.notifyHeaderOfStrandedSession(this.strandedSession.session);
        }
    }

    notifyHeaderOfStrandedSession(session: SessionRow): void {
        const header = windowPool?.get('header');
        if (header && !header.isDestroyed()) {
            sendEvent({
                webContents: header.webContents,
                channel: 'listen:stranded-session-detected',
                args: [
                    {
                        id: session.id,
                        title: session.title || 'Untitled Session',
                        started_at: session.started_at,
                    },
                ],
            });
        }
    }

    getStrandedSessionInfo(): StrandedSessionInfo | null {
        if (!this.strandedSession?.session) {
            return null;
        }
        const { id, title, started_at } = this.strandedSession.session;
        return {
            id,
            title: title || 'Untitled Session',
            started_at,
        };
    }

    initialize(): void {
        // IPC handlers are set up in featureBridge.js
        log.info('Initialized and ready');
    }

    async handleListenRequest(listenButtonText: string): Promise<void> {
        const listenWindow = windowPool.get('listen');
        const header = windowPool.get('header');
        // The untyped code called `header.webContents` without a check, so a missing header threw;
        // this keeps that.
        const sendResultToHeader = (result: EventArgs['listen:changeSessionResult'][0]) => {
            if (!header) throw new Error('Header window is not open');
            sendEvent({ webContents: header.webContents, channel: 'listen:changeSessionResult', args: [result] });
        };

        try {
            let nextStatus = null;
            switch (listenButtonText) {
                case 'Listen':
                    log.info({ sessionId: this.currentSessionId }, 'changeSession to "Listen"');

                    // Guard: Block if stranded session exists and not dismissed
                    if (this.strandedSession && !this.isRecoveryDismissed) {
                        log.info({ strandedSessionId: this.strandedSession.session.id }, 'Blocking Listen: stranded session must be resolved');
                        this.notifyHeaderOfStrandedSession(this.strandedSession.session);
                        nextStatus = 'beforeSession';
                        sendResultToHeader({ success: false, nextStatus });
                        return;
                    }

                    if (this.isSessionActive()) {
                        internalBridge.emit('window:requestVisibility', { name: 'listen', visible: true });
                        setTimeout(() => {
                            try {
                                const history = this.getConversationHistory();
                                this.sendToRenderer({ channel: 'listen:sync-conversation-history', args: [history] });
                            } catch (e) {
                                log.warn({ err: e, sessionId: this.currentSessionId }, 'Failed to sync conversation history');
                            }
                        }, 100);
                        if (listenWindow && !listenWindow.isDestroyed()) {
                            sendEvent({
                                webContents: listenWindow.webContents,
                                channel: 'session-state-changed',
                                args: [{ isActive: true, mode: 'start' }],
                            });
                        }
                        nextStatus = 'inSession';
                    } else {
                        const initOk = await this.initializeSession();
                        if (initOk) {
                            internalBridge.emit('window:requestVisibility', { name: 'listen', visible: true });
                            if (listenWindow && !listenWindow.isDestroyed()) {
                                sendEvent({
                                    webContents: listenWindow.webContents,
                                    channel: 'session-state-changed',
                                    args: [{ isActive: true, mode: 'start' }],
                                });
                            }
                            nextStatus = 'inSession';
                        } else {
                            // Initialization failed: do not flip UI to inSession, keep as beforeSession
                            nextStatus = 'beforeSession';
                            // Notify header about failure immediately and exit success path
                            sendResultToHeader({ success: false, nextStatus });
                            return;
                        }
                    }
                    break;

                case 'Stop':
                    log.info({ sessionId: this.currentSessionId }, 'changeSession to "Stop"');
                    await this.pauseSession();
                    if (listenWindow && !listenWindow.isDestroyed()) {
                        sendEvent({
                            webContents: listenWindow.webContents,
                            channel: 'session-state-changed',
                            args: [{ isActive: false, mode: 'pause' }],
                        });
                    }
                    nextStatus = 'paused';
                    break;

                case 'Resume':
                    log.info({ sessionId: this.currentSessionId }, 'changeSession to "Resume"');
                    await this.resumeSession();
                    if (listenWindow && !listenWindow.isDestroyed()) {
                        sendEvent({
                            webContents: listenWindow.webContents,
                            channel: 'session-state-changed',
                            args: [{ isActive: true, mode: 'resume' }],
                        });
                    }
                    nextStatus = 'inSession';
                    break;

                case 'Done':
                    log.info({ sessionId: this.currentSessionId }, 'changeSession to "Done"');
                    await this.closeSession();
                    internalBridge.emit('window:requestVisibility', { name: 'listen', visible: false });
                    if (!listenWindow) throw new Error('Listen window is not open');
                    sendEvent({ webContents: listenWindow.webContents, channel: 'session-state-changed', args: [{ isActive: false, mode: 'end' }] });
                    this.summaryService.resetConversationHistory();
                    nextStatus = 'beforeSession';
                    break;

                default:
                    throw new Error(`[ListenService] unknown listenButtonText: ${listenButtonText}`);
            }

            sendResultToHeader({ success: true, nextStatus });
        } catch (error) {
            log.error({ err: error, sessionId: this.currentSessionId, listenButtonText }, 'Listen request failed');
            sendResultToHeader({ success: false });
            throw error;
        }
    }

    async handleTranscriptionComplete({ speaker, text }: { speaker: Speaker; text: string }): Promise<void> {
        const trimmedText = text.trim();
        const sessionId = this.currentSessionId;
        if (trimmedText.length < 3) {
            log.info({ sessionId, speaker, chars: trimmedText.length }, 'Skipping very short transcription');
            return; // Pre-filter short noise before DB or analysis
        }

        log.info({ sessionId, speaker, chars: trimmedText.length }, 'Forwarding meaningful utterance');

        // Save to database
        await this.saveConversationTurn({ speaker, transcription: trimmedText });

        // Add to summary service for analysis
        this.summaryService.addConversationTurn({ speaker, text: trimmedText });
    }

    async handleSttQuotaExceeded(resetAt: string): Promise<void> {
        log.info({ sessionId: this.currentSessionId, resetAt }, 'STT quota exceeded');

        // Stop audio capture
        this.sendToRenderer({ channel: 'change-listen-capture-state', args: [{ status: 'stop' }] });

        // Close STT sessions (but don't call closeSessions which would end the DB session)
        try {
            await this.sttService.closeSessions();
            await this.stopMacOSAudioCapture();
        } catch (err) {
            log.error({ err, sessionId: this.currentSessionId }, 'Failed to stop audio on quota exceeded');
        }

        // Notify header window
        const header = windowPool.get('header');
        if (header && !header.isDestroyed()) {
            sendEvent({ webContents: header.webContents, channel: 'stt:quotaExceeded', args: [{ resetAt }] });
            sendEvent({
                webContents: header.webContents,
                channel: 'listen:changeSessionResult',
                args: [
                    {
                        success: false,
                        nextStatus: 'beforeSession',
                        error: 'STT_AUDIO_QUOTA_EXCEEDED',
                    },
                ],
            });
        }

        // Notify listen window (for SttView to show quota exceeded message)
        const listenWindow = windowPool.get('listen');
        if (listenWindow && !listenWindow.isDestroyed()) {
            sendEvent({ webContents: listenWindow.webContents, channel: 'stt:quotaExceeded', args: [{ resetAt }] });
            sendEvent({
                webContents: listenWindow.webContents,
                channel: 'session-state-changed',
                args: [
                    {
                        isActive: false,
                        mode: 'quotaExceeded',
                    },
                ],
            });
        }
    }

    async saveConversationTurn({ speaker, transcription }: { speaker: Speaker; transcription: string }): Promise<void> {
        if (!this.currentSessionId) {
            log.error({ speaker }, 'Cannot save turn: no active session id');
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
            log.info({ sessionId: this.currentSessionId, speaker }, 'Saved transcript');
        } catch (error) {
            log.error({ err: error, sessionId: this.currentSessionId }, 'Failed to save transcript');
        }
    }

    async initializeNewSession(): Promise<boolean> {
        try {
            // The UID is no longer passed to the repository method directly.
            // The adapter layer handles UID injection. We just ensure a user is available.
            const user = authService.getCurrentUser();
            if (!user) {
                // This case should ideally not happen as authService initializes a default user.
                throw new Error('Cannot initialize session: auth service not ready.');
            }

            this.currentSessionId = await sessionRepository.getOrCreateActive('listen');
            log.info({ sessionId: this.currentSessionId }, 'Listen session ensured');

            // Set session ID for summary service
            this.summaryService.setSessionId(this.currentSessionId);

            // Reset conversation history
            this.summaryService.resetConversationHistory();

            // Apply persisted analysis preset selection (Phase 1)
            try {
                const currentSettings = await settingsService.getSettings();
                await this.summaryService.setAnalysisPreset(currentSettings?.analysisPresetId || 'meetings');
            } catch (e) {
                log.warn({ err: e, sessionId: this.currentSessionId }, 'Failed to apply saved analysis preset');
            }

            log.info({ sessionId: this.currentSessionId }, 'New conversation session started');
            return true;
        } catch (error) {
            log.error({ err: error }, 'Failed to initialize new session in DB');
            this.currentSessionId = null;
            return false;
        }
    }

    // Connects the relay, trying again a few times; throws when every attempt failed.
    async connectSttWithRetry({ language, failure }: { language: string; failure: string }): Promise<void> {
        for (let attempt = 1; attempt <= STT_MAX_RETRY; attempt++) {
            try {
                await this.sttService.initializeSttSessions(language);
                return;
            } catch (err) {
                log.warn({ err, attempt, sessionId: this.currentSessionId }, 'STT connection attempt failed');
                if (attempt < STT_MAX_RETRY) {
                    await sleep(STT_RETRY_DELAY_MS);
                }
            }
        }
        throw new Error(failure);
    }

    async initializeSession(language = 'en'): Promise<boolean> {
        if (this.isInitializingSession) {
            log.info('Session initialization already in progress');
            return false;
        }

        this.isInitializingSession = true;

        try {
            // Initialize database session
            const sessionInitialized = await this.initializeNewSession();
            if (!sessionInitialized) {
                throw new Error('Failed to initialize database session');
            }

            await this.connectSttWithRetry({ language, failure: 'STT init failed after retries' });

            log.info({ sessionId: this.currentSessionId }, 'Listen service initialized');

            this.sendToRenderer({ channel: 'change-listen-capture-state', args: [{ status: 'start' }] });

            return true;
        } catch (error) {
            log.error({ err: error, sessionId: this.currentSessionId }, 'Failed to initialize listen service');
            return false;
        } finally {
            this.isInitializingSession = false;
        }
    }

    async sendMicAudioContent({ data, mimeType }: AudioContent): Promise<void> {
        return await this.sttService.sendMicAudioContent({ data, mimeType });
    }

    async startMacOSAudioCapture(): Promise<boolean> {
        if (process.platform !== 'darwin') {
            throw new Error('macOS audio capture only available on macOS');
        }
        return await this.sttService.startMacOSAudioCapture();
    }

    async stopMacOSAudioCapture(): Promise<void> {
        this.sttService.stopMacOSAudioCapture();
    }

    isSessionActive(): boolean {
        return this.sttService.isSessionActive();
    }

    async stopAudioCapture(): Promise<void> {
        // Stop audio without ending session (for app shutdown/crash recovery)
        try {
            this.sendToRenderer({ channel: 'change-listen-capture-state', args: [{ status: 'stop' }] });
            await this.sttService.closeSessions();
            await this.stopMacOSAudioCapture();
        } catch (err) {
            log.error({ err, sessionId: this.currentSessionId }, 'Failed to stop audio capture');
        }
    }

    async closeSession(): Promise<{ success: true } | { success: false; error: string }> {
        try {
            this.sendToRenderer({ channel: 'change-listen-capture-state', args: [{ status: 'stop' }] });
            // Close STT sessions
            await this.sttService.closeSessions();

            await this.stopMacOSAudioCapture();

            // End database session
            if (this.currentSessionId) {
                const endedSessionId = this.currentSessionId;
                await sessionRepository.end(endedSessionId);
                log.info({ sessionId: endedSessionId }, 'Session ended');

                // Fire-and-forget: generate comprehensive summary with full transcript
                // This provides: title, summary, key_topics, action_items - everything we need
                void (async () => {
                    try {
                        await this._generateAndSaveComprehensiveSummary(endedSessionId);
                    } catch (e) {
                        log.warn({ err: e, sessionId: endedSessionId }, 'Failed to generate comprehensive summary');
                    }
                })();
            }

            // Reset state
            this.currentSessionId = null;

            log.info('Listen service session closed');
            return { success: true };
        } catch (error) {
            log.error({ err: error, sessionId: this.currentSessionId }, 'Failed to close listen session');
            return { success: false, error: errorMessage(error) };
        }
    }

    async pauseSession(): Promise<{ success: true } | { success: false; error: string }> {
        try {
            this.sendToRenderer({ channel: 'change-listen-capture-state', args: [{ status: 'stop' }] });
            // Do not close STT sessions on pause; keep websockets alive for fast resume
            await this.stopMacOSAudioCapture();

            // Do NOT end database session; keep currentSessionId so Ask can attach.
            log.info({ sessionId: this.currentSessionId }, 'Session paused (not ended)');
            return { success: true };
        } catch (error) {
            log.error({ err: error, sessionId: this.currentSessionId }, 'Failed to pause listen session');
            return { success: false, error: errorMessage(error) };
        }
    }

    async resumeSession(): Promise<{ success: true } | { success: false; error: string }> {
        try {
            // Resume local capture; STT sockets remain active from pause
            this.sendToRenderer({ channel: 'change-listen-capture-state', args: [{ status: 'start' }] });
            return { success: true };
        } catch (error) {
            log.error({ err: error, sessionId: this.currentSessionId }, 'Failed to resume listen session');
            return { success: false, error: errorMessage(error) };
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

    getConversationHistory(): string[] {
        return this.summaryService.getConversationHistory();
    }

    async _generateAndSaveComprehensiveSummary(sessionId: string): Promise<void> {
        try {
            // Get the full transcript
            log.info({ sessionId }, 'Looking for transcripts for comprehensive summary');
            const allTranscripts = await sttRepository.getAllTranscriptsBySessionId(sessionId);
            log.info({ sessionId, transcripts: allTranscripts ? allTranscripts.length : 0 }, 'Found transcripts for comprehensive summary');

            if (!allTranscripts || allTranscripts.length === 0) {
                log.info({ sessionId }, 'No transcripts found for comprehensive summary');
                return;
            }

            // Format the full conversation
            const fullTranscript = allTranscripts.map(t => `${t.speaker || 'Unknown'}: ${t.text || ''}`.trim()).join('\n');

            if (!fullTranscript.trim()) {
                log.info({ sessionId }, 'Empty transcript for comprehensive summary');
                return;
            }

            // Build new payload format for comprehensive summary
            const payload = {
                profile: 'comprehensive_summary',
                userContent: '', // Empty userContent for server-side prompt construction
                context: { transcript: fullTranscript },
            };

            log.info({ sessionId }, 'Generating comprehensive summary');

            const completion = await llmClient.chat(payload);
            const responseText = completion.content.trim();

            // Parse the JSON response
            let summaryData: ComprehensiveSummary;
            try {
                // Extract JSON from markdown code blocks if present
                const jsonString = responseText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/i)?.[1] ?? responseText;
                summaryData = ComprehensiveSummarySchema.parse(JSON.parse(jsonString));
            } catch (parseError) {
                log.warn({ err: parseError, sessionId }, 'Failed to parse comprehensive summary JSON');
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
            log.info({ sessionId, profile: 'comprehensive_summary' }, 'Comprehensive summary saved');

            // Update the session title if a better one was generated
            if (summaryData.title && summaryData.title !== 'Meeting Summary') {
                try {
                    await sessionRepository.updateTitle({ id: sessionId, title: summaryData.title });
                    log.info({ sessionId, title: summaryData.title, profile: 'comprehensive_summary' }, 'Session title updated');
                } catch (titleError) {
                    log.warn({ err: titleError, sessionId }, 'Could not update session title');
                }
            }
        } catch (err) {
            log.warn({ err, sessionId }, 'Failed to generate and save comprehensive summary');
        }
    }

    async handleRecoveryAction({ action, sessionId }: { action: string; sessionId: string }): Promise<HandlerResult> {
        if (!this.strandedSession || this.strandedSession.session.id !== sessionId) {
            log.warn({ expectedSessionId: this.strandedSession?.session.id, sessionId, action }, 'Recovery action session mismatch');
            return { success: false, error: 'Session mismatch' };
        }

        try {
            if (action === 'resume') {
                return await this.resumeStrandedSession();
            } else if (action === 'finalize') {
                return await this.finalizeStrandedSession();
            } else if (action === 'dismiss') {
                this.isRecoveryDismissed = true;
                this.strandedSession = null;
                return { success: true };
            }
            return { success: false, error: 'Unknown action' };
        } catch (err) {
            log.error({ err, sessionId, action }, 'Recovery action failed');
            return { success: false, error: errorMessage(err) };
        }
    }

    async resumeStrandedSession(): Promise<{ success: true }> {
        if (!this.strandedSession) {
            throw new Error('No stranded session to resume');
        }
        const { session, transcripts, insights } = this.strandedSession;

        // Set as current session (DON'T create new one)
        this.currentSessionId = session.id;
        this.summaryService.setSessionId(session.id);

        // Hydrate transcripts WITHOUT triggering analysis
        this.summaryService.hydrateConversation(transcripts);

        // Hydrate insights if they exist
        const latestInsight = insights.at(-1);
        if (Array.isArray(insights) && latestInsight) {
            log.info(
                {
                    sessionId: session.id,
                    summaryPoints: latestInsight.payload?.summary?.length || 0,
                    actions: latestInsight.payload?.actions?.length || 0,
                },
                'Recovery: hydrating insights'
            );
            this.summaryService.hydrateInsights(latestInsight.payload);
        } else {
            log.info({ sessionId: session.id }, 'Recovery: no insights to hydrate');
        }

        // Send recovered transcripts to UI
        if (transcripts && transcripts.length > 0) {
            const listenWindow = windowPool?.get('listen');
            if (listenWindow && !listenWindow.isDestroyed()) {
                log.info({ sessionId: session.id, transcripts: transcripts.length }, 'Recovery: sending transcripts to UI');
                transcripts.forEach(t => {
                    sendEvent({
                        webContents: listenWindow.webContents,
                        channel: 'stt-update',
                        args: [
                            {
                                speaker: t.speaker,
                                text: t.text,
                                isFinal: true,
                                isPartial: false,
                            },
                        ],
                    });
                });
                // Force height recalculation after transcripts load (fixes cut-off issue)
                setTimeout(() => {
                    if (listenWindow && !listenWindow.isDestroyed()) {
                        // Trigger manual height adjustment to force ResizeObserver update
                        sendEvent({ webContents: listenWindow.webContents, channel: 'force-height-recalc', args: [] });
                    }
                }, 200);
            }
        }

        // Notify SummaryView about existing transcripts (fixes "Insights will appear here" placeholder)
        if (transcripts && transcripts.length > 0) {
            const history = transcripts.map(t => ({ speaker: t.speaker, text: t.text }));
            this.sendToRenderer({ channel: 'listen:sync-conversation-history', args: [history] });
        }

        log.info({ sessionId: session.id, transcripts: transcripts.length, hasInsights: !!insights }, 'Resumed stranded session');

        // Clear stranded state
        this.strandedSession = null;
        this.isRecoveryDismissed = false;

        // Re-initialize STT
        await this.connectSttWithRetry({ language: 'en', failure: 'STT resume failed after retries' });

        // Send restored insights to renderer
        const listenWindow = windowPool?.get('listen');
        if (Array.isArray(insights) && insights.length > 0 && listenWindow && !listenWindow.isDestroyed()) {
            log.info({ sessionId: session.id, insightRounds: insights.length }, 'Recovery: sending insight rounds to UI');
            // Reverse so newest arrives first (matches normal operation)
            [...insights].reverse().forEach(insight => {
                sendEvent({
                    webContents: listenWindow.webContents,
                    channel: 'summary-update',
                    args: [
                        {
                            ...insight.payload,
                            presetId: this.summaryService.selectedPresetId || null,
                        },
                    ],
                });
            });
        } else {
            log.info(
                { sessionId: session.id, insightRounds: Array.isArray(insights) ? insights.length : 0, hasWindow: !!listenWindow },
                'Recovery: not sending insights'
            );
        }

        this.sendToRenderer({ channel: 'change-listen-capture-state', args: [{ status: 'start' }] });

        // Notify Listen window that session is active (enables transcription)
        if (listenWindow && !listenWindow.isDestroyed()) {
            sendEvent({ webContents: listenWindow.webContents, channel: 'session-state-changed', args: [{ isActive: true, mode: 'resume' }] });
        }

        // Show listen window
        internalBridge.emit('window:requestVisibility', { name: 'listen', visible: true });

        // Notify header to transition to inSession
        const header = windowPool.get('header');
        if (header) {
            sendEvent({ webContents: header.webContents, channel: 'listen:changeSessionResult', args: [{ success: true, nextStatus: 'inSession' }] });
        }

        return { success: true };
    }

    async finalizeStrandedSession(): Promise<HandlerResult> {
        if (!this.strandedSession?.session) {
            log.warn('finalizeStrandedSession called without stranded session');
            return { success: false, error: 'No stranded session' };
        }

        const { session } = this.strandedSession;
        const sessionId = session.id;

        log.info({ sessionId }, 'Finalizing stranded session in the background');

        // Clear stranded state immediately so the UI can continue
        this.strandedSession = null;
        this.isRecoveryDismissed = false;

        // Run finalize workflow in the background
        this._finalizeSessionInBackground(sessionId).catch(err => {
            log.error({ err, sessionId }, 'Background finalize failed');
        });

        return { success: true };
    }

    async _finalizeSessionInBackground(sessionId: string): Promise<void> {
        try {
            await this._generateAndSaveComprehensiveSummary(sessionId);
        } catch (err) {
            log.warn({ err, sessionId }, 'Failed to generate comprehensive summary for stranded session');
        }

        try {
            await sessionRepository.end(sessionId);
            log.info({ sessionId }, 'Finalized stranded session');
        } catch (err) {
            log.error({ err, sessionId }, 'Failed to mark stranded session as ended');
        }
    }

    // Wraps a handler so the IPC caller always gets `{ success, error }`.
    _createHandler<Args extends unknown[]>({
        run,
        successMessage,
        failureMessage,
    }: {
        run: (...args: Args) => Promise<HandlerResult | void>;
        successMessage: string | null;
        failureMessage: string;
    }): (...args: Args) => Promise<HandlerResult> {
        return async (...args: Args) => {
            try {
                const result = await run(...args);
                if (successMessage) log.info({ sessionId: this.currentSessionId }, successMessage);
                // `sendMicAudioContent` and `stopMacOSAudioCapture` return nothing on success;
                // answer `{ success: true }` for them so every handler sends the same shape.
                return result ? result : { success: true };
            } catch (e) {
                log.error({ err: e, sessionId: this.currentSessionId }, failureMessage);
                return { success: false, error: errorMessage(e) };
            }
        };
    }

    handleSendMicAudioContent = this._createHandler({
        run: (content: AudioContent) => this.sendMicAudioContent(content),
        successMessage: null,
        failureMessage: 'Error sending user audio',
    });

    handleStartMacosAudio = this._createHandler({
        run: async () => {
            if (process.platform !== 'darwin') {
                return { success: false, error: 'macOS audio capture only available on macOS' };
            }
            await this.startMacOSAudioCapture();
            return { success: true, error: null };
        },
        successMessage: 'macOS audio capture started',
        failureMessage: 'Error starting macOS audio capture',
    });

    handleStopMacosAudio = this._createHandler({
        run: () => this.stopMacOSAudioCapture(),
        successMessage: 'macOS audio capture stopped',
        failureMessage: 'Error stopping macOS audio capture',
    });
}

const listenService = new ListenService();
export default listenService;
