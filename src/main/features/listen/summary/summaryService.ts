import { z } from 'zod';
import * as llmClient from '../../common/ai/llmClient';
import sessionRepository from '../../common/repositories/session';
import type { ResolvedPreset } from '../../common/repositories/preset';
import summaryRepository from './repositories';
import type { InsightPayload } from './repositories';
import config from '../../common/config/config';
import * as settingsService from '../../settings/settingsService';
import { windowPool } from '../../../window/windowManager';
import { logger } from '../../common/utils/logger';
import { errorMessage } from '../../common/utils/errors';
import fs from 'fs';
import path from 'path';

const log = logger.child({ module: 'SummaryService' });

// Recent turns sent with each analysis request.
const MAX_TURNS = 30;

// The result of one analysis round, as the Listen window shows it. A round restored from the
// database (`hydrateInsights`) also carries `sections`; a parsed LLM answer carries `rawLLMOutput`.
export type AnalysisResult = {
    summary: string[];
    actions: string[];
    followUps: string[];
    rawLLMOutput?: unknown;
    sections?: unknown[];
};

type AnalysisRound = { timestamp: number; data: AnalysisResult; conversationLength: number };

// `analysisHistory` holds the rounds of this run and the round restored after a crash.
type AnalysisHistoryEntry = AnalysisRound | InsightPayload;

export type AnalysisContext = {
    definedTerms: string[];
    detectedQuestions: string[];
    analysisProfile: string | null;
    selectedPresetId: string | null;
};

export type SummaryCallbacks = {
    onAnalysisComplete: (data: AnalysisResult) => void;
};

// A default preset's prompt may be JSON naming the analysis role.
const RolePromptSchema = z.object({ kind: z.literal('analysis_role'), role: z.string() });

// The analysis answer from WhisperAPP's LLM route: JSON with a list of sections.
const AnalysisEnvelopeSchema = z.object({ sections: z.array(z.unknown()) });
const AnalysisSectionSchema = z.object({ type: z.string(), items: z.array(z.unknown()) });
const SectionItemsSchema = z.array(z.string());

const KNOWN_SECTION_TYPES = new Set([
    'insights',
    'opportunities',
    'questions',
    'follow_ups',
    'buyer_questions',
    'defines',
    'objections',
    'strengths',
    'gaps',
    'suggested_questions',
    'issue_summary',
    'root_causes',
    'troubleshooting',
    'key_concepts',
    'unclear_points',
    'study_questions',
    'searches',
]);

type SectionRead = { kind: 'section'; type: string; items: string[] } | { kind: 'skip' } | { kind: 'invalid'; reason: string };

// Reads one entry of `sections` the way the untyped code did: an entry of no known type, or whose
// `items` is not a list, is skipped; a null entry, or a known one holding a non-text item, made
// the old code throw, which fell back as if the answer were not JSON.
function readSection(raw: unknown): SectionRead {
    if (raw === null || raw === undefined) return { kind: 'invalid', reason: 'Section is null' };
    const shape = AnalysisSectionSchema.safeParse(raw);
    if (!shape.success || !KNOWN_SECTION_TYPES.has(shape.data.type)) return { kind: 'skip' };
    const items = SectionItemsSchema.safeParse(shape.data.items);
    if (!items.success) return { kind: 'invalid', reason: 'Section item is not text' };
    return { kind: 'section', type: shape.data.type, items: items.data };
}

class SummaryService {
    previousAnalysisResult: AnalysisResult | null = null;
    analysisHistory: AnalysisHistoryEntry[] = [];
    conversationHistory: string[] = [];
    currentSessionId: string | null = null;
    definedTerms = new Set<string>(); // Track previously defined terms
    lastAnalyzedIndex = 0; // Track how many utterances we've already analyzed
    detectedQuestions = new Set<string>(); // Track previously detected questions
    analysisProfile: string | null = 'meeting_analysis'; // base template id
    analysisRound = 0; // Track analysis rounds for debugging

    // Phase 1: Analysis preset selection state
    selectedPresetId: string | null = null;
    selectedRoleText = '';
    customSystemPrompt: string | null = null; // New: For full custom system prompts

    // Callbacks
    onAnalysisComplete: SummaryCallbacks['onAnalysisComplete'] | null = null;
    batchTimer: NodeJS.Timeout | null = null; // For time fallback

