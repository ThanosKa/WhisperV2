import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
    createSearchStreamReader,
    createSequentialSearchStream,
    createSimpleSearchStream,
    firstStreamPayload,
    stream,
} from '../../mocks/llmClient.mock';

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

describe('AskService - Web Search Integration', () => {
    let askService: typeof import('../../../src/main/features/ask/askService').default;

    beforeEach(async () => {
        vi.clearAllMocks();
        vi.resetModules();

        // Reset mockSummaryService properties
        mockSummaryService.selectedRoleText = '';
        mockSummaryService.selectedPresetId = null;
        mockSummaryService.getCurrentContext.mockReturnValue({
            definedTerms: [],
            detectedQuestions: [],
            analysisProfile: 'meeting_analysis',
        });

        askService = (await import('../../../src/main/features/ask/askService')).default;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('Payload Construction for Web Search', () => {
        test('includes forceSearch=true when webSearchEnabled=true', async () => {
            stream.mockResolvedValueOnce({
                headers: new Map(),
                body: {
                    getReader: () => createSimpleSearchStream(),
                },
            });

            askService.state.useScreenCapture = false; // Disable screenshot to simplify test

            await askService.sendMessage('What is Apple stock price?', [], null, false, true); // webSearchEnabled=true

            expect(stream).toHaveBeenCalled();
            const callArgs = firstStreamPayload();
            expect(callArgs).toHaveProperty('forceSearch', true);
        });

        test('includes forceSearch=true when prompt starts with "🌐 Search:"', async () => {
            stream.mockResolvedValueOnce({
                headers: new Map(),
                body: {
                    getReader: () => createSimpleSearchStream(),
                },
            });

            askService.state.useScreenCapture = false;

            await askService.sendMessage('🌐 Search: Latest Stock Price | AAPL stock price', [], null, false, false);

            expect(stream).toHaveBeenCalled();
            const callArgs = firstStreamPayload();
            expect(callArgs).toHaveProperty('forceSearch', true);
        });

        test('parses suggested search format: "🌐 Search: Label | Query"', async () => {
            stream.mockResolvedValueOnce({
                headers: new Map(),
                body: {
                    getReader: () => createSimpleSearchStream(),
                },
            });

            askService.state.useScreenCapture = false;

            await askService.sendMessage('🌐 Search: Latest Stock Price | AAPL stock price December 2025', [], null, false, false);

            expect(stream).toHaveBeenCalled();
            const callArgs = firstStreamPayload();

            // The userContent should be the query part (after |)
            expect(callArgs.userContent).toBe('AAPL stock price December 2025');
            expect(callArgs.forceSearch).toBe(true);
        });

        test('omits forceSearch when webSearchEnabled=false and not suggested search', async () => {
            stream.mockResolvedValueOnce({
                headers: new Map(),
                body: {
                    getReader: () => createSimpleSearchStream(),
                },
            });

            askService.state.useScreenCapture = false;

            await askService.sendMessage('What is the weather?', [], null, false, false); // webSearchEnabled=false

            expect(stream).toHaveBeenCalled();
            const callArgs = firstStreamPayload();
            expect(callArgs).not.toHaveProperty('forceSearch');
        });
    });

    describe('SSE Event Parsing from Server', () => {
        test('handles {status: "searching"} event: sets isSearching=true', async () => {
            stream.mockResolvedValueOnce({
                headers: new Map(),
                body: {
                    getReader: () =>
                        createSearchStreamReader([
                            'data: {"status":"searching"}\n',
                            'data: [DONE]\n', // End without content to preserve isSearching state
                        ]),
                },
            });

            askService.state.useScreenCapture = false;

            await askService.sendMessage('Test search', [], null, false, true);

            // Verify isSearching was set to true at some point
            // Check IPC broadcasts for search state
            const stateBroadcasts = askWindow.webContents.send.mock.calls.filter(call => call[0] === 'ask:stateUpdate').map(call => call[1]);

            const searchingState = stateBroadcasts.find(state => state.isSearching === true);
            expect(searchingState).toBeDefined();
        });

        test('handles {status: "searching", query: "..."} event: updates searchQuery', async () => {
            stream.mockResolvedValueOnce({
                headers: new Map(),
                body: {
                    getReader: () =>
                        createSearchStreamReader([
                            'data: {"status":"searching","query":"Apple stock"}\n',
                            'data: [DONE]\n', // End without content to preserve search state
                        ]),
                },
            });

            askService.state.useScreenCapture = false;

            await askService.sendMessage('Test search', [], null, false, true);

            // Check IPC broadcasts for searchQuery
            const stateBroadcasts = askWindow.webContents.send.mock.calls.filter(call => call[0] === 'ask:stateUpdate').map(call => call[1]);

            const queryState = stateBroadcasts.find(state => state.searchQuery === 'Apple stock');
            expect(queryState).toBeDefined();
            expect(queryState.isSearching).toBe(true);
        });

        test('handles {citations: [...]} event: stores citations, sets isSearching=false', async () => {
            const mockCitations = [
                { url: 'https://example.com', title: 'Example Source' },
                { url: 'https://test.com', title: 'Test Source' },
            ];

            stream.mockResolvedValueOnce({
                headers: new Map(),
                body: {
                    getReader: () =>
                        createSearchStreamReader([
                            'data: {"status":"searching"}\n',
                            'data: {"choices":[{"delta":{"content":"Result"}}]}\n',
                            `data: {"citations":${JSON.stringify(mockCitations)}}\n`,
                            'data: [DONE]\n',
                        ]),
                },
            });

            askService.state.useScreenCapture = false;

            await askService.sendMessage('Test search', [], null, false, true);

            // Check final state has citations and isSearching=false
            const stateBroadcasts = askWindow.webContents.send.mock.calls.filter(call => call[0] === 'ask:stateUpdate').map(call => call[1]);

            const citationState = stateBroadcasts.find(state => state.citations && state.citations.length > 0);
            expect(citationState).toBeDefined();
            expect(citationState.citations).toEqual(mockCitations);
            expect(citationState.isSearching).toBe(false);
            expect(citationState.searchCompleted).toBe(true);
        });

        test('handles content tokens after searching: transitions to searchCompleted=true', async () => {
            stream.mockResolvedValueOnce({
                headers: new Map(),
                body: {
                    getReader: () =>
                        createSearchStreamReader([
                            'data: {"status":"searching"}\n',
                            'data: {"choices":[{"delta":{"content":"Apple"}}]}\n',
                            'data: {"choices":[{"delta":{"content":" stock"}}]}\n',
                            'data: [DONE]\n',
                        ]),
                },
            });

            askService.state.useScreenCapture = false;

            await askService.sendMessage('Test search', [], null, false, true);

            // After content arrives, isSearching should transition to false
            const stateBroadcasts = askWindow.webContents.send.mock.calls.filter(call => call[0] === 'ask:stateUpdate').map(call => call[1]);

            // Find state after content started streaming
            const contentState = stateBroadcasts.find(state => state.currentResponse && state.currentResponse.includes('Apple'));
            expect(contentState).toBeDefined();

            // Eventually searchCompleted should be true
            const completedState = stateBroadcasts.find(state => state.searchCompleted === true);
            expect(completedState).toBeDefined();
        });

        test('broadcasts state updates via _broadcastState() after each event', async () => {
            stream.mockResolvedValueOnce({
                headers: new Map(),
                body: {
                    getReader: () =>
                        createSearchStreamReader([
                            'data: {"status":"searching"}\n',
                            'data: {"status":"searching","query":"test query"}\n',
                            'data: [DONE]\n', // No content to preserve search state
                        ]),
                },
            });

            askService.state.useScreenCapture = false;

            await askService.sendMessage('Test search', [], null, false, true);

            // Verify IPC was called multiple times with ask:stateUpdate
            const stateUpdateCalls = askWindow.webContents.send.mock.calls.filter(call => call[0] === 'ask:stateUpdate');

            expect(stateUpdateCalls.length).toBeGreaterThan(0);

            // Verify we see searching state
            const states = stateUpdateCalls.map(call => call[1]);
            const hasSearchingState = states.some(state => state.isSearching === true);
            expect(hasSearchingState).toBe(true);
        });
    });

    describe('Sequential Searches (ReAct Loop)', () => {
        test('handles multiple {status: "searching"} events in single stream', async () => {
            let searchEventCount = 0;

            stream.mockResolvedValueOnce({
                headers: new Map(),
                body: {
                    getReader: () => {
                        const reader = createSearchStreamReader([
                            'data: {"status":"searching","query":"TSLA stock"}\n',
                            'data: {"choices":[{"delta":{"content":"Tesla at $481. "}}]}\n',
                            'data: {"status":"searching","query":"Tesla AI news"}\n',
                            'data: {"choices":[{"delta":{"content":"Tesla announced..."}}]}\n',
                            'data: [DONE]\n',
                        ]);

                        // Wrap reader to count search events
                        const originalRead = reader.read;
                        reader.read = async function () {
                            const result = await originalRead.call(this);
                            if (!result.done && result.value) {
                                const text = new TextDecoder().decode(result.value);
                                if (text.includes('"status":"searching"')) {
                                    searchEventCount++;
                                }
                            }
                            return result;
                        };

                        return reader;
                    },
                },
            });

            askService.state.useScreenCapture = false;

            await askService.sendMessage('Tell me about Tesla', [], null, false, true);

            // Verify that we received multiple searching events
            expect(searchEventCount).toBeGreaterThanOrEqual(2);

            // Final searchQuery should be the last one
            expect(askService.state.searchQuery).toBe('Tesla AI news');
        });

        test('accumulates content between multiple searches without clearing', async () => {
            stream.mockResolvedValueOnce({
                headers: new Map(),
                body: {
                    getReader: () => createSequentialSearchStream(),
                },
            });

            askService.state.useScreenCapture = false;

            await askService.sendMessage('Tell me about Tesla', [], null, false, true);

            // Final state should have accumulated content from both searches
            expect(askService.state.currentResponse).toContain('Tesla at $481');
            expect(askService.state.currentResponse).toContain('Tesla announced');
        });

        test('rejects query if it is not a string (defensive check)', async () => {
            stream.mockResolvedValueOnce({
                headers: new Map(),
                body: {
                    getReader: () =>
                        createSearchStreamReader([
                            'data: {"status":"searching","query":{"entire":"json"}}\n', // Invalid: object instead of string
                            'data: {"choices":[{"delta":{"content":"Result"}}]}\n',
                            'data: [DONE]\n',
                        ]),
                },
            });

            askService.state.useScreenCapture = false;

            await askService.sendMessage('Test search', [], null, false, true);

            // Verify searchQuery was NOT set to the invalid object
            // It should remain null (unchanged) when invalid query is received
            expect(askService.state.searchQuery).toBeNull();
        });

        test('final citations array includes all sources from all searches', async () => {
            // Custom stream with multiple citations from different searches
            stream.mockResolvedValueOnce({
                headers: new Map(),
                body: {
                    getReader: () =>
                        createSearchStreamReader([
                            'data: {"status":"searching","query":"First query"}\n',
                            'data: {"choices":[{"delta":{"content":"First result. "}}]}\n',
                            'data: {"status":"searching","query":"Second query"}\n',
                            'data: {"choices":[{"delta":{"content":"Second result."}}]}\n',
                            'data: {"citations":[{"url":"https://a.com","title":"Source A"},{"url":"https://b.com","title":"Source B"}]}\n',
                            'data: [DONE]\n',
                        ]),
                },
            });

            askService.state.useScreenCapture = false;

            await askService.sendMessage('Complex query', [], null, false, true);

            // Final citations should include all sources
            expect(askService.state.citations).toHaveLength(2);
            expect(askService.state.citations).toHaveProperty('0.url', 'https://a.com');
            expect(askService.state.citations).toHaveProperty('1.url', 'https://b.com');
        });
    });
});
