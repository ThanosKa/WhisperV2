const { BrowserWindow } = require('electron');
const llmClient = require('../common/ai/llmClient');
// Lazy require helper to avoid circular dependency issues
const getWindowManager = () => require('../../window/windowManager');
const internalBridge = require('../../bridge/internalBridge');
const summaryService = require('../listen/summary/summaryService');

const getWindowPool = () => {
    try {
        return getWindowManager().windowPool;
    } catch {
        return null;
    }
};

const sessionRepository = require('../common/repositories/session');
const askRepository = require('./repositories');
// const { getSystemPrompt } = require('../common/prompts/promptBuilder'); // Deprecated - using server-side prompt construction
const path = require('node:path');
const fs = require('node:fs');
const os = require('os');
const util = require('util');
const execFile = util.promisify(require('child_process').execFile);
const { desktopCapturer, screen } = require('electron');
const modelStateService = require('../common/services/modelStateService');
const config = require('../common/config/config');

// Try to load sharp, but don't fail if it's not available
let sharp;
try {
    sharp = require('sharp');
    console.log('[AskService] Sharp module loaded successfully');
} catch (error) {
    console.warn('[AskService] Sharp module not available:', error.message);
    console.warn('[AskService] Screenshot functionality will work with reduced image processing capabilities');
    sharp = null;
}
let lastScreenshot = null;

function broadcastQuotaUpdateFromResponse(response) {
    try {
        const headers = response?.headers;
        if (!headers) return;
        const limitHeader = headers.get('x-ratelimit-limit') || headers.get('X-RateLimit-Limit');
        const usedHeader = headers.get('x-ratelimit-used') || headers.get('X-RateLimit-Used');
        const remainingHeader = headers.get('x-ratelimit-remaining') || headers.get('X-RateLimit-Remaining');

        const limit = Number.isFinite(Number(limitHeader)) ? Number(limitHeader) : undefined;
        const used = Number.isFinite(Number(usedHeader)) ? Number(usedHeader) : undefined;
        const remaining = Number.isFinite(Number(remainingHeader)) ? Number(remainingHeader) : undefined;

        if (typeof limit === 'undefined' && typeof used === 'undefined' && typeof remaining === 'undefined') return;

        BrowserWindow.getAllWindows().forEach(win => {
            if (win && !win.isDestroyed() && win.webContents && !win.webContents.isDestroyed()) {
                win.webContents.send('quota:update', { limit, used, remaining });
            }
        });
    } catch (e) {
        console.warn('[AskService] Failed to broadcast quota headers:', e?.message || e);
    }
}

