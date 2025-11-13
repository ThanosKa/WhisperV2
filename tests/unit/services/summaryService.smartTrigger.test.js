const { describe, test, expect, beforeEach, afterEach } = require('@jest/globals');

jest.mock('../../../src/features/common/config/config', () => {
    const values = {
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
        get: jest.fn(key => values[key]),
        set: jest.fn((key, value) => {
            values[key] = value;
        }),
    };
});

jest.mock('../../../src/features/common/ai/llmClient', () => ({
    chat: jest.fn().mockResolvedValue({}),
}));

describe('SummaryService smart trigger batching', () => {
    let summaryService;
    let config;
    let makeOutlineSpy;

    const shortUtterance = speaker => `${speaker}: ok`;
    const mediumUtterance = speaker => `${speaker}: ${'word '.repeat(5).trim()}`;
    const longUtterance = speaker => `${speaker}: ${'detailed insight '.repeat(8).trim()}`; // > 80 chars

    const seedHistory = lines => {
        summaryService.conversationHistory = [...lines];
        summaryService.lastAnalyzedIndex = 0;
        summaryService.batchTimer = null;
    };

    beforeEach(() => {
        jest.resetModules();
        jest.clearAllMocks();
        config = require('../../../src/features/common/config/config');
        config.set('smartTrigger', {
            enabled: true,
            minTokenCount: 12,
            minCharCount: 80,
            maxWaitUtterances: 6,
        });
        config.set('analysisStep', 5);
        config.set('recapStep', 15);
        summaryService = require('../../../src/features/listen/summary/summaryService');
        summaryService.resetConversationHistory();
        summaryService.sendToRenderer = jest.fn();
        summaryService.onAnalysisComplete = jest.fn();
        makeOutlineSpy = jest
            .spyOn(summaryService, 'makeOutlineAndRequests')
            .mockResolvedValue({ summary: [], actions: [], followUps: [] });
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
        config.set('smartTrigger', { enabled: false });
        config.set('analysisStep', 2);

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
