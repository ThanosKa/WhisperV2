const { describe, test, expect, beforeEach, jest: jestModule } = require('@jest/globals');

const mockSessionRepo = {
    findLatestUnfinishedListen: jestModule.fn(),
};

const mockTranscriptRepo = {
    getAllTranscriptsBySessionId: jestModule.fn(),
};

const mockInsightsRepo = {
    getAllInsightsBySessionId: jestModule.fn(),
    getLatestInsightBySessionId: jestModule.fn(),
};

const mockAuthService = {
    getCurrentUserId: jestModule.fn(() => 'test-user-id'),
};

jestModule.mock('../../../src/features/common/repositories/session', () => ({
    findLatestUnfinishedListen: () => mockSessionRepo.findLatestUnfinishedListen(),
}));

jestModule.mock('../../../src/features/common/services/authService', () => mockAuthService);

jestModule.mock('../../../src/features/listen/stt/repositories', () => ({
    getAllTranscriptsBySessionId: sessionId => mockTranscriptRepo.getAllTranscriptsBySessionId(sessionId),
}));

jestModule.mock('../../../src/features/listen/summary/repositories', () => ({
    getAllInsightsBySessionId: sessionId => mockInsightsRepo.getAllInsightsBySessionId(sessionId),
    getLatestInsightBySessionId: sessionId => mockInsightsRepo.getLatestInsightBySessionId(sessionId),
}));

jestModule.mock('../../../src/features/listen/stt/sttService', () =>
    jestModule.fn().mockImplementation(() => ({
        setCallbacks: jestModule.fn(),
        initializeSttSessions: jestModule.fn(async () => true),
    }))
);

const mockSummaryService = {
    setCallbacks: jestModule.fn(),
    setSessionId: jestModule.fn(),
    hydrateConversation: jestModule.fn(),
    hydrateInsights: jestModule.fn(),
    selectedPresetId: 'meeting',
};

jestModule.mock('../../../src/features/listen/summary/summaryService', () => mockSummaryService);

const mockWindow = {
    isDestroyed: jestModule.fn(() => false),
    webContents: { send: jestModule.fn() },
};

jestModule.mock('../../../src/window/windowManager', () => ({
    windowPool: {
        get: jestModule.fn(() => mockWindow),
    },
}));

