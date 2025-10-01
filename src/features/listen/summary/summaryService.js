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
        this.mockMode = false; // New: Mock STT mode flag (enabled for testing)
        console.log('[SummaryService] Mock STT mode enabled by default for testing');
        this.mockDataMap = null; // Will load mock convo data

        // Phase 1: Analysis preset selection state
        this.selectedPresetId = null;
        this.selectedRoleText = '';
        this.customSystemPrompt = null; // New: For full custom system prompts

        // Callbacks
        this.onAnalysisComplete = null;
        this.onStatusUpdate = null;
        this.batchTimer = null; // For time fallback

        // Load mock convo data if needed (for mock STT)
        this.loadMockData();
    }

    loadMockData() {
        try {
            // Import mock convo data - assume new file exists
            const mockAnalysisData = require('../../common/mocks/mockAnalysisData');
            this.mockDataMap = mockAnalysisData.presetsToMock;
            console.log('[SummaryService] Mock STT convo data loaded:', Object.keys(this.mockDataMap));
        } catch (err) {
            console.warn('[SummaryService] Failed to load mock STT data:', err.message);
            this.mockDataMap = {};
        }
    }

    setMockMode(enabled) {
        this.mockMode = !!enabled;
        console.log(`[SummaryService] Mock STT mode ${enabled ? 'enabled' : 'disabled'}`);
        if (enabled && this.selectedPresetId) {
            // If preset already set, simulate now
            this.simulateMockAnalysis();
        }
    }

    // Update _mapPresetToProfile to ensure customer-support maps to customer_support_analysis
    _mapPresetToProfile(presetId) {
        switch (presetId) {
            case 'sales':
                return 'sales_analysis';
            case 'recruiting':
                return 'recruiting_analysis';
            case 'customer-support':
                return 'customer_support_analysis'; // Ensure this maps correctly
            case 'school':
                return 'school_analysis';
            default:
                return 'meeting_analysis';
        }
    }

    // Update _getPreviousContext to include customer_support_analysis
    _getPreviousContext(profile) {
        const prevDefines = Array.from(this.definedTerms).join(', ') || '(none)';
        const prevQuestions = Array.from(this.detectedQuestions).join(' | ') || '(none)';
        const mapping = {
            sales_analysis: `Previous Objections: ${prevQuestions}\nPrevious Opportunities: ${prevDefines}`,
            recruiting_analysis: `Previous Gaps: ${prevDefines}\nPrevious Strengths: ${prevQuestions}`,
            customer_support_analysis: `Previous Root Causes: ${prevDefines}\nPrevious Steps: ${prevQuestions}`, // Add this case
            school_analysis: `Previous Unclear Points: ${prevDefines}\nPrevious Concepts: ${prevQuestions}`,
            meeting_analysis: `Previously Defined Terms: ${prevDefines}\nPreviously Detected Questions: ${prevQuestions}`,
        };
        return mapping[profile] || `Previous Terms: ${prevDefines}\nPrevious Questions: ${prevQuestions}`;
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

            if (!presetId) {
                this.selectedRoleText = '';
                this.customSystemPrompt = null;
                this.analysisProfile = 'meeting_analysis'; // default
                return { success: false, error: 'preset_not_found' };
            }

            const settingsService = require('../../settings/settingsService');
            const presets = await settingsService.getPresets();
            const preset = Array.isArray(presets) ? presets.find(p => p && p.id === presetId) : null;

            if (!preset) {
                console.warn('[SummaryService] setAnalysisPreset: preset not found, clearing role');
                this.selectedRoleText = '';
                this.customSystemPrompt = null;
                return { success: false, error: 'preset_not_found' };
            }

            if (preset.is_default === 1) {
                // Default: Extract role and set profile
                const fullPrompt = preset.prompt + (preset.append_text || '');
                const roleText = this._extractRoleFromPrompt(fullPrompt);
                this.selectedRoleText = this._trimToWordLimit(roleText, 100);
                this.customSystemPrompt = null;
                this.analysisProfile = this._mapPresetToProfile(presetId);
                console.log(`[SummaryService] Set default preset: ${presetId} -> profile: ${this.analysisProfile}`);
            } else {
                // Custom: Use full concatenated prompt as system
                this.customSystemPrompt = preset.prompt + (preset.append_text || '');
                this.selectedRoleText = '';
                this.analysisProfile = null;
                console.log(`[SummaryService] Set custom preset: ${presetId}, full prompt length: ${this.customSystemPrompt.length}`);
            }

            if (this.mockMode) {
                console.log('[SummaryService] Mock STT mode active - simulating convo for preset:', presetId);
                this.simulateMockAnalysis();
            }

            return { success: true };
        } catch (err) {
            console.warn('[SummaryService] setAnalysisPreset error:', err.message);
            this.selectedRoleText = '';
            this.customSystemPrompt = null;
            return { success: false, error: err.message };
        }
    }

    simulateMockAnalysis() {
        if (!this.selectedPresetId || !this.mockDataMap) {
            console.warn('[SummaryService] Cannot simulate Mock STT: no preset or mock data');
            return;
        }

        let mockKey = this.selectedPresetId === 'meetings' ? 'meeting' : this.selectedPresetId;
        if (mockKey === 'customer-support') {
            mockKey = 'customer_support'; // Map to match mock data key
        }
        const mockData = this.mockDataMap[mockKey];
        if (!mockData || !mockData.conversation) {
            console.warn(`[SummaryService] No mock convo data for preset: ${mockKey}`);
            return;
        }

        console.log(`[SummaryService] Mock STT: Simulating conversation for ${mockKey}`);

        // Clear previous history for clean simulation
        this.conversationHistory = [];

        // Add all fake turns WITHOUT triggering (to avoid spam)
        const numTurns = mockData.conversation.length;
        for (let i = 0; i < numTurns; i++) {
            const speaker = i % 2 === 0 ? 'me' : 'them';
            const text = mockData.conversation[i];
            this.addConversationTurn(speaker, text); // Now skips trigger in mock
        }

        // Clear any timer to prevent fallback
        if (this.batchTimer) {
            clearTimeout(this.batchTimer);
            this.batchTimer = null;
        }

        console.log(`[SummaryService] Mock STT: Added ${numTurns} fake turns - now triggering SINGLE real analysis`);

        // Single trigger with full history
        this.triggerAnalysisIfNeeded(true);
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
        const trimmedText = text.trim();
        if (trimmedText.length < 5) {
            console.log(`[SummaryTrigger] Skipping short utterance for batching (${trimmedText.length} chars): ${speaker}: "${trimmedText}"`);
            return; // Skip very short utterances to reduce spam
        }

        const conversationText = `${speaker.toLowerCase()}: ${trimmedText}`;
        this.conversationHistory.push(conversationText);
        if (this.mockMode) {
            console.log(`[SummaryTrigger] Mock STT: Added to batch (${this.conversationHistory.length} total): ${speaker}: "${trimmedText}"`);
            // In mock STT mode, skip auto-trigger to avoid spamming - trigger once after full injection
            return;
        } else {
            console.log(`[SummaryTrigger] Added to batch (${this.conversationHistory.length} total in history): ${speaker}: "${trimmedText}"`);
        }

        // Start time fallback timer if first utterance
        if (this.conversationHistory.length === 1 && !this.batchTimer) {
            this.batchTimer = setTimeout(() => {
                console.log('[SummaryTrigger] Time fallback: Forcing analysis after 120s quiet');
                this.triggerAnalysisIfNeeded(true); // Force flag
            }, 120000); // 2 min
        }

        // Trigger analysis if needed (skipped in mock)
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
        if (this.batchTimer) {
            clearTimeout(this.batchTimer);
            this.batchTimer = null;
        }
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

        if (this.mockMode) {
            console.log('[SummaryService] Mock STT mode: Full fake convo injected - running single real LLM analysis');
            // Proceed to real flow
        }

        // Original real logic (always used now, even in mock STT)
        const recentConversation = this.formatConversationForPrompt(conversationTexts, maxTurns);

        // Build previous items for de-duplication guidance
        const prevDefines = Array.from(this.definedTerms);
        const prevQuestions = Array.from(this.detectedQuestions);

        let contextualPrompt = '';
        if (this.previousAnalysisResult && this.previousAnalysisResult.summary.length > 0) {
            const meaningfulSummary = this.previousAnalysisResult.summary.filter(s => s && !s.includes('No progress') && !s.includes('No specific'));
            if (meaningfulSummary.length > 0) {
                contextualPrompt = `
Previous Context: ${meaningfulSummary.slice(0, 2).join('; ')}`;
            }
        }

        const fullContext = this._getPreviousContext(this.analysisProfile || 'meeting_analysis') + `\n\nTranscript:\n${recentConversation}`;

        const baseSystem = getSystemPrompt(this.analysisProfile || 'meeting_analysis', {
            context: fullContext,
        });
        const rolePrefix = this.selectedRoleText && this.selectedRoleText.trim() ? `<role>${this.selectedRoleText.trim()}</role>\n\n` : '';
        const systemPrompt = this.customSystemPrompt ? this.customSystemPrompt : `${rolePrefix}${baseSystem}`;

        try {
            if (this.currentSessionId) {
                await sessionRepository.touch(this.currentSessionId);
            }

            const messages = [
                {
                    role: 'system',
                    content: systemPrompt,
                },
                {
                    role: 'user',
                    content:
                        'Analyze **ONLY** the conversation provided in the Transcript context above IN THE **LANGUAGE OF THE TRANSCRIPT**. If nothing is detected then DO NOT RETURN ANYTHING.',
                },
            ];

            console.log('🤖 Sending analysis request to AI...');

            const completion = await llmClient.chat(messages);

            const responseText = completion.content.trim();
            console.log('[SummaryService] Response starts with JSON?:', responseText.startsWith('{') ? 'Yes' : 'No (likely markdown)');

            // Write LLM input and output to analysis.txt (real output for testing prompts)
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
Mode: Mock STT + Real LLM
Profile: ${this.analysisProfile}

What LLM got:
${llmMessages}

LLM Output:
${responseText}

`;
                fs.appendFileSync(responsePath, responseEntry);
            } catch (error) {
                console.error('[SummaryService] Failed to write analysis.txt:', error);
            }

            const structuredData = this.parseResponseText(responseText, this.previousAnalysisResult);

            if (this.currentSessionId) {
                try {
                    await summaryRepository.saveSummary({
                        sessionId: this.currentSessionId,
                        text: responseText,
                        tldr: structuredData.summary.join('\n'),
                        bullet_json: JSON.stringify([]), // Empty array for topic bullets
                        action_json: JSON.stringify(structuredData.actions),
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
        const defaultFollowUps = ['✉️ Draft a follow-up email', '✅ Generate action items', '📝 Show summary'];
        const structuredData = {
            summary: [],
            actions: [],
            followUps: [],
            rawLLMOutput: null,
        };
        const addFollowUp = value => {
            if (!value) return;
            const cleaned = value.trim();
            if (!cleaned) return;
            structuredData.followUps.push(cleaned);
        };

        // If there are previous results, use them as default values (however, new analysis takes priority)
        if (previousResult && structuredData.summary.length === 0) {
            structuredData.summary = [...previousResult.summary];
        }

        if (!responseText || typeof responseText !== 'string') {
            console.log('[SummaryService] No response text to parse');
            return structuredData;
        }

        const trimmedResponse = responseText.trim();

        // First, try JSON parsing (handle code block wrappers)
        let jsonData = null;
        let jsonString = trimmedResponse;

        // Extract JSON from common markdown code block wrappers
        const jsonMatch = trimmedResponse.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/i);
        if (jsonMatch) {
            jsonString = jsonMatch[1].trim();
            console.log('[SummaryService] Extracted JSON from code block');
        } else if (trimmedResponse.startsWith('```') && trimmedResponse.endsWith('```')) {
            // Fallback: strip outer ```
            jsonString = trimmedResponse.slice(3, -3).trim();
            console.log('[SummaryService] Stripped ``` wrappers for JSON');
        }

        try {
            jsonData = JSON.parse(jsonString);
            if (jsonData && jsonData.sections && Array.isArray(jsonData.sections)) {
                console.log('[SummaryService] JSON parsed successfully, sections:', jsonData.sections.length);

                // Map JSON sections to structuredData (rest unchanged)
                jsonData.sections.forEach(section => {
                    if ((section.type === 'insights' || section.type === 'opportunities') && Array.isArray(section.items)) {
                        section.items.forEach(item => {
                            const summaryPoint = item
                                .trim()
                                .replace(/^-?\s*/, '')
                                .replace(/^"|"$/g, '')
                                .replace(/"([^"]+)"/g, '$1'); // Strip quotes
                            if (summaryPoint) {
                                structuredData.summary.unshift(summaryPoint);
                                if (structuredData.summary.length > 5) {
                                    structuredData.summary.pop();
                                }
                            }
                        });
                    } else if (section.type === 'questions' && Array.isArray(section.items)) {
                        section.items.forEach(item => {
                            const question = item
                                .trim()
                                .replace(/^-?\s*/, '')
                                .replace(/^"|"$/g, '')
                                .replace(/"([^"]+)"/g, '$1'); // Strip quotes
                            const prefixed = `❓ ${question}`;
                            structuredData.actions.push(prefixed);
                        });
                    } else if (section.type === 'follow_ups' && Array.isArray(section.items)) {
                        section.items.forEach(item => {
                            const followup = item
                                .trim()
                                .replace(/^-?\s*/, '')
                                .replace(/^"|"$/g, '')
                                .replace(/"([^"]+)"/g, '$1');
                            if (followup) {
                                const prefixed = `📈 Sales Follow-Up: ${followup}`;
                                structuredData.actions.push(prefixed);
                            }
                        });
                    } else if (section.type === 'buyer_questions' && Array.isArray(section.items)) {
                        section.items.forEach(item => {
                            const buyerQ = item
                                .trim()
                                .replace(/^-?\s*/, '')
                                .replace(/^"|"$/g, '')
                                .replace(/"([^"]+)"/g, '$1');
                            if (buyerQ) {
                                const prefixed = `❓ ${buyerQ}`;
                                structuredData.actions.push(prefixed);
                            }
                        });
                    } else if (section.type === 'defines' && Array.isArray(section.items)) {
                        section.items.forEach(item => {
                            const term = item
                                .trim()
                                .replace(/^-?\s*/, '')
                                .replace(/^"|"$/g, '')
                                .replace(/"([^"]+)"/g, '$1');
                            let coreTerm = term.split('(')[0].split(':')[0].trim();
                            coreTerm = coreTerm.replace(/[.,;:!?]+$/, '');
                            if (!coreTerm || coreTerm.length < 2) coreTerm = term;
                            const prefixed = `📘 Define ${coreTerm}`;
                            structuredData.actions.push(prefixed);
                        });
                    } else if (section.type === 'objections' && Array.isArray(section.items)) {
                        section.items.forEach(item => {
                            const objection = item
                                .trim()
                                .replace(/^-?\s*/, '')
                                .replace(/^"|"$/g, '')
                                .replace(/"([^"]+)"/g, '$1');
                            if (objection) {
                                const prefixed = `❗❗ Objection: ${objection}`;
                                structuredData.actions.push(prefixed);
                            }
                        });
                    } else if (section.type === 'strengths' && Array.isArray(section.items)) {
                        section.items.forEach(item => {
                            const strength = item
                                .trim()
                                .replace(/^-?\s*/, '')
                                .replace(/^"|"$/g, '')
                                .replace(/"([^"]+)"/g, '$1');
                            if (strength) {
                                structuredData.summary.unshift(strength);
                                if (structuredData.summary.length > 5) structuredData.summary.pop();
                            }
                        });
                    } else if (section.type === 'gaps' && Array.isArray(section.items)) {
                        section.items.forEach(item => {
                            const gap = item
                                .trim()
                                .replace(/^-?\s*/, '')
                                .replace(/^"|"$/g, '')
                                .replace(/"([^"]+)"/g, '$1');
                            if (gap) {
                                const prefixed = `❗❗Gap: ${gap}`;
                                structuredData.actions.push(prefixed);
                            }
                        });
                    } else if (section.type === 'suggested_questions' && Array.isArray(section.items)) {
                        section.items.forEach(item => {
                            const question = item
                                .trim()
                                .replace(/^-?\s*/, '')
                                .replace(/^"|"$/g, '')
                                .replace(/"([^"]+)"/g, '$1');
                            if (question) {
                                const prefixed = `👆 Suggested Question: ${question}`;
                                structuredData.actions.push(prefixed);
                            }
                        });
                    } else if (section.type === 'issue_summary' && Array.isArray(section.items)) {
                        section.items.forEach(item => {
                            const summaryPoint = item
                                .trim()
                                .replace(/^-?\s*/, '')
                                .replace(/^"|"$/g, '')
                                .replace(/"([^"]+)"/g, '$1');
                            if (summaryPoint) {
                                structuredData.summary.unshift(summaryPoint);
                                if (structuredData.summary.length > 5) structuredData.summary.pop();
                            }
                        });
                    } else if (section.type === 'root_causes' && Array.isArray(section.items)) {
                        section.items.forEach(item => {
                            const cause = item
                                .trim()
                                .replace(/^-?\s*/, '')
                                .replace(/^"|"$/g, '')
                                .replace(/"([^"]+)"/g, '$1');
                            if (cause) {
                                const prefixed = `🔎 Root Cause: ${cause}`;
                                structuredData.actions.push(prefixed);
                            }
                        });
                    } else if (section.type === 'troubleshooting' && Array.isArray(section.items)) {
                        section.items.forEach(item => {
                            const step = item
                                .trim()
                                .replace(/^-?\s*/, '')
                                .replace(/^"|"$/g, '')
                                .replace(/"([^"]+)"/g, '$1');
                            if (step) {
                                const prefixed = `🔍 Troubleshooting Step: ${step}`;
                                structuredData.actions.push(prefixed);
                            }
                        });
                    } else if (section.type === 'key_concepts' && Array.isArray(section.items)) {
                        section.items.forEach(item => {
                            const concept = item
                                .trim()
                                .replace(/^-?\s*/, '')
                                .replace(/^"|"$/g, '')
                                .replace(/"([^"]+)"/g, '$1');
                            if (concept) {
                                structuredData.summary.unshift(concept);
                                if (structuredData.summary.length > 5) structuredData.summary.pop();
                            }
                        });
                    } else if (section.type === 'unclear_points' && Array.isArray(section.items)) {
                        section.items.forEach(item => {
                            const unclear = item
                                .trim()
                                .replace(/^-?\s*/, '')
                                .replace(/^"|"$/g, '')
                                .replace(/"([^"]+)"/g, '$1');
                            if (unclear) {
                                const prefixed = `❓ Clarify: ${unclear}`;
                                structuredData.actions.push(prefixed);
                            }
                        });
                    } else if (section.type === 'study_questions' && Array.isArray(section.items)) {
                        section.items.forEach(item => {
                            const question = item
                                .trim()
                                .replace(/^-?\s*/, '')
                                .replace(/^"|"$/g, '')
                                .replace(/"([^"]+)"/g, '$1');
                            if (question) {
                                const prefixed = `📚 Study Question: ${question}`;
                                structuredData.actions.push(prefixed);
                            }
                        });
                    }
                });

                // Removed uniqueActions deduplication - keep all
                // structuredData.actions = uniqueActions;

                // Merge with previous if needed
                if (structuredData.summary.length === 0 && previousResult) {
                    structuredData.summary = previousResult.summary;
                }

                structuredData.rawLLMOutput = jsonData;
                defaultFollowUps.forEach(addFollowUp);

                return structuredData;
            }
        } catch (jsonError) {
            console.error('[SummaryService] JSON parsing failed:', jsonError.message);
            console.warn('[SummaryService] LLM did not return expected JSON. Check prompts/conversation input.');
            // Safe fallback: Previous data + defaults
            if (previousResult) {
                return {
                    ...previousResult,
                    followUps: [...(previousResult.followUps || []), ...defaultFollowUps],
                };
            }
            return {
                summary: [],
                actions: ['✨ What should I say next?', '💬 Suggest follow-up questions'],
                followUps: defaultFollowUps,
            };
        }

        defaultFollowUps.forEach(addFollowUp);
        return structuredData;
    }

    /**
     * Smart-trigger for analysis. When enabled (config.smartTrigger.enabled),
     * only triggers when new content since the last analysis is substantive
     * enough (by rough token/char thresholds) or a max wait count is reached.
     * Falls back to the original step-based rule when disabled.
     */
    async triggerAnalysisIfNeeded(force = false) {
        // Clear timer on activity
        if (this.batchTimer) {
            clearTimeout(this.batchTimer);
            this.batchTimer = null;
            if (this.mockMode) {
                console.log('[SummaryTrigger] Mock STT: Cleared fallback timer');
            } else {
                console.log('[SummaryTrigger] Timer cleared - activity detected');
            }
        }

        const recapStep = config.get('recapStep') || 15;
        const smartCfg = config.get('smartTrigger') || {};

        if (!this.conversationHistory.length) {
            console.log(`[SummaryTrigger] No history yet - skipping trigger`);
            return;
        }

        // In mock STT + force, always analyze full history once
        let shouldAnalyze = false;
        if (this.mockMode && force) {
            shouldAnalyze = true;
            console.log('[SummaryTrigger] Mock STT force: Analyzing full fake history once');
        } else if (smartCfg.enabled) {
            const sinceLast = this.conversationHistory.slice(this.lastAnalyzedIndex);
            const textSince = sinceLast.join(' ');

            const tokenCount = this._roughTokenCount(textSince);
            const charCount = textSince.length;
            const utteranceCount = sinceLast.length;

            console.log(
                `[SummaryTrigger] Batch check: ${utteranceCount} new utterances, ${charCount} chars, ~${tokenCount} tokens (last analyzed: ${this.lastAnalyzedIndex})`
            );

            // Min batch size: Only consider if at least 3 utterances for meaningful batch
            if (utteranceCount < 3) {
                console.log(`[SummaryTrigger] Batch too small (<3 utterances) - waiting`);
                return; // Too small batch, wait for more
            }

            const enoughContent = tokenCount >= (smartCfg.minTokenCount ?? 12) || charCount >= (smartCfg.minCharCount ?? 50);
            const maxWaitHit = utteranceCount >= (smartCfg.maxWaitUtterances ?? 5);

            console.log(
                `[SummaryTrigger] Content check: enough=${enoughContent} (thresholds: ${charCount}>=${smartCfg.minCharCount}, ${tokenCount}>=${smartCfg.minTokenCount}), maxWait=${maxWaitHit} (${utteranceCount}>=${smartCfg.maxWaitUtterances})`
            );

            shouldAnalyze = (enoughContent || maxWaitHit) && utteranceCount > 0;
        } else {
            // Original behavior: analyze every N utterances
            const analysisStep = config.get('analysisStep') || 5;
            shouldAnalyze = this.conversationHistory.length >= analysisStep && this.conversationHistory.length % analysisStep === 0;
            console.log(
                `[SummaryTrigger] Fallback step: shouldAnalyze=${shouldAnalyze} (total: ${this.conversationHistory.length}, step: ${analysisStep})`
            );
        }

        if (!shouldAnalyze && !force) {
            console.log(`[SummaryTrigger] Not triggering - batch not ready`);
            return;
        }

        if (force && !this.mockMode) {
            console.log('[SummaryTrigger] Force trigger from time fallback');
        }

        console.log(
            `[SummaryTrigger] TRIGGERING ANALYSIS! Total history: ${this.conversationHistory.length}, new batch: ${this.conversationHistory.slice(this.lastAnalyzedIndex).length} utterances`
        );

        // For mock STT, use FULL history for single comprehensive analysis
        let textsToAnalyze;
        if (this.mockMode) {
            textsToAnalyze = this.conversationHistory.slice(0); // Full fake convo
            console.log(`[SummaryTrigger] Mock STT: Analyzing full ${textsToAnalyze.length} turns with real LLM`);
        } else {
            // Original: Only new since last
            textsToAnalyze = this.conversationHistory.slice(this.lastAnalyzedIndex);
            console.log(`📝 Analyzing ${textsToAnalyze.length} new utterances (from index ${this.lastAnalyzedIndex})`);
        }

        const data = await this.makeOutlineAndRequests(textsToAnalyze);
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
            this.sendToRenderer('summary-update', { ...data, presetId: this.selectedPresetId });

            // Update tracking
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
