const { describe, test, expect, beforeEach } = require('@jest/globals');

jest.mock('../../../src/features/common/ai/llmClient', () => require('../../mocks/llmClient.mock'));
jest.mock('../../../src/features/common/repositories/session', () => require('../../mocks/database.mock').sessionRepository);
jest.mock('../../../src/features/ask/repositories', () => require('../../mocks/database.mock').askRepository);

jest.mock('../../../src/window/windowManager', () => {
    const createMockWindow = () => ({
        isDestroyed: jest.fn(() => false),
        isVisible: jest.fn(() => true),
        webContents: {
            send: jest.fn(),
            isDestroyed: jest.fn(() => false),
        },
    });

    const askWindow = createMockWindow();
    const headerWindow = createMockWindow();

    return {
        windowPool: new Map([
            ['ask', askWindow],
            ['header', headerWindow],
        ]),
        __mockAskWindow: askWindow,
        __mockHeaderWindow: headerWindow,
    };
});

describe('AskService', () => {
    let askService;

    beforeEach(() => {
        jest.clearAllMocks();
        jest.resetModules();
        askService = require('../../../src/features/ask/askService');
    });

    describe('_detectIntentFromClickPill', () => {
        test('detects "next" intent from standard pill', () => {
            expect(askService._detectIntentFromClickPill('✨ What should I say next?')).toBe('next');
        });

        test('detects "email" intent from label containing emoji', () => {
            expect(askService._detectIntentFromClickPill('✉️ Draft a follow-up email')).toBe('email');
        });

        test('falls back to summary intent when text contains keyword', () => {
            expect(askService._detectIntentFromClickPill('Please give me a summary of this discussion')).toBe('summary');
        });

        test('returns null for unknown prompt', () => {
            expect(askService._detectIntentFromClickPill('Random text input')).toBeNull();
        });
    });

    describe('_resolveProfileForIntent', () => {
        test('resolves meeting_next profile for next intent', () => {
            const result = askService._resolveProfileForIntent('next', 'meeting');
            expect(result.profileToUse).toBe('meeting_next');
            expect(result.useConversationContext).toBe(true);
        });

        test('resolves sales_objection profile for objection intent', () => {
            const result = askService._resolveProfileForIntent('objection', 'sales');
            expect(result.profileToUse).toBe('sales_objection');
            expect(result.useConversationContext).toBe(true);
        });

        test('disables conversation context for define intent', () => {
            const result = askService._resolveProfileForIntent('define', 'meeting');
            expect(result.useConversationContext).toBe(false);
        });
    });

    describe('_deriveTitleFromPrompt', () => {
        test('normalises emoji laden prompts', () => {
            const result = askService._deriveTitleFromPrompt('✨ what is the main topic of this meeting?');
            expect(result).toBe('What is the main topic of this meeting?');
        });

        test('handles empty prompt safely', () => {
            expect(askService._deriveTitleFromPrompt('')).toBe('');
        });

        test('limits title to twelve words', () => {
            const result = askService._deriveTitleFromPrompt('one two three four five six seven eight nine ten eleven twelve thirteen');
            expect(result.split(/\s+/).length).toBeLessThanOrEqual(12);
        });
    });

    describe('interruptStream', () => {
        test('aborts an in-flight stream and updates state', () => {
            askService.abortController = new AbortController();
            const abortSpy = jest.spyOn(askService.abortController, 'abort');
            askService.state.isStreaming = true;
            askService.state.interrupted = false;

            askService.interruptStream();

            expect(abortSpy).toHaveBeenCalledWith('User interrupted');
            expect(askService.state.isStreaming).toBe(false);
            expect(askService.state.interrupted).toBe(true);
        });
    });
});
