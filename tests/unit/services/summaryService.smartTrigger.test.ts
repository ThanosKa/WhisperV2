import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('../../../src/main/features/common/config/config', () => {
    const values: Record<string, unknown> = {
        smartTrigger: {
            enabled: true,
            minTokenCount: 12,
            minCharCount: 80,
            maxWaitUtterances: 6,
        },
        analysisStep: 5,
        recapStep: 15,
    };

    return {
        default: {
            get: vi.fn((key: string) => values[key]),
            set: vi.fn(({ key, value }: { key: string; value: unknown }) => {
                values[key] = value;
            }),
        },
    };
});

vi.mock('../../../src/main/features/common/ai/llmClient', () => ({
    chat: vi.fn().mockResolvedValue({}),
}));

describe('SummaryService smart trigger batching', () => {
    let summaryService: typeof import('../../../src/main/features/listen/summary/summaryService').default;
    let config: typeof import('../../../src/main/features/common/config/config').default;
    let makeOutlineSpy: ReturnType<typeof vi.spyOn>;

    const shortUtterance = (speaker: string) => `${speaker}: ok`;
    const mediumUtterance = (speaker: string) => `${speaker}: ${'word '.repeat(5).trim()}`;
    const longUtterance = (speaker: string) => `${speaker}: ${'detailed insight '.repeat(8).trim()}`; // > 80 chars

    const seedHistory = (lines: string[]) => {
        summaryService.conversationHistory = [...lines];
        summaryService.lastAnalyzedIndex = 0;
        summaryService.batchTimer = null;
    };

    beforeEach(async () => {
        vi.resetModules();
        vi.clearAllMocks();
        config = (await import('../../../src/main/features/common/config/config')).default;
        config.set({
            key: 'smartTrigger',
            value: {
                enabled: true,
                minTokenCount: 12,
                minCharCount: 80,
                maxWaitUtterances: 6,
            },
        });
        config.set({ key: 'analysisStep', value: 5 });
        config.set({ key: 'recapStep', value: 15 });
        summaryService = (await import('../../../src/main/features/listen/summary/summaryService')).default;
        summaryService.resetConversationHistory();
        summaryService.sendToRenderer = vi.fn();
        summaryService.onAnalysisComplete = vi.fn();
        makeOutlineSpy = vi.spyOn(summaryService, 'makeOutlineAndRequests').mockResolvedValue({ summary: [], actions: [], followUps: [] });
    });

    afterEach(() => {
        makeOutlineSpy.mockRestore();
    });

    test('requires at least three utterances even when early content is long', async () => {
        seedHistory([longUtterance('me'), mediumUtterance('them')]);

        await summaryService.triggerAnalysisIfNeeded();
        expect(makeOutlineSpy).not.toHaveBeenCalled();

        summaryService.conversationHistory.push(shortUtterance('me'));
        await summaryService.triggerAnalysisIfNeeded();
        expect(makeOutlineSpy).toHaveBeenCalledTimes(1);
    });

    test('three short utterances wait for more content before triggering', async () => {
        seedHistory([shortUtterance('me'), shortUtterance('them'), shortUtterance('me')]);

        await summaryService.triggerAnalysisIfNeeded();
        expect(makeOutlineSpy).not.toHaveBeenCalled();

        summaryService.conversationHistory.push(longUtterance('them'));
        await summaryService.triggerAnalysisIfNeeded();
        expect(makeOutlineSpy).toHaveBeenCalledTimes(1);
    });

    test('short-short-long batch triggers immediately once thresholds met', async () => {
        seedHistory([shortUtterance('me'), shortUtterance('them'), longUtterance('me')]);

        await summaryService.triggerAnalysisIfNeeded();
        expect(makeOutlineSpy).toHaveBeenCalledTimes(1);
    });

    test('maxWaitUtterances forces analysis after six short turns', async () => {
        seedHistory([
            shortUtterance('me'),
            shortUtterance('them'),
            mediumUtterance('me'),
            shortUtterance('them'),
            mediumUtterance('me'),
            shortUtterance('them'),
        ]);

        await summaryService.triggerAnalysisIfNeeded();
        expect(makeOutlineSpy).toHaveBeenCalledTimes(1);
    });

    test('force flag triggers analysis even with a single utterance', async () => {
        seedHistory([mediumUtterance('me')]);

        await summaryService.triggerAnalysisIfNeeded(true);
        expect(makeOutlineSpy).toHaveBeenCalledTimes(1);
    });

    test('falls back to analysisStep logic when smart trigger disabled', async () => {
        config.set({ key: 'smartTrigger', value: { enabled: false } });
        config.set({ key: 'analysisStep', value: 2 });

        seedHistory([mediumUtterance('me'), mediumUtterance('them')]);

        await summaryService.triggerAnalysisIfNeeded();
        expect(makeOutlineSpy).toHaveBeenCalledTimes(1);
    });

    test('addConversationTurn ignores utterances shorter than five characters', () => {
        summaryService.addConversationTurn('me', 'ok');
        expect(summaryService.conversationHistory).toHaveLength(0);

        summaryService.addConversationTurn('me', 'great idea');
        expect(summaryService.conversationHistory).toHaveLength(1);
        expect(summaryService.conversationHistory[0]).toMatch(/^me:/);
    });
});