async function captureScreenshot(options = {}) {
    if (process.platform === 'darwin') {
        try {
            const tempPath = path.join(os.tmpdir(), `screenshot-${Date.now()}.jpg`);

            await execFile('screencapture', ['-x', '-t', 'jpg', tempPath]);

            const imageBuffer = await fs.promises.readFile(tempPath);
            await fs.promises.unlink(tempPath);

            if (sharp) {
                try {
                    // Try using sharp for optimal image processing
                    const resizedBuffer = await sharp(imageBuffer).resize({ height: 384 }).jpeg({ quality: 80 }).toBuffer();

                    const base64 = resizedBuffer.toString('base64');
                    const metadata = await sharp(resizedBuffer).metadata();

                    lastScreenshot = {
                        base64,
                        width: metadata.width,
                        height: metadata.height,
                        timestamp: Date.now(),
                    };

                    return { success: true, base64, width: metadata.width, height: metadata.height };
                } catch (sharpError) {
                    console.warn('Sharp module failed, falling back to basic image processing:', sharpError.message);
                }
            }

            // Fallback: Return the original image without resizing
            console.log('[AskService] Using fallback image processing (no resize/compression)');
            const base64 = imageBuffer.toString('base64');

            lastScreenshot = {
                base64,
                width: null, // We don't have metadata without sharp
                height: null,
                timestamp: Date.now(),
            };

            return { success: true, base64, width: null, height: null };
        } catch (error) {
            console.error('Failed to capture screenshot:', error);
            return { success: false, error: error.message };
        }
    }

    try {
        // Determine which display the app is currently on (prefer Ask window, fallback to header)
        let targetDisplay = null;
        try {
            const pool = getWindowPool?.() || null;
            const askWin = pool?.get('ask');
            const headerWin = pool?.get('header');
            const refWin = askWin && !askWin.isDestroyed() && askWin.isVisible() ? askWin : headerWin;
            if (refWin && !refWin.isDestroyed()) {
                const b = refWin.getBounds();
                const center = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
                targetDisplay = screen.getDisplayNearestPoint(center);
            }
        } catch (_) {}

        const sources = await desktopCapturer.getSources({
            types: ['screen'],
            thumbnailSize: {
                width: 1920,
                height: 1080,
            },
        });

        if (sources.length === 0) {
            throw new Error('No screen sources available');
        }
        let source = sources[0];
        if (targetDisplay) {
            const targetId = String(targetDisplay.id);
            const matchByDisplayId = sources.find(s => String(s.display_id || '') === targetId);
            if (matchByDisplayId) {
                source = matchByDisplayId;
            } else {
                const parsedMatch = sources.find(s => {
                    const parts = String(s.id || '').split(':');
                    return parts.length >= 2 && parts[1] === targetId;
                });
                if (parsedMatch) source = parsedMatch;
            }
        }
        const buffer = source.thumbnail.toJPEG(70);
        const base64 = buffer.toString('base64');
        const size = source.thumbnail.getSize();

        return {
            success: true,
            base64,
            width: size.width,
            height: size.height,
        };
    } catch (error) {
        console.error('Failed to capture screenshot using desktopCapturer:', error);
        return {
            success: false,
            error: error.message,
        };
    }
}

/**
 * @class
 * @description
 */
class AskService {
    constructor() {
        this.abortController = null;
        this.state = {
            isVisible: false,
            isLoading: false,
            isStreaming: false,
            currentQuestion: '',
            currentResponse: '',
            showTextInput: true,
            interrupted: false,
        };
        this._forceDefaultProfileOnce = false;
        console.log('[AskService] Service instance created.');
    }

    /**
     * Determine explicit click intent from known action labels/prefixes.
     * This is evaluated BEFORE NLP heuristics to ensure precise routing.
     * @param {string} userPromptRaw
     * @returns {string|null} intent key (e.g., 'next', 'generic_followup', 'email', 'actions', 'summary', 'recap', 'define', 'root_causes', 'troubleshooting', 'study_questions', 'unclear', 'suggested_questions', 'gaps', 'objection', 'question')
     */
    _detectIntentFromClickPill(userPromptRaw) {
        const raw = (userPromptRaw || '').trim();
        const lower = raw.toLowerCase();

        // Exact common defaults
        if (raw === '✨ What should I say next?') return 'next';
        if (raw === '💬 Suggest follow-up questions') return 'generic_followup';
        if (raw === '✉️ Draft a follow-up email') return 'email';
        if (raw === '✅ Generate action items') return 'actions';
        if (raw === '📝 Show summary') return 'summary';
        if (raw === '🗒️ Recap meeting so far') return 'recap';

        // Prefixed items from analysis parsing
        if (raw.startsWith('📘 Define')) return 'define';
        if (raw.startsWith('📈 Sales Follow-Up')) return 'followup';
        if (raw.startsWith('❗❗ Objection')) return 'objection';
        if (raw.startsWith('❗❗Gap')) return 'gaps';
        if (raw.startsWith('👆 Suggested Question')) return 'suggested_questions';
        if (raw.startsWith('🔎 Root Cause')) return 'root_causes';
        if (raw.startsWith('🔍 Troubleshooting Step')) return 'troubleshooting';
        if (raw.startsWith('📚 Study Question')) return 'study_questions';
        if (raw.startsWith('❓ Clarify')) return 'unclear';

        // Generic question pill (placed last so Clarify takes precedence)
        if (raw.startsWith('❓ ')) return 'question';

        // Heuristic fallbacks (if labels localized or slightly edited)
        if (lower.includes('what should i say next')) return 'next';
        if (lower.includes('follow-up')) return 'generic_followup';
        if (lower.includes('action item')) return 'actions';
        if (lower.includes('recap')) return 'recap';
        if (lower.includes('summary')) return 'summary';
        if (lower.includes('email')) return 'email';
        if (lower.includes('root cause')) return 'root_causes';
        if (lower.includes('troubleshooting')) return 'troubleshooting';

        return null;
    }

