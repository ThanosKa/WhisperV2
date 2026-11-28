import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { firstStreamPayload, stream } from '../../mocks/llmClient.mock';
import { electronMock } from '../../setup/electronMocks';

// Mutable objects, so test changes are visible to the code under test.
const { mockSummaryService, listenServiceMock, askWindow, headerWindow } = vi.hoisted(() => {
    const createMockWindow = () => ({
        isDestroyed: vi.fn(() => false),
        isVisible: vi.fn(() => true),
        webContents: {
            send: vi.fn(),
            isDestroyed: vi.fn(() => false),
        },
    });

    return {
        mockSummaryService: {
            selectedRoleText: '',
            selectedPresetId: null as string | null,
            getCurrentContext: vi.fn(() => ({
                definedTerms: [] as string[],
                detectedQuestions: [] as string[],
                analysisProfile: 'meeting_analysis',
            })),
        },
        listenServiceMock: {
            getConversationHistory: vi.fn((): string[] => []),
            getCurrentSessionData: vi.fn(() => ({ sessionId: 'test-session-id' })),
        },
        askWindow: createMockWindow(),
        headerWindow: createMockWindow(),
    };
});

vi.mock('../../../src/main/features/common/ai/llmClient', () => import('../../mocks/llmClient.mock'));
vi.mock('../../../src/main/features/common/repositories/session', async () => ({
    default: (await import('../../mocks/database.mock')).repositoryMocks.sessionRepository,
}));
vi.mock('../../../src/main/features/ask/repositories', async () => ({
    default: (await import('../../mocks/database.mock')).repositoryMocks.askRepository,
}));
vi.mock('../../../src/main/features/listen/listenService', () => ({ default: listenServiceMock }));
vi.mock('../../../src/main/features/listen/summary/summaryService', () => ({ default: mockSummaryService }));
vi.mock('../../../src/main/window/windowManager', () => ({
    windowPool: new Map([
        ['ask', askWindow],
        ['header', headerWindow],
    ]),
}));

