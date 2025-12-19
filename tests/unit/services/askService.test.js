const { describe, test, expect, beforeEach } = require('@jest/globals');

jest.mock('../../../src/features/common/ai/llmClient', () => require('../../mocks/llmClient.mock'));
jest.mock('../../../src/features/common/repositories/session', () => require('../../mocks/database.mock').sessionRepository);
jest.mock('../../../src/features/ask/repositories', () => require('../../mocks/database.mock').askRepository);

// Mock listenService for toggleAskButton tests
jest.mock('../../../src/features/listen/listenService', () => ({
    getConversationHistory: jest.fn(() => []),
    getCurrentSessionData: jest.fn(() => ({ sessionId: 'test-session-id' })),
}));

// Mock summaryService for role context tests
// Use a mutable object so test mutations are visible to code under test
const mockSummaryService = {
    selectedRoleText: '',
    selectedPresetId: null,
    getCurrentContext: jest.fn(() => ({
        definedTerms: [],
        detectedQuestions: [],
        analysisProfile: 'meeting_analysis',
    })),
};
jest.mock('../../../src/features/listen/summary/summaryService', () => mockSummaryService);

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

        // Reset mockSummaryService properties for test isolation
        mockSummaryService.selectedRoleText = '';
        mockSummaryService.selectedPresetId = null;
        mockSummaryService.getCurrentContext.mockReturnValue({
            definedTerms: [],
            detectedQuestions: [],
            analysisProfile: 'meeting_analysis',
        });

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

    describe('useScreenCapture', () => {
        let mockDesktopCapturer;
        let mockExecFile;
        let originalPlatform;

        beforeEach(() => {
            jest.clearAllMocks();
            // Mock desktopCapturer for non-darwin platforms
            const { desktopCapturer } = require('electron');
            mockDesktopCapturer = desktopCapturer;
            mockDesktopCapturer.getSources = jest.fn(async () => [
                {
                    id: 'screen:0:0',
                    name: 'Screen 1',
                    display_id: '0',
                    thumbnail: {
                        toJPEG: jest.fn(() => Buffer.from('mock-image-data')),
                        getSize: jest.fn(() => ({ width: 1920, height: 1080 })),
                    },
                },
            ]);

            // Mock execFile for darwin platform
            const childProcess = require('child_process');
            const util = require('util');
            mockExecFile = jest.fn(async () => ({ stdout: '', stderr: '' }));
            jest.spyOn(util, 'promisify').mockImplementation((fn) => {
                if (fn === childProcess.execFile) {
                    return mockExecFile;
                }
                return fn;
            });

            // Mock fs.promises for darwin screenshot path
            const fs = require('fs');
            jest.spyOn(fs.promises, 'readFile').mockResolvedValue(Buffer.from('mock-image-data'));
            jest.spyOn(fs.promises, 'unlink').mockResolvedValue();

            // Store original platform
            originalPlatform = process.platform;
        });

        afterEach(() => {
            Object.defineProperty(process, 'platform', {
                value: originalPlatform,
                writable: true,
            });
            jest.restoreAllMocks();
        });

        test('defaults to true on initialization', () => {
            expect(askService.state.useScreenCapture).toBe(true);
        });

        test('state can be updated directly', () => {
            askService.state.useScreenCapture = false;
            expect(askService.state.useScreenCapture).toBe(false);

            askService.state.useScreenCapture = true;
            expect(askService.state.useScreenCapture).toBe(true);
        });

        test('sendMessage captures screenshot when useScreenCapture=true and forceDefaultProfileOnce=true', async () => {
            // Set platform to non-darwin to use desktopCapturer path
            Object.defineProperty(process, 'platform', {
                value: 'linux',
                writable: true,
            });

            askService._forceDefaultProfileOnce = true;
            askService.state.useScreenCapture = true;

            // Mock llmClient.stream to avoid actual API call
            const llmClient = require('../../../src/features/common/ai/llmClient');
            llmClient.stream.mockResolvedValueOnce({
                headers: new Map(),
                body: {
                    getReader: () => ({
                        read: async () => ({ done: true, value: undefined }),
                    }),
                },
            });

            await askService.sendMessage('Test prompt', [], null, true);

            expect(mockDesktopCapturer.getSources).toHaveBeenCalled();
        });

        test('sendMessage captures screenshot when useScreenCapture=true and prompt is "Assist me"', async () => {
            Object.defineProperty(process, 'platform', {
                value: 'linux',
                writable: true,
            });

            askService._forceDefaultProfileOnce = false;
            askService.state.useScreenCapture = true;

            const llmClient = require('../../../src/features/common/ai/llmClient');
            llmClient.stream.mockResolvedValueOnce({
                headers: new Map(),
                body: {
                    getReader: () => ({
                        read: async () => ({ done: true, value: undefined }),
                    }),
                },
            });

            await askService.sendMessage('Assist me', [], null, true);

            expect(mockDesktopCapturer.getSources).toHaveBeenCalled();
        });

        test('sendMessage does not capture screenshot when useScreenCapture=false even with "Assist me"', async () => {
            Object.defineProperty(process, 'platform', {
                value: 'linux',
                writable: true,
            });

            askService._forceDefaultProfileOnce = false;
            askService.state.useScreenCapture = false;

            const llmClient = require('../../../src/features/common/ai/llmClient');
            llmClient.stream.mockResolvedValueOnce({
                headers: new Map(),
                body: {
                    getReader: () => ({
                        read: async () => ({ done: true, value: undefined }),
                    }),
                },
            });

            await askService.sendMessage('Assist me', [], null, false);

            expect(mockDesktopCapturer.getSources).not.toHaveBeenCalled();
        });

        test('sendMessage does not capture screenshot when useScreenCapture=false even with forceDefaultProfileOnce=true', async () => {
            Object.defineProperty(process, 'platform', {
                value: 'linux',
                writable: true,
            });

            askService._forceDefaultProfileOnce = true;
            askService.state.useScreenCapture = false;

            const llmClient = require('../../../src/features/common/ai/llmClient');
            llmClient.stream.mockResolvedValueOnce({
                headers: new Map(),
                body: {
                    getReader: () => ({
                        read: async () => ({ done: true, value: undefined }),
                    }),
                },
            });

            await askService.sendMessage('Test prompt', [], null, false);

            expect(mockDesktopCapturer.getSources).not.toHaveBeenCalled();
        });

        test('sendMessage does not capture screenshot for regular prompts when useScreenCapture=false', async () => {
            Object.defineProperty(process, 'platform', {
                value: 'linux',
                writable: true,
            });

            askService._forceDefaultProfileOnce = false;
            askService.state.useScreenCapture = false;

            const llmClient = require('../../../src/features/common/ai/llmClient');
            llmClient.stream.mockResolvedValueOnce({
                headers: new Map(),
                body: {
                    getReader: () => ({
                        read: async () => ({ done: true, value: undefined }),
                    }),
                },
            });

            await askService.sendMessage('What is the weather?', [], null, false);

            expect(mockDesktopCapturer.getSources).not.toHaveBeenCalled();
        });

        test('toggleAskButton respects state.useScreenCapture when sending "Assist me"', async () => {
            Object.defineProperty(process, 'platform', {
                value: 'linux',
                writable: true,
            });

            const listenService = require('../../../src/features/listen/listenService');
            listenService.getConversationHistory.mockReturnValue([]);

            askService.state.useScreenCapture = false;
            askService.state.showTextInput = true;

            const llmClient = require('../../../src/features/common/ai/llmClient');
            llmClient.stream.mockResolvedValueOnce({
                headers: new Map(),
                body: {
                    getReader: () => ({
                        read: async () => ({ done: true, value: undefined }),
                    }),
                },
            });

            await askService.toggleAskButton(true);

            expect(mockDesktopCapturer.getSources).not.toHaveBeenCalled();
        });

        test('toggleAskButton captures screenshot when state.useScreenCapture=true', async () => {
            Object.defineProperty(process, 'platform', {
                value: 'linux',
                writable: true,
            });

            const listenService = require('../../../src/features/listen/listenService');
            listenService.getConversationHistory.mockReturnValue([]);

            askService.state.useScreenCapture = true;
            askService.state.showTextInput = true;

            const llmClient = require('../../../src/features/common/ai/llmClient');
            llmClient.stream.mockResolvedValueOnce({
                headers: new Map(),
                body: {
                    getReader: () => ({
                        read: async () => ({ done: true, value: undefined }),
                    }),
                },
            });

            await askService.toggleAskButton(true);

            expect(mockDesktopCapturer.getSources).toHaveBeenCalled();
        });
    });

    describe('Role Context Passing', () => {
        describe('_resolveProfileForIntent - shouldIncludeRole flag', () => {
            test('returns shouldIncludeRole=true for next intent', () => {
                const result = askService._resolveProfileForIntent('next', 'sales');
                expect(result.shouldIncludeRole).toBe(true);
                expect(result.profileToUse).toBe('sales_next');
            });

            test('returns shouldIncludeRole=true for email intent', () => {
                const result = askService._resolveProfileForIntent('email', 'recruiting');
                expect(result.shouldIncludeRole).toBe(true);
                expect(result.profileToUse).toBe('recruiting_email');
            });

            test('returns shouldIncludeRole=false for define intent', () => {
                const result = askService._resolveProfileForIntent('define', 'sales');
                expect(result.shouldIncludeRole).toBe(false);
                expect(result.useConversationContext).toBe(false);
            });

            test('returns shouldIncludeRole=false for recap intent', () => {
                const result = askService._resolveProfileForIntent('recap', 'meeting');
                expect(result.shouldIncludeRole).toBe(false);
            });

            test('returns shouldIncludeRole=false for summary intent', () => {
                const result = askService._resolveProfileForIntent('summary', 'sales');
                expect(result.shouldIncludeRole).toBe(false);
            });
        });

        describe('Payload Construction - Role Inclusion', () => {
            test('includes role in payload for next intent with sales preset', async () => {
                // Set mock properties directly
                mockSummaryService.selectedRoleText = 'You are a sales assistant helping sell CRM software.';
                mockSummaryService.selectedPresetId = 'sales';

                const llmClient = require('../../../src/features/common/ai/llmClient');
                llmClient.stream.mockResolvedValueOnce({
                    headers: new Map(),
                    body: {
                        getReader: () => ({
                            read: async () => ({ done: true, value: undefined }),
                        }),
                    },
                });

                askService.state.useScreenCapture = false;

                await askService.sendMessage('✨ What should I say next?', ['me: hi', 'them: hello'], 'sales', false);

                expect(llmClient.stream).toHaveBeenCalledWith(
                    expect.objectContaining({
                        profile: 'sales_next',
                        role: 'You are a sales assistant helping sell CRM software.',
                        context: expect.objectContaining({
                            transcript: expect.any(String),
                        }),
                    }),
                    expect.any(Object)
                );
            });

            test('includes role in payload for email intent', async () => {
                // Set mock properties directly
                mockSummaryService.selectedRoleText = 'You are a recruiting assistant.';
                mockSummaryService.selectedPresetId = 'recruiting';

                const llmClient = require('../../../src/features/common/ai/llmClient');
                llmClient.stream.mockResolvedValueOnce({
                    headers: new Map(),
                    body: {
                        getReader: () => ({
                            read: async () => ({ done: true, value: undefined }),
                        }),
                    },
                });

                askService.state.useScreenCapture = false;

                await askService.sendMessage('✉️ Draft a follow-up email', ['me: interview went well'], 'recruiting', false);

                expect(llmClient.stream).toHaveBeenCalledWith(
                    expect.objectContaining({
                        profile: 'recruiting_email',
                        role: 'You are a recruiting assistant.',
                    }),
                    expect.any(Object)
                );
            });
        });

        describe('Payload Construction - Role Exclusion', () => {
            test('excludes role from payload for define intent', async () => {
                // Set mock properties directly
                mockSummaryService.selectedRoleText = 'You are a sales assistant.';
                mockSummaryService.selectedPresetId = 'sales';

                const llmClient = require('../../../src/features/common/ai/llmClient');
                llmClient.stream.mockResolvedValueOnce({
                    headers: new Map(),
                    body: {
                        getReader: () => ({
                            read: async () => ({ done: true, value: undefined }),
                        }),
                    },
                });

                askService.state.useScreenCapture = false;

                await askService.sendMessage('📘 Define API', [], 'sales', false);

                const callArgs = llmClient.stream.mock.calls[0][0];
                expect(callArgs).not.toHaveProperty('role');
                expect(callArgs.profile).toBe('sales_define');
            });

            test('excludes role from payload for recap intent', async () => {
                // Set mock properties directly
                mockSummaryService.selectedRoleText = 'You are a sales assistant.';
                mockSummaryService.selectedPresetId = 'sales';

                const llmClient = require('../../../src/features/common/ai/llmClient');
                llmClient.stream.mockResolvedValueOnce({
                    headers: new Map(),
                    body: {
                        getReader: () => ({
                            read: async () => ({ done: true, value: undefined }),
                        }),
                    },
                });

                askService.state.useScreenCapture = false;

                await askService.sendMessage('🗒️ Recap meeting so far', ['me: discussed pricing'], 'sales', false);

                const callArgs = llmClient.stream.mock.calls[0][0];
                expect(callArgs).not.toHaveProperty('role');
                expect(callArgs.profile).toBe('sales_recap');
            });

            test('excludes role from payload for summary intent', async () => {
                // Set mock properties directly
                mockSummaryService.selectedRoleText = 'You are a recruiting assistant.';
                mockSummaryService.selectedPresetId = 'recruiting';

                const llmClient = require('../../../src/features/common/ai/llmClient');
                llmClient.stream.mockResolvedValueOnce({
                    headers: new Map(),
                    body: {
                        getReader: () => ({
                            read: async () => ({ done: true, value: undefined }),
                        }),
                    },
                });

                askService.state.useScreenCapture = false;

                await askService.sendMessage('📝 Show summary', ['me: candidate looks great'], 'recruiting', false);

                const callArgs = llmClient.stream.mock.calls[0][0];
                expect(callArgs).not.toHaveProperty('role');
            });
        });

        describe('Whisper Profile (Generic Chatbot)', () => {
            test('excludes role from payload for whisper profile', async () => {
                // Set mock properties directly
                mockSummaryService.selectedRoleText = 'You are a sales assistant.';

                const llmClient = require('../../../src/features/common/ai/llmClient');
                llmClient.stream.mockResolvedValueOnce({
                    headers: new Map(),
                    body: {
                        getReader: () => ({
                            read: async () => ({ done: true, value: undefined }),
                        }),
                    },
                });

                askService.state.useScreenCapture = false;
                askService._forceDefaultProfileOnce = true;

                await askService.sendMessage('Generic question', ['me: some context'], null, false);

                const callArgs = llmClient.stream.mock.calls[0][0];
                expect(callArgs).not.toHaveProperty('role');
                expect(callArgs.profile).toBe('whisper');
            });

            test('includes transcript but excludes role for whisper profile', async () => {
                // Set mock properties directly
                mockSummaryService.selectedRoleText = 'You are a sales assistant.';

                const llmClient = require('../../../src/features/common/ai/llmClient');
                llmClient.stream.mockResolvedValueOnce({
                    headers: new Map(),
                    body: {
                        getReader: () => ({
                            read: async () => ({ done: true, value: undefined }),
                        }),
                    },
                });

                askService.state.useScreenCapture = false;
                askService._forceDefaultProfileOnce = true;

                await askService.sendMessage('Help me', ['me: conversation history'], null, false);

                const callArgs = llmClient.stream.mock.calls[0][0];
                expect(callArgs).not.toHaveProperty('role');
                expect(callArgs.context).toHaveProperty('transcript');
                expect(callArgs.context.transcript).toContain('conversation history');
            });
        });

        describe('Edge Cases', () => {
            test('handles empty roleContext (no role sent even for action intents)', async () => {
                // Set mock properties directly (empty role)
                mockSummaryService.selectedRoleText = '';
                mockSummaryService.selectedPresetId = 'sales';

                const llmClient = require('../../../src/features/common/ai/llmClient');
                llmClient.stream.mockResolvedValueOnce({
                    headers: new Map(),
                    body: {
                        getReader: () => ({
                            read: async () => ({ done: true, value: undefined }),
                        }),
                    },
                });

                askService.state.useScreenCapture = false;

                await askService.sendMessage('✨ What should I say next?', [], 'sales', false);

                const callArgs = llmClient.stream.mock.calls[0][0];
                expect(callArgs).not.toHaveProperty('role');
            });

            test('includes both role and previousItems in payload', async () => {
                // Set mock properties directly
                mockSummaryService.selectedRoleText = 'You are a sales assistant.';
                mockSummaryService.selectedPresetId = 'sales';
                mockSummaryService.getCurrentContext.mockReturnValue({
                    definedTerms: ['API', 'SaaS'],
                    detectedQuestions: ['What is the pricing?'],
                    analysisProfile: 'sales_analysis',
                });

                const llmClient = require('../../../src/features/common/ai/llmClient');
                llmClient.stream.mockResolvedValueOnce({
                    headers: new Map(),
                    body: {
                        getReader: () => ({
                            read: async () => ({ done: true, value: undefined }),
                        }),
                    },
                });

                askService.state.useScreenCapture = false;

                await askService.sendMessage('✨ What should I say next?', ['me: hi', 'them: hello'], 'sales', false);

                const callArgs = llmClient.stream.mock.calls[0][0];
                expect(callArgs.role).toBe('You are a sales assistant.');
                expect(callArgs.context.previousItems).toContain('📘 Define API');
                expect(callArgs.context.previousItems).toContain('📘 Define SaaS');
                expect(callArgs.context.previousItems).toContain('❓ What is the pricing?');
            });
        });
    });
});