    /**
     * Resolve profile id and whether to include conversation context based on intent and preset.
     * Only uses prompt IDs that exist in promptTemplates.
     * @param {string} intent
     * @param {string|null} presetId
     * @returns {{ profileToUse: string, useConversationContext: boolean }}
     */
    _resolveProfileForIntent(intent, presetId) {
        const preset = (presetId || '').trim() || 'default';
        // Centralized, low-risk routing table
        const MAP = {
            default: {
                next: 'whisper_next',
                generic_followup: 'whisper_followup',
                followup: 'whisper_followup',
                define: 'whisper_define',
                question: 'whisper_question',
                actions: 'whisper_actions',
                summary: 'whisper_summary',
                recap: 'whisper_recap',
                email: 'whisper_email',
            },
            sales: {
                next: 'sales_next',
                generic_followup: 'sales_followup',
                followup: 'sales_followup',
                define: 'sales_define',
                question: 'sales_answer_buyer',
                objection: 'sales_objection',
                suggested_questions: 'sales_followup',
                actions: 'sales_actions',
                summary: 'sales_summary',
                recap: 'sales_recap',
                email: 'sales_email',
            },
            recruiting: {
                next: 'recruiting_should_say_next',
                generic_followup: 'recruiting_followup',
                followup: 'recruiting_followup',
                define: 'recruiting_define',
                question: 'recruiting_question',
                suggested_questions: 'recruiting_suggested_question',
                gaps: 'recruiting_gap',
                actions: 'recruiting_actions',
                summary: 'recruiting_summary',
                recap: 'recruiting_recap',
                email: 'recruiting_email',
            },
            'customer-support': {
                next: 'customer_support_next',
                generic_followup: 'customer_support_followup',
                followup: 'customer_support_followup',
                define: 'customer_support_define',
                question: 'customer_support_question',
                root_causes: 'customer_support_root_cause',
                troubleshooting: 'customer_support_troubleshooting',
                actions: 'customer_support_actions',
                summary: 'customer_support_summary',
                recap: 'customer_support_recap',
                email: 'customer_support_email',
            },
            school: {
                next: 'school_next',
                generic_followup: 'school_followup',
                followup: 'school_followup',
                define: 'school_define',
                question: 'school_question',
                study_questions: 'school_followup',
                unclear: 'school_question',
                actions: 'school_actions',
                summary: 'school_summary',
                recap: 'school_recap',
                email: 'school_email',
            },
        };

        const table = MAP[preset] || MAP.default;
        const profileToUse = table[intent] || MAP.default[intent] || 'whisper';

        // Conversation context policy per intent
        const intentsWithoutContext = new Set(['define']);
        const useConversationContext = !intentsWithoutContext.has(intent);

        return { profileToUse, useConversationContext };
    }

    _deriveTitleFromPrompt(prompt) {
        try {
            const raw = (prompt || '').replace(/[\p{Emoji}\p{Extended_Pictographic}]/gu, '').trim();
            if (!raw) return '';
            // Use first sentence or up to ~12 words
            const sentence = raw.split(/(?<=[\.\!\?])\s+/)[0] || raw;
            const words = sentence.split(/\s+/).slice(0, 12).join(' ');
            const cleaned = words
                .replace(/[\r\n]+/g, ' ')
                .replace(/\s{2,}/g, ' ')
                .trim();
            // Capitalize first letter
            return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
        } catch (_) {
            return '';
        }
    }