describe('AskService', () => {
    let askService: typeof import('../../../src/main/features/ask/askService').default;

    beforeEach(async () => {
        vi.clearAllMocks();
        vi.resetModules();

        // Reset mockSummaryService properties for test isolation
        mockSummaryService.selectedRoleText = '';
        mockSummaryService.selectedPresetId = null;
        mockSummaryService.getCurrentContext.mockReturnValue({
            definedTerms: [],
            detectedQuestions: [],
            analysisProfile: 'meeting_analysis',
        });

        askService = (await import('../../../src/main/features/ask/askService')).default;
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
            const abortSpy = vi.spyOn(askService.abortController, 'abort');
            askService.state.isStreaming = true;
            askService.state.interrupted = false;

            askService.interruptStream();

            expect(abortSpy).toHaveBeenCalledWith('User interrupted');
            expect(askService.state.isStreaming).toBe(false);
            expect(askService.state.interrupted).toBe(true);
        });
    });

    describe('useScreenCapture', () => {
        let originalPlatform: NodeJS.Platform;

        beforeEach(() => {
            vi.clearAllMocks();
            // These tests run the non-darwin path, which captures the screen through desktopCapturer.
            electronMock.desktopCapturer.getSources.mockImplementation(async () => [
                {
                    id: 'screen:0:0',
                    name: 'Screen 1',
                    display_id: '0',
                    thumbnail: {
                        toJPEG: vi.fn(() => Buffer.from('mock-image-data')),
                        getSize: vi.fn(() => ({ width: 1920, height: 1080 })),
                    },
                },
            ]);

            // Store original platform
            originalPlatform = process.platform;
        });

        afterEach(() => {
            Object.defineProperty(process, 'platform', {
                value: originalPlatform,
                writable: true,
            });
            vi.restoreAllMocks();
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

            // Mock stream to avoid actual API call
            stream.mockResolvedValueOnce({
                headers: new Map(),
                body: {
                    getReader: () => ({
                        read: async () => ({ done: true, value: undefined }),
                    }),
                },
            });

            await askService.sendMessage('Test prompt', [], null, true);

            expect(electronMock.desktopCapturer.getSources).toHaveBeenCalled();
        });

        test('sendMessage captures screenshot when useScreenCapture=true and prompt is "Assist me"', async () => {
            Object.defineProperty(process, 'platform', {
                value: 'linux',
                writable: true,
            });

            askService._forceDefaultProfileOnce = false;
            askService.state.useScreenCapture = true;

            stream.mockResolvedValueOnce({
                headers: new Map(),
                body: {
                    getReader: () => ({
                        read: async () => ({ done: true, value: undefined }),
                    }),
                },
            });

            await askService.sendMessage('Assist me', [], null, true);

            expect(electronMock.desktopCapturer.getSources).toHaveBeenCalled();
        });

        test('sendMessage does not capture screenshot when useScreenCapture=false even with "Assist me"', async () => {
            Object.defineProperty(process, 'platform', {
                value: 'linux',
                writable: true,
            });

            askService._forceDefaultProfileOnce = false;
            askService.state.useScreenCapture = false;

            stream.mockResolvedValueOnce({
                headers: new Map(),
                body: {
                    getReader: () => ({
                        read: async () => ({ done: true, value: undefined }),
                    }),
                },
            });

            await askService.sendMessage('Assist me', [], null, false);

            expect(electronMock.desktopCapturer.getSources).not.toHaveBeenCalled();
        });

        test('sendMessage does not capture screenshot when useScreenCapture=false even with forceDefaultProfileOnce=true', async () => {
            Object.defineProperty(process, 'platform', {
                value: 'linux',
                writable: true,
            });

            askService._forceDefaultProfileOnce = true;
            askService.state.useScreenCapture = false;

            stream.mockResolvedValueOnce({
                headers: new Map(),
                body: {
                    getReader: () => ({
                        read: async () => ({ done: true, value: undefined }),
                    }),
                },
            });

            await askService.sendMessage('Test prompt', [], null, false);

            expect(electronMock.desktopCapturer.getSources).not.toHaveBeenCalled();
        });

        test('sendMessage does not capture screenshot for regular prompts when useScreenCapture=false', async () => {
            Object.defineProperty(process, 'platform', {
                value: 'linux',
                writable: true,
            });

            askService._forceDefaultProfileOnce = false;
            askService.state.useScreenCapture = false;

            stream.mockResolvedValueOnce({
                headers: new Map(),
                body: {
                    getReader: () => ({
                        read: async () => ({ done: true, value: undefined }),
                    }),
                },
            });

            await askService.sendMessage('What is the weather?', [], null, false);

            expect(electronMock.desktopCapturer.getSources).not.toHaveBeenCalled();
        });

        test('toggleAskButton respects state.useScreenCapture when sending "Assist me"', async () => {
            Object.defineProperty(process, 'platform', {
                value: 'linux',
                writable: true,
            });

            listenServiceMock.getConversationHistory.mockReturnValue([]);

            askService.state.useScreenCapture = false;
            askService.state.showTextInput = true;

            stream.mockResolvedValueOnce({
                headers: new Map(),
                body: {
                    getReader: () => ({
                        read: async () => ({ done: true, value: undefined }),
                    }),
                },
            });

            await askService.toggleAskButton(true);

            expect(electronMock.desktopCapturer.getSources).not.toHaveBeenCalled();
        });

        test('toggleAskButton captures screenshot when state.useScreenCapture=true', async () => {
            Object.defineProperty(process, 'platform', {
                value: 'linux',
                writable: true,
            });

            listenServiceMock.getConversationHistory.mockReturnValue([]);

            askService.state.useScreenCapture = true;
            askService.state.showTextInput = true;

            stream.mockResolvedValueOnce({
                headers: new Map(),
                body: {
                    getReader: () => ({
                        read: async () => ({ done: true, value: undefined }),
                    }),
                },
            });

            await askService.toggleAskButton(true);

            expect(electronMock.desktopCapturer.getSources).toHaveBeenCalled();
        });
    });

    describe('Role Context Passing', () => {
        describe('_resolveProfileForIntent - shouldIncludeRole flag', () => {
            test('returns shouldIncludeRole=true for next intent', () => {
                const result = askService._resolveProfileForIntent('next', 'sales');
                expect(result).toHaveProperty('shouldIncludeRole', true);
                expect(result.profileToUse).toBe('sales_next');
            });

            test('returns shouldIncludeRole=true for email intent', () => {
                const result = askService._resolveProfileForIntent('email', 'recruiting');
                expect(result).toHaveProperty('shouldIncludeRole', true);
                expect(result.profileToUse).toBe('recruiting_email');
            });

            test('returns shouldIncludeRole=false for define intent', () => {
                const result = askService._resolveProfileForIntent('define', 'sales');
                expect(result).toHaveProperty('shouldIncludeRole', false);
                expect(result.useConversationContext).toBe(false);
            });

            test('returns shouldIncludeRole=false for recap intent', () => {
                const result = askService._resolveProfileForIntent('recap', 'meeting');
                expect(result).toHaveProperty('shouldIncludeRole', false);
            });

            test('returns shouldIncludeRole=false for summary intent', () => {
                const result = askService._resolveProfileForIntent('summary', 'sales');
                expect(result).toHaveProperty('shouldIncludeRole', false);
            });
        });

        describe('Payload Construction - Role Inclusion', () => {
            test('includes role in payload for next intent with sales preset', async () => {
                // Set mock properties directly
                mockSummaryService.selectedRoleText = 'You are a sales assistant helping sell CRM software.';
                mockSummaryService.selectedPresetId = 'sales';

                stream.mockResolvedValueOnce({
                    headers: new Map(),
                    body: {
                        getReader: () => ({
                            read: async () => ({ done: true, value: undefined }),
                        }),
                    },
                });

                askService.state.useScreenCapture = false;

                await askService.sendMessage('✨ What should I say next?', ['me: hi', 'them: hello'], 'sales', false);

                expect(stream).toHaveBeenCalledWith(
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

                stream.mockResolvedValueOnce({
                    headers: new Map(),
                    body: {
                        getReader: () => ({
                            read: async () => ({ done: true, value: undefined }),
                        }),
                    },
                });

                askService.state.useScreenCapture = false;

                await askService.sendMessage('✉️ Draft a follow-up email', ['me: interview went well'], 'recruiting', false);

                expect(stream).toHaveBeenCalledWith(
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

                stream.mockResolvedValueOnce({
                    headers: new Map(),
                    body: {
                        getReader: () => ({
                            read: async () => ({ done: true, value: undefined }),
                        }),
                    },
                });

                askService.state.useScreenCapture = false;

                await askService.sendMessage('📘 Define API', [], 'sales', false);

                const callArgs = firstStreamPayload();
                expect(callArgs).not.toHaveProperty('role');
                expect(callArgs.profile).toBe('sales_define');
            });

            test('excludes role from payload for recap intent', async () => {
                // Set mock properties directly
                mockSummaryService.selectedRoleText = 'You are a sales assistant.';
                mockSummaryService.selectedPresetId = 'sales';

                stream.mockResolvedValueOnce({
                    headers: new Map(),
                    body: {
                        getReader: () => ({
                            read: async () => ({ done: true, value: undefined }),
                        }),
                    },
                });

                askService.state.useScreenCapture = false;

                await askService.sendMessage('🗒️ Recap meeting so far', ['me: discussed pricing'], 'sales', false);

                const callArgs = firstStreamPayload();
                expect(callArgs).not.toHaveProperty('role');
                expect(callArgs.profile).toBe('sales_recap');
            });

            test('excludes role from payload for summary intent', async () => {
                // Set mock properties directly
                mockSummaryService.selectedRoleText = 'You are a recruiting assistant.';
                mockSummaryService.selectedPresetId = 'recruiting';

                stream.mockResolvedValueOnce({
                    headers: new Map(),
                    body: {
                        getReader: () => ({
                            read: async () => ({ done: true, value: undefined }),
                        }),
                    },
                });

                askService.state.useScreenCapture = false;

                await askService.sendMessage('📝 Show summary', ['me: candidate looks great'], 'recruiting', false);

                const callArgs = firstStreamPayload();
                expect(callArgs).not.toHaveProperty('role');
            });
        });

        describe('Whisper Profile (Generic Chatbot)', () => {
            test('excludes role from payload for whisper profile', async () => {
                // Set mock properties directly
                mockSummaryService.selectedRoleText = 'You are a sales assistant.';

                stream.mockResolvedValueOnce({
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

                const callArgs = firstStreamPayload();
                expect(callArgs).not.toHaveProperty('role');
                expect(callArgs.profile).toBe('whisper');
            });

            test('includes transcript but excludes role for whisper profile', async () => {
                // Set mock properties directly
                mockSummaryService.selectedRoleText = 'You are a sales assistant.';

                stream.mockResolvedValueOnce({
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

                const callArgs = firstStreamPayload();
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

                stream.mockResolvedValueOnce({
                    headers: new Map(),
                    body: {
                        getReader: () => ({
                            read: async () => ({ done: true, value: undefined }),
                        }),
                    },
                });

                askService.state.useScreenCapture = false;

                await askService.sendMessage('✨ What should I say next?', [], 'sales', false);

                const callArgs = firstStreamPayload();
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

                stream.mockResolvedValueOnce({
                    headers: new Map(),
                    body: {
                        getReader: () => ({
                            read: async () => ({ done: true, value: undefined }),
                        }),
                    },
                });

                askService.state.useScreenCapture = false;

                await askService.sendMessage('✨ What should I say next?', ['me: hi', 'them: hello'], 'sales', false);

                const callArgs = firstStreamPayload();
                expect(callArgs.role).toBe('You are a sales assistant.');
                expect(callArgs.context.previousItems).toContain('📘 Define API');
                expect(callArgs.context.previousItems).toContain('📘 Define SaaS');
                expect(callArgs.context.previousItems).toContain('❓ What is the pricing?');
            });
        });
    });
});