    // Insights repository for crash recovery
    insightsRepo = summaryRepository;

    /**
     * Write debug log to response.txt file
     */
    writeDebugLog(message: string): void {
        try {
            const logPath = path.join(process.cwd(), 'response.txt');
            const timestamp = new Date().toISOString();
            const logEntry = `[${timestamp}] ${message}\n`;
            fs.appendFileSync(logPath, logEntry);
        } catch (err) {
            log.warn({ err }, 'Failed to write debug log');
        }
    }

    // Update _mapPresetToProfile to ensure customer-support maps to customer_support_analysis
    _mapPresetToProfile(presetId: string): string {
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

    setCallbacks({ onAnalysisComplete }: SummaryCallbacks): void {
        this.onAnalysisComplete = onAnalysisComplete;
    }

    setSessionId(sessionId: string | null): void {
        this.currentSessionId = sessionId;
    }

    /**
     * Set the active analysis preset and cache its role text (trimmed to ~100 words).
     * Accepts null/empty to clear and fall back to base template without role.
     */
    async setAnalysisPreset(presetId: string | null): Promise<{ success: true } | { success: false; error: string }> {
        try {
            this.selectedPresetId = presetId || null;

            if (!presetId) {
                this.selectedRoleText = '';
                this.customSystemPrompt = null;
                this.analysisProfile = 'meeting_analysis'; // default
                return { success: false, error: 'preset_not_found' };
            }

            const presets: ResolvedPreset[] = await settingsService.getPresets();
            const preset = Array.isArray(presets) ? presets.find(p => p && p.id === presetId) : null;

            if (!preset) {
                log.warn({ presetId, sessionId: this.currentSessionId }, 'Analysis preset not found, clearing role');
                this.selectedRoleText = '';
                this.customSystemPrompt = null;
                return { success: false, error: 'preset_not_found' };
            }

            if (preset.is_default === 1) {
                // Default: Extract role and set profile
                const fullPrompt = preset.prompt + (preset.append_text || '');
                const roleText = this._extractRoleFromPrompt(fullPrompt);
                this.selectedRoleText = this._trimToWordLimit({ text: roleText, maxWords: 100 });
                this.customSystemPrompt = null;
                this.analysisProfile = this._mapPresetToProfile(presetId);
                log.info({ presetId, profile: this.analysisProfile, sessionId: this.currentSessionId }, 'Set default analysis preset');
            } else {
                // Custom: Use full concatenated prompt as system
                this.customSystemPrompt = preset.prompt + (preset.append_text || '');
                this.selectedRoleText = '';
                this.analysisProfile = null;
                log.info(
                    { presetId, promptLength: this.customSystemPrompt.length, sessionId: this.currentSessionId },
                    'Set custom analysis preset'
                );
            }

            return { success: true };
        } catch (err) {
            log.warn({ err, presetId, sessionId: this.currentSessionId }, 'Failed to set analysis preset');
            this.selectedRoleText = '';
            this.customSystemPrompt = null;
            return { success: false, error: errorMessage(err) };
        }
    }

    hydrateConversation(transcripts: ReadonlyArray<{ speaker: string | null; text: string | null }>): void {
        if (!Array.isArray(transcripts)) return;

        log.info({ sessionId: this.currentSessionId, transcripts: transcripts.length }, 'Hydrating transcripts without triggering analysis');

        // Reset state
        this.conversationHistory = [];
        this.lastAnalyzedIndex = 0;

        // Populate history without calling addConversationTurn (which triggers analysis)
        transcripts.forEach(t => {
            const conversationText = `${(t.speaker ?? '').toLowerCase()}: ${(t.text ?? '').trim()}`;
            this.conversationHistory.push(conversationText);
        });

        // Update lastAnalyzedIndex to prevent immediate re-analysis
        this.lastAnalyzedIndex = this.conversationHistory.length;

        log.info({ sessionId: this.currentSessionId, turns: this.conversationHistory.length, lastAnalyzedIndex: this.lastAnalyzedIndex }, 'Hydrated conversation');
    }

    hydrateInsights(insightPayload: InsightPayload | null | undefined): void {
        if (!insightPayload) return;

        log.info({ sessionId: this.currentSessionId }, 'Hydrating insights from persisted data');

        // Restore previousAnalysisResult so context continuity works
        this.previousAnalysisResult = insightPayload;

        // Add to history for audit trail
        this.analysisHistory.push(insightPayload);

        log.info(
            { sessionId: this.currentSessionId, summaryPoints: insightPayload.summary?.length || 0, actions: insightPayload.actions?.length || 0 },
            'Restored insights'
        );
    }

    _extractRoleFromPrompt(prompt: string): string {
        if (!prompt || typeof prompt !== 'string') return '';
        try {
            const parsed = RolePromptSchema.safeParse(JSON.parse(prompt));
            if (parsed.success) {
                return parsed.data.role || '';
            }
        } catch {
            // not JSON, treat as raw text
        }
        return prompt;
    }

    _trimToWordLimit({ text, maxWords }: { text: string; maxWords: number }): string {
        if (!text || typeof text !== 'string') return '';
        const words = text.trim().split(/\s+/);
        if (words.length <= maxWords) return text.trim();
        return words.slice(0, maxWords).join(' ');
    }

    sendToRenderer({ channel, data }: { channel: string; data: unknown }): void {
        const listenWindow = windowPool?.get('listen');

        if (listenWindow && !listenWindow.isDestroyed()) {
            listenWindow.webContents.send(channel, data);
        }
    }

    addConversationTurn({ speaker, text }: { speaker: string; text: string }): void {
        const trimmedText = text.trim();
        if (trimmedText.length < 5) {
            log.info({ sessionId: this.currentSessionId, speaker, chars: trimmedText.length }, 'Skipping short utterance for batching');
            return; // Skip very short utterances to reduce spam
        }

        const conversationText = `${speaker.toLowerCase()}: ${trimmedText}`;
        this.conversationHistory.push(conversationText);
        log.info({ sessionId: this.currentSessionId, speaker, total: this.conversationHistory.length }, 'Added utterance to batch');

        // Start time fallback timer if first utterance
        if (this.conversationHistory.length === 1 && !this.batchTimer) {
            this.batchTimer = setTimeout(() => {
                log.info({ sessionId: this.currentSessionId }, 'Time fallback: forcing analysis after 120s quiet');
                void this.triggerAnalysisIfNeeded(true); // Force flag
            }, 120000); // 2 min
        }

        // SEPARATE: Show UI actions after FIRST utterance (no LLM call)
        if (this.conversationHistory.length === 1) {
            this.triggerInitialUIState();
        }

        // Trigger analysis if needed
        void this.triggerAnalysisIfNeeded();
    }

    /**
     * Trigger initial UI state after first utterance - shows default actions WITHOUT LLM call
     */
    triggerInitialUIState(): void {
        log.info({ sessionId: this.currentSessionId }, 'First utterance: showing initial UI actions (no LLM call)');

        // Create initial state with default actions only
        const initialData = {
            summary: [], // Empty - will show "No insights yet"
            actions: [], // Empty initially - SummaryView will add defaults when hasReceivedFirstText=true
            followUps: [],
            presetId: this.selectedPresetId,
        };

        // Send to UI to trigger display of default actions
        this.sendToRenderer({ channel: 'summary-update', data: initialData });
    }

    getConversationHistory(): string[] {
        log.info({ sessionId: this.currentSessionId, length: this.conversationHistory.length }, 'Conversation history read');
        return this.conversationHistory;
    }

    resetConversationHistory(): void {
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
        log.info({ sessionId: this.currentSessionId }, 'Conversation history and analysis state reset');
    }

    /**
     * Converts conversation history into text to include in the prompt.
     * @param conversationTexts - Array of conversation texts ["me: ~~~", "them: ~~~", ...]
     * @returns Formatted conversation string of the last MAX_TURNS turns
     */
    formatConversationForPrompt(conversationTexts: string[]): string {
        if (conversationTexts.length === 0) return '';
        return conversationTexts.slice(-MAX_TURNS).join('\n');
    }

    async makeOutlineAndRequests(conversationTexts: string[]): Promise<AnalysisResult | null> {
        const sessionId = this.currentSessionId;
        log.info({ sessionId, texts: conversationTexts.length }, 'Analysis requested');

        if (conversationTexts.length === 0) {
            log.info({ sessionId }, 'No conversation texts available for analysis');
            return null;
        }

        const recentConversation = this.formatConversationForPrompt(conversationTexts);

        // SIMPLE DEBUG: Log round start
        this.analysisRound++;
        const prevActions = this.previousAnalysisResult?.actions?.length || 0;
        const prevTerms = this.definedTerms.size;
        const prevQuestionsCount = this.detectedQuestions.size;
        const totalSending = prevActions + prevTerms + prevQuestionsCount;
        const roundLog = `=== ROUND ${this.analysisRound} ===
PREV ROUND ACTIONS: ${prevActions} | TOTAL SENDING TO LLM: ${totalSending} (actions:${prevActions} + terms:${prevTerms} + questions:${prevQuestionsCount})`;

        log.info({ sessionId, round: this.analysisRound, prevActions, prevTerms, prevQuestions: prevQuestionsCount, totalSending }, 'Analysis round started');
        this.writeDebugLog(roundLog);

        // Accumulate ALL actions from analysis history (all previous rounds combined)
        const allPreviousItems: string[] = [];
        this.analysisHistory.forEach(historyEntry => {
            if ('data' in historyEntry && historyEntry.data.actions) {
                allPreviousItems.push(...historyEntry.data.actions);
            }
        });

        // SIMPLE DEBUG: Log what we're actually sending to LLM
        const sendLog = `SENDING TO LLM (${allPreviousItems.length} items):\n${allPreviousItems.map((item, i) => `  ${i + 1}. ${item}`).join('\n')}`;
        log.info({ sessionId, round: this.analysisRound, previousItems: allPreviousItems }, 'Sending previous items to LLM');
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

            log.info({ sessionId, profile: profileToUse, roleLength: payload.role.length }, 'Sending analysis request to AI');

            const completion = await llmClient.chat(payload);

            const responseText = completion.content.trim();

            const structuredData = this.parseResponseText({ responseText, previousResult: this.previousAnalysisResult });

            // SIMPLE DEBUG: Log what LLM created this round
            const newActions = structuredData.actions?.length || 0;
            const responseLog = `LLM CREATED: ${newActions} actions`;
            log.info({ sessionId, round: this.analysisRound, actions: newActions }, 'LLM analysis received');
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
                    log.error({ err, sessionId: this.currentSessionId }, 'Failed to save summary');
                }
            }

