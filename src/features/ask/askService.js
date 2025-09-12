const { BrowserWindow } = require('electron');
const { createStreamingLLM } = require('../common/ai/factory');
// Lazy require helper to avoid circular dependency issues
const getWindowManager = () => require('../../window/windowManager');
const internalBridge = require('../../bridge/internalBridge');

const getWindowPool = () => {
    try {
        return getWindowManager().windowPool;
    } catch {
        return null;
    }
};

const sessionRepository = require('../common/repositories/session');
const askRepository = require('./repositories');
const { getSystemPrompt } = require('../common/prompts/promptBuilder');
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

    _deriveTitleFromPrompt(prompt) {
        try {
            const raw = (prompt || '').replace(/[\p{Emoji}\p{Extended_Pictographic}]/gu, '').trim();
            if (!raw) return '';
            // Use first sentence or up to ~12 words
            const sentence = raw.split(/(?<=[\.\!\?])\s+/)[0] || raw;
            const words = sentence.split(/\s+/).slice(0, 12).join(' ');
            const cleaned = words.replace(/[\r\n]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
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

        // What should I say next
        if (normalized.includes('what should i say next') || normalized.includes('what to say next')) {
            return { mode: 'next' };
        }

        // Suggest follow-up questions
        if (normalized.includes('suggest follow-up') || normalized.includes('follow-up questions')) {
            return { mode: 'followup' };
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
    async sendMessage(userPrompt, conversationHistoryRaw = []) {
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

            const modelInfo = await modelStateService.getCurrentModelInfo('llm');
            if (!modelInfo || !modelInfo.apiKey) {
                throw new Error('AI model or API key not configured.');
            }
            console.log(`[AskService] model: provider=${modelInfo.provider}, model=${modelInfo.model}`);

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
            console.log(`[AskService] expanded intent: mode=${expansion.mode}`);

            // Simple context logic - let AI decide when to use context
            let profileToUse = 'whisper';
            let useConversationContext = true;

            if (!this._forceDefaultProfileOnce) {
                if (expansion.mode === 'define') {
                    profileToUse = 'whisper_define';
                    useConversationContext = false; // Definitions are universal - no context needed
                } else if (expansion.mode === 'email') {
                    profileToUse = 'whisper_email';
                    useConversationContext = true; // Email needs meeting context
                } else if (expansion.mode === 'actions') {
                    profileToUse = 'whisper_actions';
                    useConversationContext = true; // Action items need meeting context
                } else if (expansion.mode === 'summary') {
                    profileToUse = 'whisper_summary';
                    useConversationContext = true; // Summary needs meeting context
                } else if (expansion.mode === 'recap') {
                    profileToUse = 'whisper_recap';
                    useConversationContext = true; // Recap needs meeting context
                } else if (expansion.mode === 'next') {
                    profileToUse = 'whisper_next';
                    useConversationContext = true; // Next steps need meeting context
                } else if (expansion.mode === 'followup') {
                    profileToUse = 'whisper_followup';
                    useConversationContext = true; // Follow-up questions need meeting context
                } else if (userPrompt.startsWith('❓')) {
                    profileToUse = 'whisper_question';
                    useConversationContext = true; // Provide context, let AI decide if relevant
                }
            } else {
                console.log('[AskService] Manual Ask detected → forcing default profile: whisper');
            }

            // Use conversation context only for meeting-related actions
            const contextForPrompt = useConversationContext ? conversationHistory : '';
            const systemPrompt = getSystemPrompt(profileToUse, contextForPrompt, false);

            const userTask = userPrompt.trim();
            const messages = [
                { role: 'system', content: systemPrompt },
                {
                    role: 'user',
                    content: [{ type: 'text', text: `${userTask}` }],
                },
            ];

            if (screenshotBase64) {
                messages[1].content.push({
                    type: 'image_url',
                    image_url: { url: `data:image/jpeg;base64,${screenshotBase64}` },
                });
            }

            // concise request log
            console.log('[AskService] sending request to llm');

            // Write LLM input to response.txt
            try {
                const fs = require('fs');
                const path = require('path');
                const rootPath = path.resolve(__dirname, '../../../');
                const responsePath = path.join(rootPath, 'response.txt');
                const timestamp = new Date().toISOString();

                const llmMessages = messages
                    .map(msg => {
                        if (msg.role === 'system') {
                            return `SYSTEM: ${msg.content}`;
                        } else if (msg.role === 'user') {
                            if (Array.isArray(msg.content)) {
                                return `USER: ${msg.content.map(c => (c.type === 'text' ? c.text : '[IMAGE]')).join(' ')}`;
                            } else {
                                return `USER: ${msg.content}`;
                            }
                        }
                        return `${msg.role.toUpperCase()}: ${msg.content}`;
                    })
                    .join('\n\n');

                const responseEntry = `[${timestamp}]
User prompt: ${userPrompt}
Mode: Meeting Copilot
Profile used: ${profileToUse}
Using conversation context: ${useConversationContext}

What LLM got:
${llmMessages}

`;
                fs.appendFileSync(responsePath, responseEntry);
            } catch (error) {
                console.error('[AskService] Failed to write response.txt:', error);
            }

            const streamingLLM = createStreamingLLM(modelInfo.provider, {
                apiKey: modelInfo.apiKey,
                model: modelInfo.model,
                temperature: 0.7,
                maxTokens: 2048,
            });

            try {
                const response = await streamingLLM.streamChat(messages, { signal });

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

                    // 텍스트만으로 메시지 재구성
                    const textOnlyMessages = [
                        { role: 'system', content: systemPrompt },
                        {
                            role: 'user',
                            content: `User Request: ${userPrompt.trim()}`,
                        },
                    ];

                    const fallbackResponse = await streamingLLM.streamChat(textOnlyMessages, { signal });
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
                const streamError = error.message || 'Unknown error occurred';
                askWin.webContents.send('ask-response-stream-error', { error: streamError });
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