describe('Crash Recovery - Insights Recovery', () => {
    let listenService;

    beforeEach(() => {
        jestModule.clearAllMocks();
        listenService = require('../../../src/features/listen/listenService');
        listenService.strandedSession = null;
        listenService.isRecoveryDismissed = false;
        listenService.currentSessionId = null;
        mockAuthService.getCurrentUserId.mockReturnValue('test-user-id');

        const windowManager = require('../../../src/window/windowManager');
        windowManager.windowPool.get.mockImplementation(() => mockWindow);
        mockWindow.isDestroyed.mockReturnValue(false);

        const SttService = require('../../../src/features/listen/stt/sttService');
        SttService.mockImplementation(() => ({
            setCallbacks: jestModule.fn(),
            initializeSttSessions: jestModule.fn(async () => true),
        }));
    });

    test('should recover single insight round', async () => {
        const session = {
            id: 'session-123',
            uid: 'test-user-id',
            session_type: 'listen',
            started_at: Date.now(),
            ended_at: null,
        };

        const transcripts = [{ id: 1, speaker: 'User', text: 'Test', timestamp: 1000 }];
        const insights = [
            {
                id: 'insight-1',
                analysis_round: 1,
                created_at: 1000,
                payload: { summary: ['Summary point'], actions: [] },
            },
        ];

        mockSessionRepo.findLatestUnfinishedListen.mockReturnValue(session);
        mockTranscriptRepo.getAllTranscriptsBySessionId.mockResolvedValue(transcripts);
        mockInsightsRepo.getAllInsightsBySessionId.mockReturnValue(insights);

        const result = await listenService.findStrandedSession();

        expect(result).not.toBeNull();
        expect(result.insights).toHaveLength(1);
        expect(result.insights[0].payload.summary).toHaveLength(1);
    });

    test('should recover ALL insight rounds (not just latest)', async () => {
        const session = {
            id: 'session-123',
            uid: 'test-user-id',
            session_type: 'listen',
            started_at: Date.now(),
            ended_at: null,
        };

        const transcripts = [{ id: 1, speaker: 'User', text: 'Test', timestamp: 1000 }];
        const insights = [
            {
                id: 'insight-1',
                analysis_round: 1,
                created_at: 1000,
                payload: { summary: ['A'], actions: [] },
            },
            {
                id: 'insight-2',
                analysis_round: 2,
                created_at: 2000,
                payload: { summary: ['A', 'B'], actions: [{ id: 'a1' }] },
            },
            {
                id: 'insight-3',
                analysis_round: 3,
                created_at: 3000,
                payload: { summary: ['A', 'B', 'C'], actions: [{ id: 'a1' }, { id: 'a2' }] },
            },
        ];

        mockSessionRepo.findLatestUnfinishedListen.mockReturnValue(session);
        mockTranscriptRepo.getAllTranscriptsBySessionId.mockResolvedValue(transcripts);
        mockInsightsRepo.getAllInsightsBySessionId.mockReturnValue(insights);

        const result = await listenService.findStrandedSession();

        expect(result.insights).toHaveLength(3);
        expect(result.insights[0].payload.summary).toHaveLength(1);
        expect(result.insights[2].payload.summary).toHaveLength(3);
    });

    test('should send insights to UI in correct order', async () => {
        const session = {
            id: 'session-123',
            uid: 'test-user-id',
            session_type: 'listen',
            started_at: Date.now(),
            ended_at: null,
        };

        const transcripts = [{ id: 1, speaker: 'User', text: 'Test', timestamp: 1000 }];
        const insights = [
            {
                id: 'insight-1',
                analysis_round: 1,
                created_at: 1000,
                payload: { summary: ['First'], actions: [] },
            },
            {
                id: 'insight-2',
                analysis_round: 2,
                created_at: 2000,
                payload: { summary: ['Second'], actions: [{ id: 'a1' }] },
            },
        ];

        mockSessionRepo.findLatestUnfinishedListen.mockReturnValue(session);
        mockTranscriptRepo.getAllTranscriptsBySessionId.mockResolvedValue(transcripts);
        mockInsightsRepo.getAllInsightsBySessionId.mockReturnValue(insights);

        listenService.strandedSession = await listenService.findStrandedSession();
        await listenService.resumeStrandedSession();

        const summaryCalls = mockWindow.webContents.send.mock.calls.filter(call => call[0] === 'summary-update');
        expect(summaryCalls).toHaveLength(2);
        expect(summaryCalls[0][1]).toMatchObject({ summary: ['First'] });
        expect(summaryCalls[1][1]).toMatchObject({ summary: ['Second'] });
    });

    test('should hydrate insights in backend (summaryService state)', async () => {
        const session = {
            id: 'session-123',
            uid: 'test-user-id',
            session_type: 'listen',
            started_at: Date.now(),
            ended_at: null,
        };

        const transcripts = [{ id: 1, speaker: 'User', text: 'Test', timestamp: 1000 }];
        const insights = [
            {
                id: 'insight-1',
                analysis_round: 1,
                created_at: 1000,
                payload: { summary: ['Test summary'], actions: [{ id: 'a1' }] },
            },
        ];

        mockSessionRepo.findLatestUnfinishedListen.mockReturnValue(session);
        mockTranscriptRepo.getAllTranscriptsBySessionId.mockResolvedValue(transcripts);
        mockInsightsRepo.getAllInsightsBySessionId.mockReturnValue(insights);

        listenService.strandedSession = await listenService.findStrandedSession();
        await listenService.resumeStrandedSession();

        expect(mockSummaryService.hydrateInsights).toHaveBeenCalledWith(insights[0].payload);
    });

    test('should handle session with transcripts but NO insights', async () => {
        const session = {
            id: 'session-123',
            uid: 'test-user-id',
            session_type: 'listen',
            started_at: Date.now(),
            ended_at: null,
        };

        const transcripts = [{ id: 1, speaker: 'User', text: 'Test', timestamp: 1000 }];

        mockSessionRepo.findLatestUnfinishedListen.mockReturnValue(session);
        mockTranscriptRepo.getAllTranscriptsBySessionId.mockResolvedValue(transcripts);
        mockInsightsRepo.getAllInsightsBySessionId.mockReturnValue([]);

        const result = await listenService.findStrandedSession();

        expect(result).not.toBeNull();
        expect(result.insights).toHaveLength(0);
    });

    test('should use latest insight for backend state restoration', async () => {
        const session = {
            id: 'session-123',
            uid: 'test-user-id',
            session_type: 'listen',
            started_at: Date.now(),
            ended_at: null,
        };

        const transcripts = [{ id: 1, speaker: 'User', text: 'Test', timestamp: 1000 }];
        const insights = [
            {
                id: 'insight-1',
                analysis_round: 1,
                created_at: 1000,
                payload: { summary: ['Old'], actions: [] },
            },
            {
                id: 'insight-2',
                analysis_round: 2,
                created_at: 2000,
                payload: { summary: ['Latest'], actions: [{ id: 'a1' }] },
            },
        ];

        mockSessionRepo.findLatestUnfinishedListen.mockReturnValue(session);
        mockTranscriptRepo.getAllTranscriptsBySessionId.mockResolvedValue(transcripts);
        mockInsightsRepo.getAllInsightsBySessionId.mockReturnValue(insights);

        listenService.strandedSession = await listenService.findStrandedSession();
        await listenService.resumeStrandedSession();

        // Should hydrate the latest (last) insight
        expect(mockSummaryService.hydrateInsights).toHaveBeenCalledWith(insights[1].payload);
    });

    test('should append all insights to UI history', async () => {
        const session = {
            id: 'session-123',
            uid: 'test-user-id',
            session_type: 'listen',
            started_at: Date.now(),
            ended_at: null,
        };

        const transcripts = [{ id: 1, speaker: 'User', text: 'Test', timestamp: 1000 }];
        const insights = [
            {
                id: 'insight-1',
                analysis_round: 1,
                created_at: 1000,
                payload: { summary: ['A'], actions: [] },
            },
            {
                id: 'insight-2',
                analysis_round: 2,
                created_at: 2000,
                payload: { summary: ['B'], actions: [] },
            },
            {
                id: 'insight-3',
                analysis_round: 3,
                created_at: 3000,
                payload: { summary: ['C'], actions: [] },
            },
        ];

        mockSessionRepo.findLatestUnfinishedListen.mockReturnValue(session);
        mockTranscriptRepo.getAllTranscriptsBySessionId.mockResolvedValue(transcripts);
        mockInsightsRepo.getAllInsightsBySessionId.mockReturnValue(insights);

        listenService.strandedSession = await listenService.findStrandedSession();
        await listenService.resumeStrandedSession();

        const summaryCalls = mockWindow.webContents.send.mock.calls.filter(call => call[0] === 'summary-update');
        expect(summaryCalls).toHaveLength(3);
        expect(summaryCalls[0][1]).toMatchObject({ summary: ['A'] });
        expect(summaryCalls[1][1]).toMatchObject({ summary: ['B'] });
        expect(summaryCalls[2][1]).toMatchObject({ summary: ['C'] });
    });

    test('should recover all insights after 2nd crash including all rounds', async () => {
        const session = {
            id: 'session-123',
            uid: 'test-user-id',
            session_type: 'listen',
            started_at: Date.now(),
            ended_at: null,
        };

        const transcripts = [{ id: 1, speaker: 'User', text: 'Test', timestamp: 1000 }];
        // Simulate: crash 1 had 2 insights, crash 2 had 3 more insights
        const insights = [
            { id: '1', analysis_round: 1, created_at: 1000, payload: { summary: ['Crash1-A'], actions: [] } },
            { id: '2', analysis_round: 2, created_at: 2000, payload: { summary: ['Crash1-B'], actions: [] } },
            { id: '3', analysis_round: 3, created_at: 3000, payload: { summary: ['Crash2-A'], actions: [] } },
            { id: '4', analysis_round: 4, created_at: 4000, payload: { summary: ['Crash2-B'], actions: [] } },
            { id: '5', analysis_round: 5, created_at: 5000, payload: { summary: ['Crash2-C'], actions: [] } },
        ];

        mockSessionRepo.findLatestUnfinishedListen.mockReturnValue(session);
        mockTranscriptRepo.getAllTranscriptsBySessionId.mockResolvedValue(transcripts);
        mockInsightsRepo.getAllInsightsBySessionId.mockReturnValue(insights);

        const result = await listenService.findStrandedSession();

        expect(result.insights).toHaveLength(5);
        expect(result.insights[0].payload.summary).toEqual(['Crash1-A']);
        expect(result.insights[4].payload.summary).toEqual(['Crash2-C']);
    });

    test('should recover all insights after 3rd crash including all rounds', async () => {
        const session = {
            id: 'session-123',
            uid: 'test-user-id',
            session_type: 'listen',
            started_at: Date.now(),
            ended_at: null,
        };

        const transcripts = [{ id: 1, speaker: 'User', text: 'Test', timestamp: 1000 }];
        // Simulate: crash 1 (2), crash 2 (3), crash 3 (2) = 7 total
        const insights = [
            { id: '1', analysis_round: 1, created_at: 1000, payload: { summary: ['C1-A'], actions: [] } },
            { id: '2', analysis_round: 2, created_at: 2000, payload: { summary: ['C1-B'], actions: [] } },
            { id: '3', analysis_round: 3, created_at: 3000, payload: { summary: ['C2-A'], actions: [] } },
            { id: '4', analysis_round: 4, created_at: 4000, payload: { summary: ['C2-B'], actions: [] } },
            { id: '5', analysis_round: 5, created_at: 5000, payload: { summary: ['C2-C'], actions: [] } },
            { id: '6', analysis_round: 6, created_at: 6000, payload: { summary: ['C3-A'], actions: [] } },
            { id: '7', analysis_round: 7, created_at: 7000, payload: { summary: ['C3-B'], actions: [] } },
        ];

        mockSessionRepo.findLatestUnfinishedListen.mockReturnValue(session);
        mockTranscriptRepo.getAllTranscriptsBySessionId.mockResolvedValue(transcripts);
        mockInsightsRepo.getAllInsightsBySessionId.mockReturnValue(insights);

        const result = await listenService.findStrandedSession();

        expect(result.insights).toHaveLength(7);
        expect(result.insights[0].payload.summary).toEqual(['C1-A']);
        expect(result.insights[6].payload.summary).toEqual(['C3-B']);
    });
});