    /**
     * Detects the intent/mode from user input to select the appropriate prompt template.
     *
     * @param {string} userPromptRaw
     * @returns {{ mode: 'default'|'define'|'email'|'actions'|'summary'|'recap'|'next'|'followup' }}
     */
    _expandInsightRequest(userPromptRaw) {
        const text = (userPromptRaw || '').toLowerCase();
        const stripEmoji = s => s.replace(/[\p{Emoji}\p{Extended_Pictographic}]/gu, '').trim();
        const normalized = stripEmoji(text);

        // Draft follow-up email
        if (normalized.includes('draft') && normalized.includes('email')) {
            return { mode: 'email' };
        }

        // Define term (📘 Define "...")
        const defineQuoted = normalized.match(/define\s+"([^"]+)"/);
        if (normalized.startsWith('📘') || normalized.startsWith('define') || defineQuoted) {
            const raw = (userPromptRaw || '').trim();
            const fromQuotes = raw.match(/"([^"]+)"/);
            let term =
                fromQuotes?.[1] ||
                raw
                    .replace(/^📘\s*/i, '')
                    .replace(/^define\s*/i, '')
                    .replace(/"/g, '')
                    .trim();
            term = term.replace(/^about\s+/i, '').trim();
            if (term && term.length > 1) {
                return { mode: 'define' };
            }
        }

        // Generate action items
        if (normalized.includes('action') && normalized.includes('item')) {
            return { mode: 'actions' };
        }

        // Show summary
        if (normalized.includes('show summary') || normalized === 'summary' || normalized.includes('summar')) {
            return { mode: 'summary' };
        }

        // Recap meeting so far
        if (normalized.includes('recap') && normalized.includes('meeting')) {
            return { mode: 'recap' };
        }

        // What should I say next (enhanced for support)
        if (
            normalized.includes('what should i say next') ||
            normalized.includes('what to say next') ||
            normalized.includes('next support step') ||
            normalized.includes('what to respond') ||
            normalized.includes('support next action')
        ) {
            return { mode: 'next' }; // Now catches support variants
        }

        // Suggest follow-up questions
        if (normalized.includes('suggest follow-up') || normalized.includes('follow-up questions') || normalized.includes('💬')) {
            return { mode: 'generic_followup' };
        }
        if (normalized.includes('sales follow-up') || normalized.includes('💡') || normalized.includes('📈')) {
            return { mode: 'followup' };
        }
        if (normalized.includes('buyer asks') || normalized.includes('them asks')) {
            return { mode: 'buyer_question' };
        }
        if (normalized.includes('address objection') || normalized.includes('🔄')) {
            return { mode: 'objection' };
        }
        if (normalized.includes('objection') || normalized.includes('‼️')) {
            return { mode: 'objection' };
        }
        if (normalized.includes('gap') || normalized.includes('🔍')) {
            return { mode: 'gaps' };
        } else if (normalized.includes('root cause') || normalized.includes('🔎')) {
            return { mode: 'root_causes' };
        } else if (normalized.includes('clarify') || normalized.includes('❓ clarify')) {
            return { mode: 'unclear' };
        } else if (normalized.includes('study question') || normalized.includes('📚')) {
            return { mode: 'study_questions' };
        } else if (normalized.includes('troubleshooting') || normalized.includes('🛠️')) {
            return { mode: 'troubleshooting' };
        } else if (normalized.includes('suggested question') || normalized.includes('💡 suggested')) {
            return { mode: 'suggested_questions' };
        }

