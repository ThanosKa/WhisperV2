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
};

const mockAuthService = {
    getCurrentUserId: jestModule.fn(() => 'test-user-id'),
};

jestModule.mock('../../../src/features/common/repositories/session', () => ({
    findLatestUnfinishedListen: () => mockSessionRepo.findLatestUnfinishedListen(),
    end: id => mockSessionRepo.end(id),
}));

jestModule.mock('../../../src/features/common/services/authService', () => mockAuthService);

jestModule.mock('../../../src/features/listen/stt/repositories', () => ({
    getAllTranscriptsBySessionId: sessionId => mockTranscriptRepo.getAllTranscriptsBySessionId(sessionId),
}));

jestModule.mock('../../../src/features/listen/summary/repositories', () => ({
    getAllInsightsBySessionId: sessionId => mockInsightsRepo.getAllInsightsBySessionId(sessionId),
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

const mockHeaderWindow = {
    isDestroyed: jestModule.fn(() => false),
    webContents: { send: jestModule.fn() },
};

const mockListenWindow = {
    isDestroyed: jestModule.fn(() => false),
    webContents: { send: jestModule.fn() },
};

jestModule.mock('../../../src/window/windowManager', () => ({
    windowPool: {
        get: jestModule.fn(name => {
            if (name === 'header') return mockHeaderWindow;
            if (name === 'listen') return mockListenWindow;
            return null;
        }),
    },
}));

describe('Crash Recovery - UI Recovery', () => {
    let listenService;

    beforeEach(() => {
        jestModule.clearAllMocks();
        listenService = require('../../../src/features/listen/listenService');
        listenService.strandedSession = null;
        listenService.isRecoveryDismissed = false;
        listenService.currentSessionId = null;
        mockAuthService.getCurrentUserId.mockReturnValue('test-user-id');
        mockSessionRepo.end.mockResolvedValue();
        listenService._generateAndSaveComprehensiveSummary = jestModule.fn(async () => {});

        const windowManager = require('../../../src/window/windowManager');
        windowManager.windowPool.get.mockImplementation(name => {
            if (name === 'header') return mockHeaderWindow;
            if (name === 'listen') return mockListenWindow;
            return null;
        });
        mockHeaderWindow.isDestroyed.mockReturnValue(false);
        mockListenWindow.isDestroyed.mockReturnValue(false);

        const SttService = require('../../../src/features/listen/stt/sttService');
        SttService.mockImplementation(() => ({
            setCallbacks: jestModule.fn(),
            initializeSttSessions: jestModule.fn(async () => true),
        }));
    });

    test('should show recovery prompt in header on startup', async () => {
        const session = {
            id: 'session-123',
            uid: 'test-user-id',
            session_type: 'listen',
            started_at: Date.now(),
            ended_at: null,
            title: 'Test Session',
        };

        const transcripts = [{ id: 1, speaker: 'User', text: 'Test', timestamp: 1000 }];

        mockSessionRepo.findLatestUnfinishedListen.mockReturnValue(session);
        mockTranscriptRepo.getAllTranscriptsBySessionId.mockResolvedValue(transcripts);
        mockInsightsRepo.getAllInsightsBySessionId.mockReturnValue([]);

        await listenService.bootstrapRecovery();

        expect(mockHeaderWindow.webContents.send).toHaveBeenCalledWith(
            'listen:stranded-session-detected',
            expect.objectContaining({
                id: 'session-123',
                title: 'Test Session',
            })
        );
    });

    test('should trigger resumeStrandedSession on Resume button', async () => {
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

        listenService.strandedSession = await listenService.findStrandedSession();
        const result = await listenService.handleRecoveryAction('resume', 'session-123');

        expect(result.success).toBe(true);
        expect(mockSummaryService.hydrateConversation).toHaveBeenCalled();
    });

    test('should trigger finalizeStrandedSession on Finalize button', async () => {
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

        listenService.strandedSession = await listenService.findStrandedSession();
        const result = await listenService.handleRecoveryAction('finalize', 'session-123');

        expect(result.success).toBe(true);
    });

    test('should clear recovery state on Dismiss button', async () => {
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

        listenService.strandedSession = await listenService.findStrandedSession();
        const result = await listenService.handleRecoveryAction('dismiss', 'session-123');

        expect(result.success).toBe(true);
        expect(listenService.strandedSession).toBeNull();
        expect(listenService.isRecoveryDismissed).toBe(true);
    });

    test('should show transcripts in transcript view after resume', async () => {
        const session = {
            id: 'session-123',
            uid: 'test-user-id',
            session_type: 'listen',
            started_at: Date.now(),
            ended_at: null,
        };

        const transcripts = [
            { id: 1, speaker: 'User', text: 'First', timestamp: 1000 },
            { id: 2, speaker: 'Assistant', text: 'Second', timestamp: 2000 },
        ];

        mockSessionRepo.findLatestUnfinishedListen.mockReturnValue(session);
        mockTranscriptRepo.getAllTranscriptsBySessionId.mockResolvedValue(transcripts);
        mockInsightsRepo.getAllInsightsBySessionId.mockReturnValue([]);

        listenService.strandedSession = await listenService.findStrandedSession();
        await listenService.resumeStrandedSession();

        expect(mockListenWindow.webContents.send).toHaveBeenCalledWith('stt-update', expect.objectContaining({ text: 'First' }));
        expect(mockListenWindow.webContents.send).toHaveBeenCalledWith('stt-update', expect.objectContaining({ text: 'Second' }));
    });

    test('should show insights in insights view after resume', async () => {
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

        expect(mockListenWindow.webContents.send).toHaveBeenCalledWith('summary-update', expect.objectContaining({ summary: ['Test summary'] }));
    });

    test('should enable audio capture after resume', async () => {
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

        listenService.strandedSession = await listenService.findStrandedSession();
        await listenService.resumeStrandedSession();

        const calls = mockListenWindow.webContents.send.mock.calls;
        const captureCall = calls.find(call => call[0] === 'change-listen-capture-state');
        expect(captureCall).toBeDefined();
        expect(captureCall[1]).toMatchObject({ status: 'start' });
    });

    test('should send session-state-changed event after resume', async () => {
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

        listenService.strandedSession = await listenService.findStrandedSession();
        await listenService.resumeStrandedSession();

        const calls = mockListenWindow.webContents.send.mock.calls;
        const sessionStateCall = calls.find(call => call[0] === 'session-state-changed');
        expect(sessionStateCall).toBeDefined();
        expect(sessionStateCall[1]).toMatchObject({ isActive: true, mode: 'resume' });
    });

    test('should allow continuing transcription after resume', async () => {
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

        listenService.strandedSession = await listenService.findStrandedSession();
        await listenService.resumeStrandedSession();

        // After resume, session should be active and ready for new transcripts
        expect(listenService.currentSessionId).toBe('session-123');
        expect(listenService.strandedSession).toBeNull();
    });
});
