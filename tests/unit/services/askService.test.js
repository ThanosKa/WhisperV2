const { describe, test, expect, beforeEach } = require('@jest/globals');

jest.mock('../../../src/features/common/ai/llmClient', () => require('../../mocks/llmClient.mock'));
jest.mock('../../../src/features/common/repositories/session', () => require('../../mocks/database.mock').sessionRepository);
jest.mock('../../../src/features/ask/repositories', () => require('../../mocks/database.mock').askRepository);

// Mock listenService for toggleAskButton tests
jest.mock('../../../src/features/listen/listenService', () => ({
    getConversationHistory: jest.fn(() => []),
    getCurrentSessionData: jest.fn(() => ({ sessionId: 'test-session-id' })),
}));

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
});
