const { createLLM } = require('../../common/ai/factory');
const sessionRepository = require('../../common/repositories/session');
const summaryRepository = require('./repositories');
const modelStateService = require('../../common/services/modelStateService');
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

        // Only include previous context if we have meaningful insights (not just default actions)
        let contextualPrompt = '';
        if (this.previousAnalysisResult && this.previousAnalysisResult.summary.length > 0) {
            const meaningfulSummary = this.previousAnalysisResult.summary.filter(s => s && !s.includes('No progress') && !s.includes('No specific'));

            if (meaningfulSummary.length > 0) {
                contextualPrompt = `
Previous Context: ${meaningfulSummary.slice(0, 2).join('; ')}

Build upon this context while analyzing the new conversation.
`;
            }
        }

        // Combine contextual prompt with recent conversation for the template
        const fullContext = contextualPrompt ? `${contextualPrompt}\n\n${recentConversation}` : recentConversation;

        // Use meeting analysis prompt template
        const systemPrompt = getSystemPrompt('meeting_analysis', {
            context: fullContext,
            existing_definitions: Array.from(this.definedTerms).join(', ') || 'None',
        });

        try {
            if (this.currentSessionId) {
                await sessionRepository.touch(this.currentSessionId);
            }

            const modelInfo = await modelStateService.getCurrentModelInfo('llm');
            if (!modelInfo || !modelInfo.apiKey) {
                throw new Error('AI model or API key is not configured.');
            }
            // console.log(`🤖 Sending analysis request to ${modelInfo.provider} using model ${modelInfo.model}`);

            const messages = [
                {
                    role: 'system',
                    content: systemPrompt,
                },
                {
                    role: 'user',
                    content: contextualPrompt || 'Analyze the conversation provided in the context above.',
                },
            ];

            console.log('🤖 Sending analysis request to AI...');

            const llm = createLLM(modelInfo.provider, {
                apiKey: modelInfo.apiKey,
                model: modelInfo.model,
                temperature: 0.7,
                maxTokens: 1024,
                usePortkey: modelInfo.provider === 'openai-glass',
                portkeyVirtualKey: modelInfo.provider === 'openai-glass' ? modelInfo.apiKey : undefined,
            });

            const completion = await llm.chat(messages);

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
                    summaryRepository.saveSummary({
                        sessionId: this.currentSessionId,
                        text: responseText,
                        tldr: structuredData.summary.join('\n'),
                        bullet_json: JSON.stringify([]), // Empty array for topic bullets
                        action_json: JSON.stringify(structuredData.actions),
                        model: modelInfo.model,
                    });
                } catch (err) {
                    console.error('[DB] Failed to save summary:', err);
                }
            }

            // 분석 결과 저장
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
            return this.previousAnalysisResult; // 에러 시 이전 결과 반환
        }
    }

    parseResponseText(responseText, previousResult) {
        const structuredData = {
            summary: [],
            actions: [],
            followUps: ['✉️ Draft a follow-up email', '✅ Generate action items', '📝 Show summary'],
        };

        // 이전 결과가 있으면 기본값으로 사용 (단, 새로운 분석이 우선)
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

                // 섹션 헤더 감지 - Updated to match the new prompt format
                if (
                    trimmedLine.startsWith('**Meeting Insights**') ||
                    trimmedLine.includes('Meeting Insights') ||
                    trimmedLine.startsWith('**Meeting Recap**') ||
                    trimmedLine.includes('Meeting Recap')
                ) {
                    currentSection = 'meeting-insights';
                    continue;
                } else if (
                    trimmedLine.startsWith('**Questions Detected**') ||
                    trimmedLine.includes('Questions Detected') ||
                    trimmedLine.startsWith('**Detected Questions')
                ) {
                    currentSection = 'detected-questions';
                    continue;
                } else if (
                    trimmedLine.startsWith('**Terms to Define**') ||
                    trimmedLine.includes('Terms to Define') ||
                    trimmedLine.startsWith('**Define Candidates')
                ) {
                    currentSection = 'define-candidates';
                    continue;
                }

                // 컨텐츠 파싱
                if (trimmedLine.startsWith('-') && currentSection === 'meeting-insights') {
                    const summaryPoint = trimmedLine.substring(1).trim();
                    if (summaryPoint && !structuredData.summary.includes(summaryPoint)) {
                        // 기존 summary 업데이트 (최대 5개 유지)
                        structuredData.summary.unshift(summaryPoint);
                        if (structuredData.summary.length > 5) {
                            structuredData.summary.pop();
                        }
                    }
                } else if (trimmedLine.match(/^\d+\./) && currentSection === 'detected-questions') {
                    const question = trimmedLine.replace(/^\d+\.\s*/, '').trim();
                    if (question) {
                        structuredData.actions.push(`❓ ${question}`);
                    }
                } else if (trimmedLine.startsWith('-') && currentSection === 'define-candidates') {
                    const term = trimmedLine.substring(1).trim().replace(/^"|"$/g, '');
                    if (term && !this.definedTerms.has(term.toLowerCase())) {
                        const defineItem = `📘 Define "${term}"`;
                        if (!structuredData.actions.some(x => (x || '').toLowerCase() === defineItem.toLowerCase())) {
                            structuredData.actions.push(defineItem);
                            this.definedTerms.add(term.toLowerCase()); // Track this term as defined
                        }
                    }
                }
            }

            // 기본 액션 추가 - Using simple emojis to avoid encoding issues
            const defaultActions = ['✨ What should I say next?', '💬 Suggest follow-up questions'];
            defaultActions.forEach(action => {
                if (
                    !structuredData.actions.some(
                        existingAction => existingAction.includes('What should I say next') || existingAction.includes('Suggest follow-up questions')
                    )
                ) {
                    structuredData.actions.push(action);
                }
            });

            // 액션 개수 제한
            structuredData.actions = structuredData.actions.slice(0, 10);

            // 유효성 검증 및 이전 데이터 병합
            if (structuredData.summary.length === 0 && previousResult) {
                structuredData.summary = previousResult.summary;
            }
        } catch (error) {
            console.error('❌ Error parsing response text:', error);
            // 에러 시 이전 결과 반환
            return (
                previousResult || {
                    summary: [],
                    actions: ['✨ What should I say next?', '💬 Suggest follow-up questions'],
                    followUps: ['✉️ Draft a follow-up email', '✅ Generate action items', '📝 Show summary'],
                }
            );
        }

        // console.log('📊 Final structured data:', JSON.stringify(structuredData, null, 2));
        // console.log('📊 Summary count:', structuredData.summary.length);
        // console.log('📊 Actions count:', structuredData.actions.length);

        // Debug: Show what we actually parsed
        if (structuredData.summary.length > 0) {
            // console.log('✅ Successfully parsed summary items:', structuredData.summary);
        } else {
            // console.log('⚠️ No summary items were parsed - check section headers');
        }

        return structuredData;
    }

    /**
     * Triggers analysis when conversation history reaches 5 texts.
     */
    async triggerAnalysisIfNeeded() {
        const analysisStep = config.get('analysisStep') || 5;
        const recapStep = config.get('recapStep') || 15;

        if (this.conversationHistory.length >= analysisStep && this.conversationHistory.length % analysisStep === 0) {
            console.log(`Triggering analysis - ${this.conversationHistory.length} conversation texts accumulated`);

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
                // console.log('📤 Data being sent:', JSON.stringify(data, null, 2));
                this.sendToRenderer('summary-update', data);

                // Update tracking - we've now analyzed up to the current conversation length
                this.lastAnalyzedIndex = this.conversationHistory.length;
                // console.log(`✅ Analysis complete. Updated lastAnalyzedIndex to ${this.lastAnalyzedIndex}`);

                // Notify callback
                if (this.onAnalysisComplete) {
                    this.onAnalysisComplete(data);
                }
            } else {
                console.log('No analysis data returned');
            }
        }
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
