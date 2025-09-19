const llmClient = require('../../common/ai/llmClient');
const sessionRepository = require('../../common/repositories/session');
const summaryRepository = require('./repositories');
const config = require('../../common/config/config');
const { getSystemPrompt } = require('../../common/prompts/promptBuilder');

class SummaryService {
    constructor() {
        this.previousAnalysisResult = null;
        this.analysisHistory = [];
        this.conversationHistory = [];
        this.currentSessionId = null;
        this.definedTerms = new Set(); // Track previously defined terms
        this.lastAnalyzedIndex = 0; // Track how many utterances we've already analyzed
        this.detectedQuestions = new Set(); // Track previously detected questions
        this.analysisProfile = 'meeting_analysis'; // base template id

        // Phase 1: Analysis preset selection state
        this.selectedPresetId = null;
        this.selectedRoleText = '';

        // Callbacks
        this.onAnalysisComplete = null;
        this.onStatusUpdate = null;
    }

    /**
     * Extract up to maxTerms Define candidates from the last few conversation lines.
     * Looks for proper-noun sequences, acronyms, and technical terms.
     */
    _extractDefineCandidates(conversationTexts, maxTerms = 3) {
        if (!Array.isArray(conversationTexts) || conversationTexts.length === 0) return [];

        // Look at the last 3-5 lines for terms
        const recentLines = conversationTexts.slice(-5);
        const candidates = new Set();

        recentLines.forEach(line => {
            // Strip speaker prefix like "me:"/"them:"
            const cleaned = line.replace(/^\s*(me|them)\s*:\s*/i, '').trim();
            if (!cleaned) return;

            const words = cleaned.split(/\s+/);
            let buffer = [];

            for (const w of words) {
                const token = w.replace(/[\.,!?;:"'\)\(\[\]]+$/g, '');

                // Multi-word proper nouns (e.g., "Machine Learning", "Azure DevOps")
                if (/^[A-Z][a-zA-Z]+$/.test(token)) {
                    buffer.push(token);
                }
                // ALLCAPS acronyms (e.g., "AI", "API", "GenAI")
                else if (/^[A-Z]{2,}$/.test(token)) {
                    if (buffer.length > 0) {
                        candidates.add(buffer.join(' '));
                        buffer = [];
                    }
                    candidates.add(token);
                }
                // Technical terms with mixed case (e.g., "JavaScript", "DevOps")
                else if (/^[A-Z][a-z]*[A-Z]/.test(token)) {
                    if (buffer.length > 0) {
                        candidates.add(buffer.join(' '));
                        buffer = [];
                    }
                    candidates.add(token);
                } else {
                    if (buffer.length > 0) {
                        candidates.add(buffer.join(' '));
                        buffer = [];
                    }
                }
            }
            if (buffer.length > 0) {
                candidates.add(buffer.join(' '));
            }
        });

        // Filter out common words and very short terms
        const filtered = Array.from(candidates).filter(term => term.length > 1 && !['The', 'And', 'But', 'For', 'Or', 'So', 'Yet'].includes(term));

        // Return the most recent terms first, up to maxTerms
        return filtered.slice(-maxTerms).reverse();
    }

    setCallbacks({ onAnalysisComplete, onStatusUpdate }) {
        this.onAnalysisComplete = onAnalysisComplete;
        this.onStatusUpdate = onStatusUpdate;
    }

    setSessionId(sessionId) {
        this.currentSessionId = sessionId;
    }

    setAnalysisProfile(profileId) {
        // Minimal guard; future: validate against known profiles
        if (typeof profileId === 'string' && profileId.trim()) {
            this.analysisProfile = profileId.trim();
        }
    }

    /**
     * Set the active analysis preset and cache its role text (trimmed to ~100 words).
     * Accepts null/empty to clear and fall back to base template without role.
     */
    async setAnalysisPreset(presetId) {
        try {
            this.selectedPresetId = presetId || null;

            if (!presetId) presetId = 'personal';

            const settingsService = require('../../settings/settingsService');
            const presets = await settingsService.getPresets();
            const preset = Array.isArray(presets) ? presets.find(p => p && p.id === presetId) : null;

            if (!preset) {
                console.warn('[SummaryService] setAnalysisPreset: preset not found, clearing role');
                this.selectedRoleText = '';
                return { success: false, error: 'preset_not_found' };
            }

            const roleText = this._extractRoleFromPrompt(preset.prompt);
            this.selectedRoleText = this._trimToWordLimit(roleText, 100);
            return { success: true };
        } catch (err) {
            console.warn('[SummaryService] setAnalysisPreset error:', err.message);
            this.selectedRoleText = '';
            return { success: false, error: err.message };
        }
    }

    _extractRoleFromPrompt(prompt) {
        if (!prompt || typeof prompt !== 'string') return '';
        try {
            const parsed = JSON.parse(prompt);
            if (parsed && parsed.kind === 'analysis_role' && typeof parsed.role === 'string') {
                return parsed.role || '';
            }
        } catch (_) {
            // not JSON, treat as raw text
        }
        return prompt;
    }

    _trimToWordLimit(text, maxWords) {
        if (!text || typeof text !== 'string') return '';
        const words = text.trim().split(/\s+/);
        if (words.length <= maxWords) return text.trim();
        return words.slice(0, maxWords).join(' ');
    }

    sendToRenderer(channel, data) {
        const { windowPool } = require('../../../window/windowManager');
        const listenWindow = windowPool?.get('listen');

        if (listenWindow && !listenWindow.isDestroyed()) {
            listenWindow.webContents.send(channel, data);
        }
    }

    addConversationTurn(speaker, text) {
        const conversationText = `${speaker.toLowerCase()}: ${text.trim()}`;
        this.conversationHistory.push(conversationText);
        // console.log(`💬 Added conversation text: ${conversationText}`);
        // console.log(`📈 Total conversation history: ${this.conversationHistory.length} texts`);

        // Trigger analysis if needed
        this.triggerAnalysisIfNeeded();
    }

    getConversationHistory() {
        console.log('[SummaryService] history length:', this.conversationHistory.length);
        return this.conversationHistory;
    }

    resetConversationHistory() {
        this.conversationHistory = [];
        this.previousAnalysisResult = null;
        this.analysisHistory = [];
        this.definedTerms.clear(); // Clear defined terms for new conversation
        this.detectedQuestions.clear(); // Clear detected questions for new conversation
        this.lastAnalyzedIndex = 0; // Reset analysis tracking
        console.log('🔄 Conversation history and analysis state reset');
    }

    /**
     * Converts conversation history into text to include in the prompt.
     * @param {Array<string>} conversationTexts - Array of conversation texts ["me: ~~~", "them: ~~~", ...]
     * @param {number} maxTurns - Maximum number of recent turns to include
     * @returns {string} - Formatted conversation string for the prompt
     */
    formatConversationForPrompt(conversationTexts, maxTurns = 30) {
        if (conversationTexts.length === 0) return '';
        return conversationTexts.slice(-maxTurns).join('\n');
    }

    async makeOutlineAndRequests(conversationTexts, maxTurns = 30) {
        console.log(`🔍 makeOutlineAndRequests called - conversationTexts: ${conversationTexts.length}`);

        if (conversationTexts.length === 0) {
            console.log('⚠️ No conversation texts available for analysis');
            return null;
        }

        const recentConversation = this.formatConversationForPrompt(conversationTexts, maxTurns);

        // Build previous items for de-duplication guidance
        const prevDefines = Array.from(this.definedTerms);
        const prevQuestions = Array.from(this.detectedQuestions);

        // Only include previous context if we have meaningful insights (not just default actions)
        let contextualPrompt = '';
        if (this.previousAnalysisResult && this.previousAnalysisResult.summary.length > 0) {
            const meaningfulSummary = this.previousAnalysisResult.summary.filter(s => s && !s.includes('No progress') && !s.includes('No specific'));
            if (meaningfulSummary.length > 0) {
                contextualPrompt = `
Previous Context: ${meaningfulSummary.slice(0, 2).join('; ')}`;
            }
        }

        // Combine contextual prompt with recent conversation for the template
        // Make sections explicit so LLM analyzes only the transcript
        const fullContext = contextualPrompt
            ? `${contextualPrompt.trim()}\n\nPreviously Defined Terms:\n${(prevDefines || []).join(', ') || '(none)'}\n\nPreviously Detected Questions:\n${(prevQuestions || []).join(' | ') || '(none)'}\n\nTranscript:\n${recentConversation}`
            : `Previously Defined Terms:\n${(prevDefines || []).join(', ') || '(none)'}\n\nPreviously Detected Questions:\n${(prevQuestions || []).join(' | ') || '(none)'}\n\nTranscript:\n${recentConversation}`;

        // Build base system prompt and inject role for ALL presets (role-only editing)
        const baseSystem = getSystemPrompt('meeting_analysis', {
            context: fullContext,
            // Simplified: rely on client-side de-duplication of defines
        });
        const rolePrefix = this.selectedRoleText && this.selectedRoleText.trim() ? `<role>${this.selectedRoleText.trim()}</role>\n\n` : '';
        const systemPrompt = `${rolePrefix}${baseSystem}`;

        try {
            if (this.currentSessionId) {
                await sessionRepository.touch(this.currentSessionId);
            }

            // Server-backed LLM only; no client-side provider/model

            const messages = [
                {
                    role: 'system',
                    content: systemPrompt,
                },
                {
                    role: 'user',
                    content: 'Analyze the conversation provided in the Transcript context above.',
                },
            ];

            console.log('🤖 Sending analysis request to AI...');

            const completion = await llmClient.chat(messages);

            const responseText = completion.content;

            // Write LLM input and output to analysis.txt
            try {
                const fs = require('fs');
                const path = require('path');
                const rootPath = path.resolve(__dirname, '../../../');
                const responsePath = path.join(rootPath, 'analysis.txt');
                const timestamp = new Date().toISOString();

                const llmMessages = messages
                    .map(msg => {
                        return `${msg.role.toUpperCase()}: ${msg.content}`;
                    })
                    .join('\n\n');

                const responseEntry = `[${timestamp}]
User prompt: (Analysis Request)
Mode: Meeting Copilot

What LLM got:
${llmMessages}

LLM Output:
${responseText}

`;
                fs.appendFileSync(responsePath, responseEntry);
            } catch (error) {
                console.error('[SummaryService] Failed to write analysis.txt:', error);
            }
            // console.log(`✅ Analysis response received: ${responseText}`);

            // Debug: Log the raw response for troubleshooting
            // console.log('🔍 Raw LLM response for parsing:', JSON.stringify(responseText));

            const structuredData = this.parseResponseText(responseText, this.previousAnalysisResult);

            if (this.currentSessionId) {
                try {
                    await summaryRepository.saveSummary({
                        sessionId: this.currentSessionId,
                        text: responseText,
                        tldr: structuredData.summary.join('\n'),
                        bullet_json: JSON.stringify([]), // Empty array for topic bullets
                        action_json: JSON.stringify(structuredData.actions),
                        // Server-side LLM migration: no client modelInfo available
                        model: 'server',
                    });
                } catch (err) {
                    console.error('[DB] Failed to save summary:', err);
                }
            }

            // Save analysis results
            this.previousAnalysisResult = structuredData;
            this.analysisHistory.push({
                timestamp: Date.now(),
                data: structuredData,
                conversationLength: conversationTexts.length,
            });

            if (this.analysisHistory.length > 10) {
                this.analysisHistory.shift();
            }

            return structuredData;
        } catch (error) {
            console.error('❌ Error during analysis generation:', error.message);
            return this.previousAnalysisResult; // Return previous result on error
        }
    }

    parseResponseText(responseText, previousResult) {
        const structuredData = {
            summary: [],
            actions: [],
            followUps: ['✉️ Draft a follow-up email', '✅ Generate action items', '📝 Show summary'],
        };

        // If there are previous results, use them as default values (however, new analysis takes priority)
        if (previousResult && structuredData.summary.length === 0) {
            structuredData.summary = [...previousResult.summary];
        }

        try {
            const lines = responseText.split('\n');
            let currentSection = '';

            console.log('🔍 Parsing response lines:', lines.length);

            for (const line of lines) {
                const trimmedLine = line.trim();

                // Debug log each line being processed
                if (trimmedLine) {
                    // console.log(`🔍 Processing line: "${trimmedLine}" | Section: ${currentSection}`);
                }

                // Exact heading detection to reduce ambiguity
                if (trimmedLine === '### Meeting Insights') {
                    currentSection = 'meeting-insights';
                    continue;
                } else if (trimmedLine === '### Questions Detected') {
                    currentSection = 'detected-questions';
                    continue;
                } else if (trimmedLine === '### Terms to Define') {
                    currentSection = 'define-candidates';
                    continue;
                }

                // Content parsing
                if (trimmedLine.startsWith('-') && currentSection === 'meeting-insights') {
                    const summaryPoint = trimmedLine.substring(1).trim();
                    if (summaryPoint && !structuredData.summary.includes(summaryPoint)) {
                        // Update existing summary (maintain maximum 5 items)
                        structuredData.summary.unshift(summaryPoint);
                        if (structuredData.summary.length > 5) {
                            structuredData.summary.pop();
                        }
                    }
                } else if (/^\d+\./.test(trimmedLine) && currentSection === 'detected-questions') {
                    const question = trimmedLine.replace(/^\d+\.\s*/, '').trim();
                    // Filter obvious placeholders
                    const isPlaceholder = !question || /no\s+questions\s+detected/i.test(question);
                    if (!isPlaceholder) {
                        structuredData.actions.push(`❓ ${question}`);
                        // Track question (case-insensitive dedupe)
                        const exists = Array.from(this.detectedQuestions).some(q => q.toLowerCase() === question.toLowerCase());
                        if (!exists) {
                            this.detectedQuestions.add(question);
                        }
                    }
                } else if (trimmedLine.startsWith('-') && currentSection === 'define-candidates') {
                    const term = trimmedLine.substring(1).trim().replace(/^"|"$/g, '');
                    // Filter invalid define terms: empty, sentences, placeholders
                    const looksLikeSentence = /\w[\w\s,'"-]{12,}\.$/i.test(term) || /\s{2,}/.test(term) || /\./.test(term);
                    const isPlaceholder = /too\s+short\s+to\s+detect/i.test(term) || /no\s+terms/i.test(term);
                    const isInvalid = !term || looksLikeSentence || isPlaceholder;
                    if (!isInvalid && !this.definedTerms.has(term.toLowerCase())) {
                        const defineItem = `📘 Define ${term}`;
                        if (!structuredData.actions.some(x => (x || '').toLowerCase() === defineItem.toLowerCase())) {
                            structuredData.actions.push(defineItem);
                            this.definedTerms.add(term.toLowerCase()); // Track this term as defined
                        }
                    }
                }
            }

            // Default actions are injected by UI; avoid duplication here

            // Limit action count
            structuredData.actions = structuredData.actions.slice(0, 10);

            // Validation check and merge with previous data
            if (structuredData.summary.length === 0 && previousResult) {
                structuredData.summary = previousResult.summary;
            }
        } catch (error) {
            console.error('❌ Error parsing response text:', error);
            // Return previous result on error
            return (
                previousResult || {
                    summary: [],
                    actions: ['✨ What should I say next?', '💬 Suggest follow-up questions'],
                    followUps: ['✉️ Draft a follow-up email', '✅ Generate action items', '📝 Show summary'],
                }
            );
        }

        return structuredData;
    }

    /**
     * Smart-trigger for analysis. When enabled (config.smartTrigger.enabled),
     * only triggers when new content since the last analysis is substantive
     * enough (by rough token/char thresholds) or a max wait count is reached.
     * Falls back to the original step-based rule when disabled.
     */
    async triggerAnalysisIfNeeded() {
        const recapStep = config.get('recapStep') || 15;
        const smartCfg = config.get('smartTrigger') || {};

        if (!this.conversationHistory.length) return;

        // Determine if we should analyze now
        let shouldAnalyze = false;

        if (smartCfg.enabled) {
            const sinceLast = this.conversationHistory.slice(this.lastAnalyzedIndex);
            const textSince = sinceLast.join(' ');

            const tokenCount = this._roughTokenCount(textSince);
            const charCount = textSince.length;
            const utteranceCount = sinceLast.length;

            const enoughContent = tokenCount >= (smartCfg.minTokenCount ?? 12) || charCount >= (smartCfg.minCharCount ?? 50);
            const maxWaitHit = utteranceCount >= (smartCfg.maxWaitUtterances ?? 5);

            shouldAnalyze = (enoughContent || maxWaitHit) && utteranceCount > 0;
        } else {
            // Original behavior: analyze every N utterances
            const analysisStep = config.get('analysisStep') || 5;
            shouldAnalyze = this.conversationHistory.length >= analysisStep && this.conversationHistory.length % analysisStep === 0;
        }

        if (!shouldAnalyze) return;

        console.log(`Triggering analysis - total texts: ${this.conversationHistory.length}`);

        // Only send NEW utterances since last analysis
        const newUtterances = this.conversationHistory.slice(this.lastAnalyzedIndex);
        console.log(`📝 Analyzing ${newUtterances.length} new utterances (from index ${this.lastAnalyzedIndex})`);

        const data = await this.makeOutlineAndRequests(newUtterances);
        if (data) {
            data.actions = Array.isArray(data.actions) ? data.actions : [];

            // Add recap button if conversation is long enough
            if (this.conversationHistory.length >= recapStep) {
                const recapItem = '🗒️ Recap meeting so far';
                if (!data.actions.some(x => (x || '').toLowerCase() === recapItem.toLowerCase())) {
                    data.actions.unshift(recapItem);
                }
            }

            console.log('Sending structured data to renderer');
            this.sendToRenderer('summary-update', data);

            // Update tracking - we've now analyzed up to the current conversation length
            this.lastAnalyzedIndex = this.conversationHistory.length;

            if (this.onAnalysisComplete) {
                this.onAnalysisComplete(data);
            }
        } else {
            console.log('No analysis data returned');
        }
    }

    // Rough approximation: ~4 chars per token
    _roughTokenCount(str) {
        if (!str) return 0;
        return Math.ceil(str.length / 4);
    }

    getCurrentAnalysisData() {
        return {
            previousResult: this.previousAnalysisResult,
            history: this.analysisHistory,
            conversationLength: this.conversationHistory.length,
            definedTerms: Array.from(this.definedTerms), // Include defined terms for debugging
        };
    }
}

const summaryService = new SummaryService();
module.exports = summaryService;