        return { mode: 'default' };
    }

    interruptStream() {
        if (this.abortController) {
            console.log('[AskService] User interrupted the stream.');
            this.abortController.abort('User interrupted');
            this.abortController = null;

            // To avoid race conditions, ensure this is the definitive final state update.
            this.state = {
                ...this.state,
                isLoading: false,
                isStreaming: false,
                showTextInput: false,
                interrupted: true,
            };
            this._broadcastState();
        }
    }

    _broadcastState() {
        const askWindow = getWindowPool()?.get('ask');
        if (askWindow && !askWindow.isDestroyed()) {
            askWindow.webContents.send('ask:stateUpdate', this.state);
        }
    }

    async toggleAskButton(inputScreenOnly = false) {
        const askWindow = getWindowPool()?.get('ask');

        let shouldSendScreenOnly = false;
        if (inputScreenOnly && this.state.showTextInput && askWindow && askWindow.isVisible()) {
            shouldSendScreenOnly = true;
            const listenService = require('../listen/listenService');
            const conversationHistory = listenService.getConversationHistory();
            await this.sendMessage('Assist me', conversationHistory);
            return;
        }

        const hasContent = this.state.isLoading || this.state.isStreaming || (this.state.currentResponse && this.state.currentResponse.length > 0);

        if (askWindow && askWindow.isVisible() && hasContent) {
            this.state.showTextInput = !this.state.showTextInput;
            this._broadcastState();
        } else {
            if (askWindow && askWindow.isVisible()) {
                internalBridge.emit('window:requestVisibility', { name: 'ask', visible: false });
                this.state.isVisible = false;
            } else {
                console.log('[AskService] Showing hidden Ask window');
                internalBridge.emit('window:requestVisibility', { name: 'ask', visible: true });
                this.state.isVisible = true;
            }
            if (this.state.isVisible) {
                this.state.showTextInput = true;
                this._broadcastState();
            }
        }
    }

    async closeAskWindow() {
        if (this.abortController) {
            this.abortController.abort('Window closed by user');
            this.abortController = null;
        }

        this.state = {
            isVisible: false,
            isLoading: false,
            isStreaming: false,
            currentQuestion: '',
            currentResponse: '',
            showTextInput: true,
            interrupted: false,
        };
        this._broadcastState();

        internalBridge.emit('window:requestVisibility', { name: 'ask', visible: false });

        return { success: true };
    }

    /**
     *
     * @param {string[]} conversationTexts
     * @returns {string}
     * @private
     */
    _formatConversationForPrompt(conversationTexts) {
        if (!conversationTexts || conversationTexts.length === 0) {
            return 'No conversation history available.';
        }
        // return conversationTexts.slice(-30).join('\n'); // Former limit
        return conversationTexts.join('\n'); // Send full conversation
    }

    /**
     *
     * @param {string} userPrompt
     * @returns {Promise<{success: boolean, response?: string, error?: string}>}
     */
    async sendMessage(userPrompt, conversationHistoryRaw = [], presetId = null) {
        // Normalize and fallback to default help text when empty
        try {
            userPrompt = ((userPrompt ?? '') + '').trim();
        } catch (_) {
            userPrompt = '';
        }
        const originalPrompt = userPrompt; // Keep for title derivation
        if (!userPrompt) {
            userPrompt = 'Help me';
        }
        internalBridge.emit('window:requestVisibility', { name: 'ask', visible: true });
        this.state = {
            ...this.state,
            isLoading: true,
            isStreaming: false,
            currentQuestion: userPrompt,
            currentResponse: '',
            showTextInput: false,
            interrupted: false,
        };
        this._broadcastState();

        if (this.abortController) {
            this.abortController.abort('New request received.');
        }
        this.abortController = new AbortController();
        const { signal } = this.abortController;

        let sessionId;

        try {
            console.log(`[AskService] 🤖 Processing message: ${userPrompt.substring(0, 50)}...`);
            console.log(`[AskService] history: items=${conversationHistoryRaw?.length || 0}`);

            // Check if we're in a meeting context (open listen session exists)
            const listenService = require('../listen/listenService');
            const currentListenSessionId = listenService.getCurrentSessionData()?.sessionId || null;
            const isInMeeting = Boolean(currentListenSessionId);

            if (isInMeeting) {
                // We're in a meeting - use or promote to listen session for context
                sessionId = await sessionRepository.getOrCreateActive('listen');
                console.log(`[AskService] 📋 Using meeting session ${sessionId} for ask question`);
            } else {
                // Standalone question - create new session for each question
                sessionId = await sessionRepository.create('ask');
                console.log(`[AskService] ❓ Created new question session ${sessionId}`);
                // Derive and save a concise title from user prompt
                const derived = this._deriveTitleFromPrompt(originalPrompt);
                if (derived) {
                    try {
                        await sessionRepository.updateTitle(sessionId, derived);
                        console.log(`[AskService] 🏷️ Titled question session ${sessionId}: ${derived}`);
                    } catch (e) {
                        console.warn('[AskService] Failed to update session title for ask session:', e.message);
                    }
                }
            }
            await askRepository.addAiMessage({ sessionId, role: 'user', content: userPrompt.trim() });
            console.log(`[AskService] DB: Saved user prompt to session ${sessionId}`);

            // LLM is server-backed only; no client-side provider/model
            console.log('[AskService] model: provider=server, model=remote-default');

            // Capture screenshot for manual Ask (sendMessageManual) OR when prompt equals 'Assist me'
            // 'Assist me' is the Ask template's empty-input fallback and should include a screenshot
            const isAssistMe = (userPrompt || '').trim().toLowerCase() === 'assist me';
            const shouldCaptureScreenshot = this._forceDefaultProfileOnce === true || isAssistMe;
            let screenshotBase64 = null;
            if (shouldCaptureScreenshot) {
                const screenshotResult = await captureScreenshot({ quality: 'medium' });
                screenshotBase64 = screenshotResult.success ? screenshotResult.base64 : null;
            }
            const screenshotTaken = Boolean(screenshotBase64);

            const conversationHistory = this._formatConversationForPrompt(conversationHistoryRaw);
            console.log(
                `[AskService] what llm sees: clickLen=${userPrompt.trim().length}, historyChars=${conversationHistory.length}, screenshot=${screenshotBase64 ? 1 : 0}`
            );
            const expansion = this._expandInsightRequest(userPrompt);
            console.log(`[AskService] expanded intent (heuristic): mode=${expansion.mode}`);

            // Prefer explicit click intent detection from pill labels/prefixes
            const explicitIntent = this._detectIntentFromClickPill(userPrompt) || expansion.mode;
            const activePreset = presetId || (summaryService && summaryService.selectedPresetId) || null;

            let { profileToUse, useConversationContext } = this._resolveProfileForIntent(explicitIntent, activePreset);

            if (this._forceDefaultProfileOnce) {
                console.log('[AskService] Manual Ask detected → forcing default profile: whisper');
                profileToUse = 'whisper';
                // Keep context decision based on intent (e.g., define=false), do not override
            }

            // Build context for prompt
            let contextForPrompt = useConversationContext ? conversationHistory : '';

            // For analysis profiles, include previous terms/questions context from summary service
            if (isInMeeting && profileToUse && profileToUse.endsWith('_analysis')) {
                const summaryContext = summaryService.getCurrentContext();
                if (summaryContext && (summaryContext.definedTerms.length > 0 || summaryContext.detectedQuestions.length > 0)) {
                    // Use the summary service's method to format context appropriately for the analysis type
                    const previousContext = summaryService.getFormattedPreviousContext(profileToUse);
                    contextForPrompt = contextForPrompt ? `${contextForPrompt}\n\n${previousContext}` : previousContext;
                    console.log(
                        `[AskService] Added summary context for ${profileToUse}: ${summaryContext.definedTerms.length} terms, ${summaryContext.detectedQuestions.length} questions`
                    );
                }
            }

            // Build new payload format for server-side prompt construction
            const userContent = screenshotBase64
                ? [
                      { type: 'text', text: userPrompt.trim() },
                      {
                          type: 'image_url',
                          image_url: { url: `data:image/jpeg;base64,${screenshotBase64}` },
                      },
                  ]
                : userPrompt.trim();

            if (screenshotBase64) {
                try {
                    console.log('[AskService] screenshot present:', {
                        b64Len: screenshotBase64.length,
                        head: screenshotBase64.slice(0, 32),
                    });
                } catch (_) {}
            }

            // Build context object for analysis profiles
            let context = null;
            if (isInMeeting && profileToUse && profileToUse.endsWith('_analysis')) {
                const summaryContext = summaryService.getCurrentContext();
                if (summaryContext && (summaryContext.definedTerms.length > 0 || summaryContext.detectedQuestions.length > 0)) {
                    context = {
                        transcript: contextForPrompt,
                        previousItems: [
                            ...summaryContext.definedTerms.map(term => `📘 Define ${term}`),
                            ...summaryContext.detectedQuestions.map(question => `❓ ${question}`),
                        ],
                    };
                    console.log(
                        `[AskService] Added summary context for ${profileToUse}: ${summaryContext.definedTerms.length} terms, ${summaryContext.detectedQuestions.length} questions`
                    );
                }
            } else if (useConversationContext && contextForPrompt) {
                context = contextForPrompt; // Simple string context for non-analysis profiles
            }

            const payload = {
                profile: profileToUse,
                userContent: userContent,
                context: context,
            };

            // concise request log
            try {
                const hasImagePart = screenshotBase64 ? true : false;
                console.log('[AskService] sending request to llm', {
                    profile: profileToUse,
                    hasImage: hasImagePart,
                    hasContext: !!context,
                });
            } catch (_) {
                console.log('[AskService] sending request to llm');
            }

            try {
                const response = await llmClient.stream(payload, { signal });

                // Broadcast quota headers immediately on stream start
                broadcastQuotaUpdateFromResponse(response);

                console.log('📡 [AskService] LLM responded - starting to process stream...');

                const askWin = getWindowPool()?.get('ask');

                if (!askWin || askWin.isDestroyed()) {
                    console.error('[AskService] Ask window is not available to send stream to.');
                    response.body.getReader().cancel();
                    return { success: false, error: 'Ask window is not available.' };
                }

                const reader = response.body.getReader();
                signal.addEventListener('abort', () => {
                    console.log(`[AskService] Aborting stream reader. Reason: ${signal.reason}`);
                    reader.cancel(signal.reason).catch(() => {
                        /* Ignore errors when already cancelled */
                    });
                });

                await this._processStream(reader, askWin, sessionId, signal);
                console.log(`[AskService] ✅ LLM stream finished. screenshotTaken=${screenshotTaken}`);
                return { success: true };
            } catch (multimodalError) {
                // 멀티모달 요청이 실패했고 스크린샷이 포함되어 있다면 텍스트만으로 재시도
                if (screenshotBase64 && this._isMultimodalError(multimodalError)) {
                    console.log(`[AskService] Multimodal request failed, retrying with text-only: ${multimodalError.message}`);

                    // 텍스트만으로 payload 재구성
                    const textOnlyPayload = {
                        profile: profileToUse,
                        userContent: `User Request: ${userPrompt.trim()}`,
                        context: context,
                        model: 'gemini-2.5-flash-lite',
                        temperature: 0.7,
                    };

                    const fallbackResponse = await llmClient.stream(textOnlyPayload, { signal });
                    // Broadcast quota headers for fallback as well
                    broadcastQuotaUpdateFromResponse(fallbackResponse);
                    const askWin = getWindowPool()?.get('ask');

                    if (!askWin || askWin.isDestroyed()) {
                        console.error('[AskService] Ask window is not available for fallback response.');
                        fallbackResponse.body.getReader().cancel();
                        return { success: false, error: 'Ask window is not available.' };
                    }

                    const fallbackReader = fallbackResponse.body.getReader();
                    signal.addEventListener('abort', () => {
                        console.log(`[AskService] Aborting fallback stream reader. Reason: ${signal.reason}`);
                        fallbackReader.cancel(signal.reason).catch(() => {});
                    });

                    await this._processStream(fallbackReader, askWin, sessionId, signal);
                    console.log(`[AskService] ✅ LLM stream finished (fallback). screenshotTaken=${screenshotTaken}`);
                    return { success: true };
                } else {
                    // 다른 종류의 에러이거나 스크린샷이 없었다면 그대로 throw
                    throw multimodalError;
                }
            }
        } catch (error) {
            console.error('[AskService] Error during message processing:', error);
            this.state = {
                ...this.state,
                isLoading: false,
                isStreaming: false,
                showTextInput: true,
            };
            this._broadcastState();

            const askWin = getWindowPool()?.get('ask');
            if (askWin && !askWin.isDestroyed()) {
                // Detect quota exceeded via status text to keep logic simple
                const msg = (error?.message || '').toLowerCase();
                if (msg.includes('429') || msg.includes('too many requests')) {
                    askWin.webContents.send('ask-response-stream-error', { error: 'quota_exceeded' });
                } else {
                    const streamError = error.message || 'Unknown error occurred';
                    askWin.webContents.send('ask-response-stream-error', { error: streamError });
                }
            }

            return { success: false, error: error.message };
        }
    }

    /**
     *
     * @param {ReadableStreamDefaultReader} reader
     * @param {BrowserWindow} askWin
     * @param {number} sessionId
     * @param {AbortSignal} signal
     * @returns {Promise<void>}
     * @private
     */
    async _processStream(reader, askWin, sessionId, signal) {
        const decoder = new TextDecoder();
        let fullResponse = '';
        let tokenCount = 0;
        let firstTokenReceived = false;

        try {
            this.state.isLoading = false;
            this.state.isStreaming = true;
            this._broadcastState();

            console.log('📡 [AskService] Starting to process LLM response stream...');

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value);
                const lines = chunk.split('\n').filter(line => line.trim() !== '');

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.substring(6);
                        if (data === '[DONE]') {
                            console.log('🏁 [AskService] LLM stream completed with [DONE] signal');
                            return;
                        }
                        try {
                            const json = JSON.parse(data);
                            const token = json.choices[0]?.delta?.content || '';
                            if (token) {
                                if (!firstTokenReceived) {
                                    // console.log('🔥 [AskService] First token received from LLM:', JSON.stringify(token));
                                    firstTokenReceived = true;
                                }

                                tokenCount++;
                                fullResponse += token;
                                this.state.currentResponse = fullResponse;
                                this._broadcastState();

                                // Log first few tokens for debugging
                                // if (tokenCount <= 10) {
                                //     console.log(`📄 [AskService] Token ${tokenCount}:`, JSON.stringify(token));
                                // } else if (tokenCount === 11) {
                                //     console.log('📄 [AskService] Continuing stream... (further tokens not logged)');
                                // }
                            }
                        } catch (error) {}
                    }
                }
            }

            console.log('📊 [AskService] Stream processing completed. Total tokens:', tokenCount);
            console.log('📋 [AskService] Final response length:', fullResponse.length, 'characters');
        } catch (streamError) {
            if (signal.aborted) {
                console.log(`[AskService] Stream reading was intentionally cancelled. Reason: ${signal.reason}`);
            } else {
                console.error('[AskService] Error while processing stream:', streamError);
                if (askWin && !askWin.isDestroyed()) {
                    askWin.webContents.send('ask-response-stream-error', { error: streamError.message });
                }
            }
        } finally {
            this.state.isStreaming = false;
            // If the stream was aborted, `interruptStream` is responsible for state.
            if (!signal.aborted) {
                this.state.currentResponse = fullResponse;
                this._broadcastState();
            }

            if (fullResponse) {
                try {
                    await askRepository.addAiMessage({ sessionId, role: 'assistant', content: fullResponse });
                    console.log(`[AskService] DB: Saved partial or full assistant response to session ${sessionId} after stream ended.`);
                } catch (dbError) {
                    console.error('[AskService] DB: Failed to save assistant response after stream ended:', dbError);
                }
            }
        }
    }

    /**
     * Determine if it's a multimodal-related error
     * @private
     */
    async _isMultimodalError(error) {
        const errorMessage = error.message?.toLowerCase() || '';
        return (
            errorMessage.includes('vision') ||
            errorMessage.includes('image') ||
            errorMessage.includes('multimodal') ||
            errorMessage.includes('unsupported') ||
            errorMessage.includes('image_url') ||
            errorMessage.includes('400') || // Bad Request often for unsupported features
            errorMessage.includes('invalid') ||
            errorMessage.includes('not supported')
        );
    }

    async sendMessageManual(userPrompt, conversationHistoryRaw = []) {
        this._forceDefaultProfileOnce = true;
        try {
            return await this.sendMessage(userPrompt, conversationHistoryRaw);
        } finally {
            this._forceDefaultProfileOnce = false;
        }
    }
}

const askService = new AskService();

module.exports = askService;
