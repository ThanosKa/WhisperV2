const llmClient = require('../../common/ai/llmClient');
const sessionRepository = require('../../common/repositories/session');
const summaryRepository = require('./repositories');
const config = require('../../common/config/config');
const fs = require('fs');
const path = require('path');

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
        this.mockMode = true; // New: Mock STT mode flag (enabled for testing)
        console.log('[SummaryService] Mock STT mode enabled by default for testing');
        this.mockDataMap = null; // Will load mock convo data
        this.analysisRound = 0; // Track analysis rounds for debugging

        // Phase 1: Analysis preset selection state
        this.selectedPresetId = null;
        this.selectedRoleText = '';
        this.customSystemPrompt = null; // New: For full custom system prompts

        // Callbacks
        this.onAnalysisComplete = null;
        this.onStatusUpdate = null;
        this.batchTimer = null; // For time fallback

        // Insights repository for crash recovery
        this.insightsRepo = require('./repositories');

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

    /**
     * Write debug log to response.txt file
     * @param {string} message - Log message to append
     */
    writeDebugLog(message) {
        try {
            const logPath = path.join(process.cwd(), 'response.txt');
            const timestamp = new Date().toISOString();
            const logEntry = `[${timestamp}] ${message}\n`;
            fs.appendFileSync(logPath, logEntry);
        } catch (err) {
            console.warn('[SummaryService] Failed to write debug log:', err.message);
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

    /**
     * Generate context string for previous terms and questions based on analysis type
     * @param {string} profile - The analysis profile (e.g., 'sales_analysis', 'meeting_analysis')
     * @returns {string} - Context string with appropriate labels for the analysis type
     */
    _getPreviousContext(profile) {
        const prevDefines = Array.from(this.definedTerms).join(', ') || '(none)';
        const prevQuestions = Array.from(this.detectedQuestions).join(' | ') || '(none)';

        // Generic mapping for different analysis types
        const contextMapping = {
            // Sales context - objections are "questions", opportunities are "terms"
            sales_analysis: {
                termsLabel: 'Previous Opportunities',
                questionsLabel: 'Previous Objections',
            },
            // Recruiting context - gaps are "terms", strengths are "questions"
            recruiting_analysis: {
                termsLabel: 'Previous Gaps',
                questionsLabel: 'Previous Strengths',
            },
            // Customer support context - root causes are "terms", troubleshooting steps are "questions"
            customer_support_analysis: {
                termsLabel: 'Previous Root Causes',
                questionsLabel: 'Previous Steps',
            },
            // School context - unclear points are "terms", concepts are "questions"
            school_analysis: {
                termsLabel: 'Previous Unclear Points',
                questionsLabel: 'Previous Concepts',
            },
            // Meeting context - standard terms and questions
            meeting_analysis: {
                termsLabel: 'Previously Defined Terms',
                questionsLabel: 'Previously Detected Questions',
            },
        };

        const contextConfig = contextMapping[profile];
        if (contextConfig) {
            return `${contextConfig.termsLabel}: ${prevDefines}\n${contextConfig.questionsLabel}: ${prevQuestions}`;
        }

        // Fallback for unknown analysis types
        return `Previous Terms: ${prevDefines}\nPrevious Questions: ${prevQuestions}`;
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

    hydrateConversation(transcripts) {
        if (!Array.isArray(transcripts)) return;

        console.log(`[SummaryService] Hydrating ${transcripts.length} transcripts WITHOUT triggering analysis`);

        // Reset state
        this.conversationHistory = [];
        this.lastAnalyzedIndex = 0;

        // Populate history without calling addConversationTurn (which triggers analysis)
        transcripts.forEach(t => {
            const conversationText = `${t.speaker.toLowerCase()}: ${t.text.trim()}`;
            this.conversationHistory.push(conversationText);
        });

        // Update lastAnalyzedIndex to prevent immediate re-analysis
        this.lastAnalyzedIndex = this.conversationHistory.length;

        console.log(`[SummaryService] Hydrated ${this.conversationHistory.length} turns, lastAnalyzedIndex=${this.lastAnalyzedIndex}`);
    }

    hydrateInsights(insightPayload) {
        if (!insightPayload) return;

        console.log('[SummaryService] Hydrating insights from persisted data');

        // Restore previousAnalysisResult so context continuity works
        this.previousAnalysisResult = insightPayload;

        // Add to history for audit trail
        this.analysisHistory.push(insightPayload);

        console.log(
            `[SummaryService] Restored ${insightPayload.summary?.length || 0} summary points, ${insightPayload.actions?.length || 0} actions`
        );
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

        console.log(`[SummaryService] Mock STT: Simulating conversation for ${mockKey} with batch processing`);

        // Clear previous history for clean simulation
        this.conversationHistory = [];

        // Inject turns gradually with realistic delays to simulate batching
        const numTurns = mockData.conversation.length;
        let turnIndex = 0;

        const injectNextTurn = () => {
            if (turnIndex >= numTurns) {
                console.log(`[SummaryService] Mock STT: All ${numTurns} turns injected - simulation complete`);
                return;
            }

            const speaker = turnIndex % 2 === 0 ? 'me' : 'them';
            const text = mockData.conversation[turnIndex];
            turnIndex++;

            console.log(`[SummaryService] Mock STT: Injecting turn ${turnIndex}/${numTurns}`);
            this.addConversationTurn(speaker, text); // Now allows batching triggers in mock mode

            // Also save mock transcripts to database like real STT
            if (this.currentSessionId) {
                try {
                    const sttRepository = require('../stt/repositories');
                    sttRepository.addTranscript({
                        sessionId: this.currentSessionId,
                        speaker: speaker,
                        text: text.trim(),
                    });
                    console.log(`[SummaryService] Mock STT: Saved transcript to DB for session ${this.currentSessionId}`);
                } catch (err) {
                    console.warn('[SummaryService] Mock STT: Failed to save transcript to DB:', err.message);
                }
            }

            // Schedule next turn with realistic delay (1-3 seconds between turns)
            const delay = Math.random() * 2000 + 1000; // 1-3 seconds
            setTimeout(injectNextTurn, delay);
        };

        // Start the simulation
        injectNextTurn();
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
        console.log(
            `[SummaryTrigger] ${this.mockMode ? 'Mock STT:' : ''} Added to batch (${this.conversationHistory.length} total${this.mockMode ? ' (mock)' : ' in history'}): ${speaker}: "${trimmedText}"`
        );

        // Start time fallback timer if first utterance
        if (this.conversationHistory.length === 1 && !this.batchTimer) {
            this.batchTimer = setTimeout(() => {
                console.log('[SummaryTrigger] Time fallback: Forcing analysis after 120s quiet');
                this.triggerAnalysisIfNeeded(true); // Force flag
            }, 120000); // 2 min
        }

        // SEPARATE: Show UI actions after FIRST utterance (no LLM call)
        if (this.conversationHistory.length === 1) {
            this.triggerInitialUIState();
        }

        // Trigger analysis if needed (skipped in mock)
        this.triggerAnalysisIfNeeded();
    }

    /**
     * Trigger initial UI state after first utterance - shows default actions WITHOUT LLM call
     */
    triggerInitialUIState() {
        console.log('[SummaryTrigger] FIRST UTTERANCE: Showing initial UI actions (no LLM call)');

        // Create initial state with default actions only
        const initialData = {
            summary: [], // Empty - will show "No insights yet"
            actions: [], // Empty initially - SummaryView will add defaults when hasReceivedFirstText=true
            followUps: [],
            presetId: this.selectedPresetId,
        };

        // Send to UI to trigger display of default actions
        this.sendToRenderer('summary-update', initialData);
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

        // SIMPLE DEBUG: Log round start
        this.analysisRound++;
        const prevActions = this.previousAnalysisResult?.actions?.length || 0;
        const prevTerms = this.definedTerms.size;
        const prevQuestionsCount = this.detectedQuestions.size;
        const totalSending = prevActions + prevTerms + prevQuestionsCount;
        const roundLog = `=== ROUND ${this.analysisRound} ===
PREV ROUND ACTIONS: ${prevActions} | TOTAL SENDING TO LLM: ${totalSending} (actions:${prevActions} + terms:${prevTerms} + questions:${prevQuestionsCount})`;

        console.log(`[SummaryService] ${roundLog.replace(/\n/g, ' | ')}`);
        this.writeDebugLog(roundLog);

        // Accumulate ALL actions from analysis history (all previous rounds combined)
        const allPreviousItems = [];
        this.analysisHistory.forEach(historyEntry => {
            if (historyEntry.data && historyEntry.data.actions) {
                allPreviousItems.push(...historyEntry.data.actions);
            }
        });

        // SIMPLE DEBUG: Log what we're actually sending to LLM
        const sendLog = `SENDING TO LLM (${allPreviousItems.length} items):\n${allPreviousItems.map((item, i) => `  ${i + 1}. ${item}`).join('\n')}`;
        console.log(`[SummaryService] ${sendLog.replace(/\n/g, ' | ')}`);
        this.writeDebugLog(sendLog);

        const contextData = {
            previousItems: allPreviousItems,
            transcript: recentConversation,
        };

        // Build new payload format for server-side prompt construction
        const profileToUse = this.analysisProfile || 'meeting_analysis';

        try {
            if (this.currentSessionId) {
                await sessionRepository.touch(this.currentSessionId);
            }

            // Build payload with role from database
            const payload = {
                profile: profileToUse,
                role: this.selectedRoleText || '',
                userContent: '', // Empty userContent for server-side prompt construction
                context: contextData, // Contains transcript and previousItems
            };

            console.log(`[SummaryService] 📋 Sending payload with profile '${profileToUse}' and role length: ${payload.role.length}`);

            console.log('🤖 Sending analysis request to AI...');

            const completion = await llmClient.chat(payload);

            const responseText = completion.content.trim();
            // console.log('[SummaryService] Response starts with JSON?:', responseText.startsWith('{') ? 'Yes' : 'No (likely markdown)');

            const structuredData = this.parseResponseText(responseText, this.previousAnalysisResult);

            // SIMPLE DEBUG: Log what LLM created this round
            const newActions = structuredData.actions?.length || 0;
            const responseLog = `LLM CREATED: ${newActions} actions`;
            console.log(`[SummaryService] ${responseLog}`);
            this.writeDebugLog(responseLog);

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

            // SIMPLE DEBUG: Log round end
            const saveLog = `=== END ROUND ${this.analysisRound} ===`;
            console.log(`[SummaryService] ${saveLog}`);
            this.writeDebugLog(saveLog);
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
                    } else if (section.type === 'searches' && Array.isArray(section.items)) {
                        section.items.forEach(item => {
                            const searchItem = item
                                .trim()
                                .replace(/^-?\s*/, '')
                                .replace(/^SEARCH:\s*/i, '')
                                .replace(/^"|"$/g, '')
                                .replace(/"([^"]+)"/g, '$1');
                            if (searchItem) {
                                const prefixed = `🌐 Search: ${searchItem}`;
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

        // Check if we should analyze based on smart triggers or force flag
        let shouldAnalyze = false;
        if (force) {
            shouldAnalyze = true;
            console.log(`[SummaryTrigger] Force trigger ${this.mockMode ? '(mock mode)' : ''}`);
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

        // Analyze only new utterances since last analysis (works for both real and mock STT)
        const textsToAnalyze = this.conversationHistory.slice(this.lastAnalyzedIndex);
        console.log(`📝 Analyzing ${textsToAnalyze.length} new utterances (from index ${this.lastAnalyzedIndex})${this.mockMode ? ' [MOCK]' : ''}`);

        // FIX: Update lastAnalyzedIndex BEFORE async call so concurrent triggers see updated index
        // This prevents duplicate analysis and ensures previousAnalysisResult state is available
        this.lastAnalyzedIndex = this.conversationHistory.length;
        console.log(`[SummaryTrigger] ✅ Updated lastAnalyzedIndex to ${this.lastAnalyzedIndex} to mark these utterances as analyzed`);

        const data = await this.makeOutlineAndRequests(textsToAnalyze);
        if (data) {
            data.actions = Array.isArray(data.actions) ? data.actions : [];

            // Persist insights to SQLite
            if (this.currentSessionId) {
                try {
                    this.insightsRepo.saveInsight({
                        sessionId: this.currentSessionId,
                        analysisRound: this.analysisRound,
                        payload: {
                            summary: data.summary || [],
                            actions: data.actions,
                            followUps: data.followUps || [],
                            sections: data.sections || [],
                        },
                    });
                    console.log(`[SummaryService] Persisted insights round ${this.analysisRound} for session ${this.currentSessionId}`);
                } catch (err) {
                    console.error('[SummaryService] Failed to persist insights:', err);
                }
            }

            // Add recap button if conversation is long enough
            if (this.conversationHistory.length >= recapStep) {
                const recapItem = '🗒️ Recap meeting so far';
                if (!data.actions.some(x => (x || '').toLowerCase() === recapItem.toLowerCase())) {
                    data.actions.unshift(recapItem);
                }
            }

            console.log('Sending structured data to renderer');
            this.sendToRenderer('summary-update', { ...data, presetId: this.selectedPresetId });

            if (this.onAnalysisComplete) {
                this.onAnalysisComplete(data);
            }
        } else {
            console.log('No analysis data returned');
        }
    }

    // Rough approximation: ~4 chars per token
    /**
     * Populate definedTerms and detectedQuestions Sets from LLM response actions
     * Handles different action types based on analysis profile
     * @param {Object} structuredData - The parsed LLM response data
     */
    _populateContextFromLLMResponse(structuredData) {
        if (!structuredData || !Array.isArray(structuredData.actions)) {
            return;
        }

        structuredData.actions.forEach(action => {
            if (!action || typeof action !== 'string') return;

            const actionStr = action.trim();

            // Define term patterns (these go into definedTerms Set)
            const termPatterns = [
                { prefix: '📘 Define ', type: 'define' },
                { prefix: '❗❗ Objection: ', type: 'objection' },
                { prefix: '❗❗Gap: ', type: 'gap' },
                { prefix: '🔎 Root Cause: ', type: 'root_cause' },
                { prefix: '❓ Clarify: ', type: 'clarify' },
            ];

            // Question patterns (these go into detectedQuestions Set)
            const questionPatterns = [
                { prefix: '❓ ', type: 'question' },
                { prefix: '👆 Suggested Question: ', type: 'suggested_question' },
                { prefix: '📚 Study Question: ', type: 'study_question' },
                { prefix: '🔍 Troubleshooting Step: ', type: 'troubleshooting' },
                { prefix: '🌐 Search: ', type: 'search' },
            ];

            // Check for term patterns first
            let termAdded = false;
            for (const pattern of termPatterns) {
                if (actionStr.startsWith(pattern.prefix)) {
                    const content = actionStr.substring(pattern.prefix.length).trim();
                    if (content && content.length > 1) {
                        this.definedTerms.add(content);
                        // console.log(`[SummaryService] Added ${pattern.type}: "${content}"`);
                        termAdded = true;
                        break;
                    }
                }
            }

            // Check for question patterns if not a term
            if (!termAdded) {
                for (const pattern of questionPatterns) {
                    if (actionStr.startsWith(pattern.prefix)) {
                        const content = actionStr.substring(pattern.prefix.length).trim();
                        if (content && content.length > 3) {
                            this.detectedQuestions.add(content);
                            // console.log(`[SummaryService] Added ${pattern.type}: "${content}"`);
                            break;
                        }
                    }
                }
            }
        });

        // console.log(`[SummaryService] Context updated - Terms: ${this.definedTerms.size}, Questions: ${this.detectedQuestions.size}`);
    }

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
            detectedQuestions: Array.from(this.detectedQuestions), // Include detected questions for debugging
        };
    }

    /**
     * Get current context for external services (like ask service)
     * @returns {Object} - Context object with terms and questions
     */
    getCurrentContext() {
        return {
            definedTerms: Array.from(this.definedTerms),
            detectedQuestions: Array.from(this.detectedQuestions),
            analysisProfile: this.analysisProfile,
            selectedPresetId: this.selectedPresetId,
        };
    }

    /**
     * Get formatted previous context string for a specific analysis profile
     * @param {string} profile - The analysis profile (optional, uses current if not provided)
     * @returns {string} - Formatted context string (XML for analysis profiles, text for others)
     */
    getFormattedPreviousContext(profile = null) {
        const targetProfile = profile || this.analysisProfile;

        // For analysis profiles, return all actual LLM items in XML
        if (targetProfile && targetProfile.endsWith('_analysis')) {
            const allPreviousItems = [];
            if (this.previousAnalysisResult && this.previousAnalysisResult.actions) {
                allPreviousItems.push(...this.previousAnalysisResult.actions);
            }
            Array.from(this.definedTerms).forEach(term => allPreviousItems.push(`📘 Define ${term}`));
            Array.from(this.detectedQuestions).forEach(question => allPreviousItems.push(`❓ ${question}`));

            const previousXML =
                allPreviousItems.length > 0 ? `<previous>\n${allPreviousItems.join('\n')}\n</previous>` : '<previous>\n(none)\n</previous>';

            return previousXML;
        }

        // Fallback to old text format for non-analysis profiles
        return this._getPreviousContext(targetProfile);
    }
}

const summaryService = new SummaryService();
module.exports = summaryService;