            // Save analysis results
            this.previousAnalysisResult = structuredData;

            // SIMPLE DEBUG: Log round end
            const saveLog = `=== END ROUND ${this.analysisRound} ===`;
            log.info({ sessionId, round: this.analysisRound }, 'Analysis round ended');
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
            log.error({ err: error, sessionId }, 'Error during analysis generation');
            return this.previousAnalysisResult; // Return previous result on error
        }
    }

    parseResponseText({ responseText, previousResult }: { responseText: string; previousResult: AnalysisResult | null }): AnalysisResult {
        const defaultFollowUps = ['✉️ Draft a follow-up email', '✅ Generate action items', '📝 Show summary'];
        const structuredData: AnalysisResult = {
            summary: [],
            actions: [],
            followUps: [],
            rawLLMOutput: null,
        };
        const addFollowUp = (value: string) => {
            if (!value) return;
            const cleaned = value.trim();
            if (!cleaned) return;
            structuredData.followUps.push(cleaned);
        };
        // Safe fallback when the answer is not the expected JSON: previous data + defaults
        const fallback = (reason: string): AnalysisResult => {
            log.error({ reason, sessionId: this.currentSessionId }, 'JSON parsing failed');
            log.warn({ sessionId: this.currentSessionId }, 'LLM did not return expected JSON. Check prompts/conversation input.');
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
        };

        // If there are previous results, use them as default values (however, new analysis takes priority)
        if (previousResult && structuredData.summary.length === 0) {
            structuredData.summary = [...previousResult.summary];
        }

        if (!responseText || typeof responseText !== 'string') {
            log.info({ sessionId: this.currentSessionId }, 'No response text to parse');
            return structuredData;
        }

        const trimmedResponse = responseText.trim();

        // First, try JSON parsing (handle code block wrappers)
        let jsonString = trimmedResponse;

        // Extract JSON from common markdown code block wrappers
        const codeBlock = trimmedResponse.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/i)?.[1];
        if (codeBlock !== undefined) {
            jsonString = codeBlock.trim();
            log.info({ sessionId: this.currentSessionId }, 'Extracted JSON from code block');
        } else if (trimmedResponse.startsWith('```') && trimmedResponse.endsWith('```')) {
            // Fallback: strip outer ```
            jsonString = trimmedResponse.slice(3, -3).trim();
            log.info({ sessionId: this.currentSessionId }, 'Stripped ``` wrappers for JSON');
        }

        let jsonData: unknown;
        try {
            jsonData = JSON.parse(jsonString);
        } catch (jsonError) {
            return fallback(errorMessage(jsonError));
        }

        const envelope = AnalysisEnvelopeSchema.safeParse(jsonData);
        if (envelope.success) {
            log.info({ sessionId: this.currentSessionId, sections: envelope.data.sections.length }, 'JSON parsed successfully');

            // Map JSON sections to structuredData
            for (const rawSection of envelope.data.sections) {
                const section = readSection(rawSection);
                if (section.kind === 'skip') continue;
                if (section.kind === 'invalid') return fallback(section.reason);

                if (section.type === 'insights' || section.type === 'opportunities') {
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
                } else if (section.type === 'questions') {
                    section.items.forEach(item => {
                        const question = item
                            .trim()
                            .replace(/^-?\s*/, '')
                            .replace(/^"|"$/g, '')
                            .replace(/"([^"]+)"/g, '$1'); // Strip quotes
                        const prefixed = `❓ ${question}`;
                        structuredData.actions.push(prefixed);
                    });
                } else if (section.type === 'follow_ups') {
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
                } else if (section.type === 'buyer_questions') {
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
                } else if (section.type === 'defines') {
                    section.items.forEach(item => {
                        const term = item
                            .trim()
                            .replace(/^-?\s*/, '')
                            .replace(/^"|"$/g, '')
                            .replace(/"([^"]+)"/g, '$1');
                        let coreTerm = (term.split('(')[0] ?? '').split(':')[0]?.trim() ?? '';
                        coreTerm = coreTerm.replace(/[.,;:!?]+$/, '');
                        if (!coreTerm || coreTerm.length < 2) coreTerm = term;
                        const prefixed = `📘 Define ${coreTerm}`;
                        structuredData.actions.push(prefixed);
                    });
                } else if (section.type === 'objections') {
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
                } else if (section.type === 'strengths') {
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
                } else if (section.type === 'gaps') {
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
                } else if (section.type === 'suggested_questions') {
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
                } else if (section.type === 'issue_summary') {
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
                } else if (section.type === 'root_causes') {
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
                } else if (section.type === 'troubleshooting') {
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
                } else if (section.type === 'key_concepts') {
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
                } else if (section.type === 'unclear_points') {
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
                } else if (section.type === 'study_questions') {
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
                } else if (section.type === 'searches') {
                    section.items.forEach(item => {
                        const searchItem = item
                            .trim()
                            .replace(/^-?\s*/, '')
                            .replace(/^Search:\s*/i, '')
                            .replace(/^"|"$/g, '')
                            .replace(/"([^"]+)"/g, '$1');
                        if (searchItem) {
                            // Exactly like Define: Emoji + Label | Query
                            const prefixed = `🌐 Search: ${searchItem}`;
                            structuredData.actions.push(prefixed);
                        }
                    });
                }
            }

            // Merge with previous if needed
            if (structuredData.summary.length === 0 && previousResult) {
                structuredData.summary = previousResult.summary;
            }

            structuredData.rawLLMOutput = jsonData;
            defaultFollowUps.forEach(addFollowUp);

            return structuredData;
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
    async triggerAnalysisIfNeeded(force = false): Promise<void> {
        const sessionId = this.currentSessionId;
        // Clear timer on activity
        if (this.batchTimer) {
            clearTimeout(this.batchTimer);
            this.batchTimer = null;
            log.info({ sessionId }, 'Batch timer cleared: activity detected');
        }

        const recapStep = config.get('recapStep') || 15;
        const smartCfg = config.get('smartTrigger') || {};

        if (!this.conversationHistory.length) {
            log.info({ sessionId }, 'No history yet, skipping trigger');
            return;
        }

        // Check if we should analyze based on smart triggers or force flag
        let shouldAnalyze = false;
        if (force) {
            shouldAnalyze = true;
            log.info({ sessionId }, 'Force trigger');
        } else if (smartCfg.enabled) {
            const sinceLast = this.conversationHistory.slice(this.lastAnalyzedIndex);
            const textSince = sinceLast.join(' ');

            const tokenCount = this._roughTokenCount(textSince);
            const charCount = textSince.length;
            const utteranceCount = sinceLast.length;

            log.info({ sessionId, utteranceCount, charCount, tokenCount, lastAnalyzedIndex: this.lastAnalyzedIndex }, 'Batch check');

            // Min batch size: Only consider if at least 3 utterances for meaningful batch
            if (utteranceCount < 3) {
                log.info({ sessionId, utteranceCount }, 'Batch too small (<3 utterances), waiting');
                return; // Too small batch, wait for more
            }

            const enoughContent = tokenCount >= (smartCfg.minTokenCount ?? 12) || charCount >= (smartCfg.minCharCount ?? 50);
            const maxWaitHit = utteranceCount >= (smartCfg.maxWaitUtterances ?? 5);

            log.info(
                {
                    sessionId,
                    enoughContent,
                    charCount,
                    minCharCount: smartCfg.minCharCount,
                    tokenCount,
                    minTokenCount: smartCfg.minTokenCount,
                    maxWaitHit,
                    utteranceCount,
                    maxWaitUtterances: smartCfg.maxWaitUtterances,
                },
                'Content check'
            );

            shouldAnalyze = (enoughContent || maxWaitHit) && utteranceCount > 0;
        } else {
            // Original behavior: analyze every N utterances
            const analysisStep = config.get('analysisStep') || 5;
            shouldAnalyze = this.conversationHistory.length >= analysisStep && this.conversationHistory.length % analysisStep === 0;
            log.info({ sessionId, shouldAnalyze, total: this.conversationHistory.length, analysisStep }, 'Fallback step check');
        }

        if (!shouldAnalyze && !force) {
            log.info({ sessionId }, 'Not triggering: batch not ready');
            return;
        }

        if (force) {
            log.info({ sessionId }, 'Force trigger from time fallback');
        }

        // Analyze only new utterances since last analysis
        const textsToAnalyze = this.conversationHistory.slice(this.lastAnalyzedIndex);
        log.info(
            { sessionId, total: this.conversationHistory.length, newUtterances: textsToAnalyze.length, fromIndex: this.lastAnalyzedIndex },
            'Triggering analysis'
        );

        // FIX: Update lastAnalyzedIndex BEFORE async call so concurrent triggers see updated index
        // This prevents duplicate analysis and ensures previousAnalysisResult state is available
        this.lastAnalyzedIndex = this.conversationHistory.length;
        log.info({ sessionId, lastAnalyzedIndex: this.lastAnalyzedIndex }, 'Marked utterances as analyzed');

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
                    log.info({ sessionId: this.currentSessionId, round: this.analysisRound }, 'Persisted insights round');
                } catch (err) {
                    log.error({ err, sessionId: this.currentSessionId }, 'Failed to persist insights');
                }
            }

            // Add recap button if conversation is long enough
            if (this.conversationHistory.length >= recapStep) {
                const recapItem = '🗒️ Recap meeting so far';
                if (!data.actions.some(x => (x || '').toLowerCase() === recapItem.toLowerCase())) {
                    data.actions.unshift(recapItem);
                }
            }

            log.info({ sessionId: this.currentSessionId }, 'Sending structured data to renderer');
            this.sendToRenderer({ channel: 'summary-update', data: { ...data, presetId: this.selectedPresetId } });

            if (this.onAnalysisComplete) {
                this.onAnalysisComplete(data);
            }
        } else {
            log.info({ sessionId: this.currentSessionId }, 'No analysis data returned');
        }
    }

    // Rough approximation: ~4 chars per token
    _roughTokenCount(str: string): number {
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
     */
    getCurrentContext(): AnalysisContext {
        return {
            definedTerms: Array.from(this.definedTerms),
            detectedQuestions: Array.from(this.detectedQuestions),
            analysisProfile: this.analysisProfile,
            selectedPresetId: this.selectedPresetId,
        };
    }
}

const summaryService = new SummaryService();
export default summaryService;
