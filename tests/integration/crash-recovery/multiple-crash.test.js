const { describe, test, expect, beforeEach, jest: jestModule } = require('@jest/globals');

const mockSessionRepo = {
    findLatestUnfinishedListen: jestModule.fn(),
    end: jestModule.fn(),
};

const mockTranscriptRepo = {
    getAllTranscriptsBySessionId: jestModule.fn(),
};

const mockInsightsRepo = {
    getAllInsightsBySessionId: jestModule.fn(),
    saveInsight: jestModule.fn(),
};

const mockAuthService = {
    getCurrentUserId: jestModule.fn(() => 'test-user-id'),
};

jestModule.mock('../../../src/features/common/repositories/session', () => ({
    findLatestUnfinishedListen: () => mockSessionRepo.findLatestUnfinishedListen(),
    end: (id) => mockSessionRepo.end(id),
}));

jestModule.mock('../../../src/features/common/services/authService', () => mockAuthService);

jestModule.mock('../../../src/features/listen/stt/repositories', () => ({
    getAllTranscriptsBySessionId: (sessionId) => mockTranscriptRepo.getAllTranscriptsBySessionId(sessionId),
}));

jestModule.mock('../../../src/features/listen/summary/repositories', () => ({
    getAllInsightsBySessionId: (sessionId) => mockInsightsRepo.getAllInsightsBySessionId(sessionId),
    saveInsight: (data) => mockInsightsRepo.saveInsight(data),
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

describe('Crash Recovery - Multiple Crash Scenarios', () => {
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

    test('should handle Crash → Resume → Continue → Crash 2 → Resume', async () => {
        const sessionId = 'session-123';
        const session = {
            id: sessionId,
            uid: 'test-user-id',
            session_type: 'listen',
            started_at: Date.now(),
            ended_at: null,
        };

        // After crash 1: 2 transcripts, 1 insight
        let transcripts = [
            { id: 1, speaker: 'User', text: 'Crash1-A', timestamp: 1000 },
            { id: 2, speaker: 'User', text: 'Crash1-B', timestamp: 2000 },
        ];
        let insights = [
            {
                id: 'insight-1',
                analysis_round: 1,
                created_at: 1000,
                payload: { summary: ['Crash1 summary'], actions: [] },
            },
        ];

        mockSessionRepo.findLatestUnfinishedListen.mockReturnValue(session);
        mockTranscriptRepo.getAllTranscriptsBySessionId.mockResolvedValue(transcripts);
        mockInsightsRepo.getAllInsightsBySessionId.mockReturnValue(insights);

        // First recovery
        const firstRecovery = await listenService.findStrandedSession();
        expect(firstRecovery.transcripts).toHaveLength(2);
        expect(firstRecovery.insights).toHaveLength(1);

        // Simulate continuing session and generating more insights
        insights.push({
            id: 'insight-2',
            analysis_round: 2,
            created_at: 2000,
            payload: { summary: ['After resume summary'], actions: [] },
        });

        // After crash 2: 4 transcripts total, 2 insights total
        transcripts = [
            ...transcripts,
            { id: 3, speaker: 'User', text: 'Crash2-A', timestamp: 3000 },
            { id: 4, speaker: 'User', text: 'Crash2-B', timestamp: 4000 },
        ];

        mockTranscriptRepo.getAllTranscriptsBySessionId.mockResolvedValue(transcripts);
        mockInsightsRepo.getAllInsightsBySessionId.mockReturnValue(insights);

        // Second recovery
        const secondRecovery = await listenService.findStrandedSession();
        expect(secondRecovery.transcripts).toHaveLength(4);
        expect(secondRecovery.insights).toHaveLength(2);
    });

    test('should recover all insights after Crash 1 (2 insights) → Crash 2 (3 more insights)', async () => {
        const session = {
            id: 'session-123',
            uid: 'test-user-id',
            session_type: 'listen',
            started_at: Date.now(),
            ended_at: null,
        };

        const transcripts = [{ id: 1, speaker: 'User', text: 'Test', timestamp: 1000 }];
        // Crash 1 had 2 insights, Crash 2 had 3 more = 5 total
        const insights = [
            { id: '1', analysis_round: 1, created_at: 1000, payload: { summary: ['C1-A'], actions: [] } },
            { id: '2', analysis_round: 2, created_at: 2000, payload: { summary: ['C1-B'], actions: [] } },
            { id: '3', analysis_round: 3, created_at: 3000, payload: { summary: ['C2-A'], actions: [] } },
            { id: '4', analysis_round: 4, created_at: 4000, payload: { summary: ['C2-B'], actions: [] } },
            { id: '5', analysis_round: 5, created_at: 5000, payload: { summary: ['C2-C'], actions: [] } },
        ];

        mockSessionRepo.findLatestUnfinishedListen.mockReturnValue(session);
        mockTranscriptRepo.getAllTranscriptsBySessionId.mockResolvedValue(transcripts);
        mockInsightsRepo.getAllInsightsBySessionId.mockReturnValue(insights);

        listenService.strandedSession = await listenService.findStrandedSession();
        await listenService.resumeStrandedSession();

        // Should send all 5 insights to UI
        const summaryUpdateCalls = mockWindow.webContents.send.mock.calls.filter(
            call => call[0] === 'summary-update'
        );
        expect(summaryUpdateCalls).toHaveLength(5);
    });

    test('should handle Crash without insights → Resume → insights generated → Crash 2 → all recovered', async () => {
        const session = {
            id: 'session-123',
            uid: 'test-user-id',
            session_type: 'listen',
            started_at: Date.now(),
            ended_at: null,
        };

        // First crash: transcripts but no insights
        let transcripts = [
            { id: 1, speaker: 'User', text: 'Before insights', timestamp: 1000 },
        ];

        mockSessionRepo.findLatestUnfinishedListen.mockReturnValue(session);
        mockTranscriptRepo.getAllTranscriptsBySessionId.mockResolvedValue(transcripts);
        mockInsightsRepo.getAllInsightsBySessionId.mockReturnValue([]);

        const firstRecovery = await listenService.findStrandedSession();
        expect(firstRecovery.insights).toHaveLength(0);

        // After resume, insights are generated
        const insights = [
            {
                id: 'insight-1',
                analysis_round: 1,
                created_at: 2000,
                payload: { summary: ['Generated after resume'], actions: [] },
            },
        ];

        // Second crash: same transcripts + new insights
        mockInsightsRepo.getAllInsightsBySessionId.mockReturnValue(insights);

        const secondRecovery = await listenService.findStrandedSession();
        expect(secondRecovery.transcripts).toHaveLength(1);
        expect(secondRecovery.insights).toHaveLength(1);
    });

    test('should handle rapid crashes (3+ in succession)', async () => {
        const session = {
            id: 'session-123',
            uid: 'test-user-id',
            session_type: 'listen',
            started_at: Date.now(),
            ended_at: null,
        };

        const transcripts = [{ id: 1, speaker: 'User', text: 'Test', timestamp: 1000 }];
        // 3 crashes = 3 insights
        const insights = [
            { id: '1', analysis_round: 1, created_at: 1000, payload: { summary: ['R1'], actions: [] } },
            { id: '2', analysis_round: 2, created_at: 2000, payload: { summary: ['R2'], actions: [] } },
            { id: '3', analysis_round: 3, created_at: 3000, payload: { summary: ['R3'], actions: [] } },
        ];

        mockSessionRepo.findLatestUnfinishedListen.mockReturnValue(session);
        mockTranscriptRepo.getAllTranscriptsBySessionId.mockResolvedValue(transcripts);
        mockInsightsRepo.getAllInsightsBySessionId.mockReturnValue(insights);

        const recovery = await listenService.findStrandedSession();
        expect(recovery.insights).toHaveLength(3);
    });

    test('should handle crash during insight generation (mid-LLM call)', async () => {
        const session = {
            id: 'session-123',
            uid: 'test-user-id',
            session_type: 'listen',
            started_at: Date.now(),
            ended_at: null,
        };

        const transcripts = [
            { id: 1, speaker: 'User', text: 'Test', timestamp: 1000 },
        ];
        // Partial insights before crash
        const insights = [
            {
                id: 'insight-1',
                analysis_round: 1,
                created_at: 1000,
                payload: { summary: ['Partial'], actions: [] },
            },
        ];

        mockSessionRepo.findLatestUnfinishedListen.mockReturnValue(session);
        mockTranscriptRepo.getAllTranscriptsBySessionId.mockResolvedValue(transcripts);
        mockInsightsRepo.getAllInsightsBySessionId.mockReturnValue(insights);

        const recovery = await listenService.findStrandedSession();
        expect(recovery.insights).toHaveLength(1);
        // Should still recover what was saved before crash
    });

    test('should handle crash during STT processing', async () => {
        const session = {
            id: 'session-123',
            uid: 'test-user-id',
            session_type: 'listen',
            started_at: Date.now(),
            ended_at: null,
        };

        // Partial transcripts before crash
        const transcripts = [
            { id: 1, speaker: 'User', text: 'Partial transcript...', timestamp: 1000 },
        ];

        mockSessionRepo.findLatestUnfinishedListen.mockReturnValue(session);
        mockTranscriptRepo.getAllTranscriptsBySessionId.mockResolvedValue(transcripts);
        mockInsightsRepo.getAllInsightsBySessionId.mockReturnValue([]);

        const recovery = await listenService.findStrandedSession();
        expect(recovery.transcripts).toHaveLength(1);
        // Should recover partial transcripts
    });

    test('should handle Resume → Immediate crash → Resume again', async () => {
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
                payload: { summary: ['Test'], actions: [] },
            },
        ];

        mockSessionRepo.findLatestUnfinishedListen.mockReturnValue(session);
        mockTranscriptRepo.getAllTranscriptsBySessionId.mockResolvedValue(transcripts);
        mockInsightsRepo.getAllInsightsBySessionId.mockReturnValue(insights);

        // First recovery
        listenService.strandedSession = await listenService.findStrandedSession();
        await listenService.resumeStrandedSession();

        // Immediate crash - same data
        listenService.strandedSession = await listenService.findStrandedSession();
        const secondRecovery = await listenService.resumeStrandedSession();

        expect(secondRecovery.success).toBe(true);
        expect(mockWindow.webContents.send).toHaveBeenCalled();
    });
});

