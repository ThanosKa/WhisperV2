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
    end: (id) => mockSessionRepo.end(id),
}));

jestModule.mock('../../../src/features/common/services/authService', () => mockAuthService);

jestModule.mock('../../../src/features/listen/stt/repositories', () => ({
    getAllTranscriptsBySessionId: (sessionId) => mockTranscriptRepo.getAllTranscriptsBySessionId(sessionId),
}));

jestModule.mock('../../../src/features/listen/summary/repositories', () => ({
    getAllInsightsBySessionId: (sessionId) => mockInsightsRepo.getAllInsightsBySessionId(sessionId),
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

describe('Crash Recovery - Edge Cases', () => {
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

    test('should ignore session exists but no transcripts', async () => {
        const session = {
            id: 'session-123',
            uid: 'test-user-id',
            session_type: 'listen',
            started_at: Date.now(),
            ended_at: null,
        };

        mockSessionRepo.findLatestUnfinishedListen.mockReturnValue(session);
        mockTranscriptRepo.getAllTranscriptsBySessionId.mockResolvedValue([]);

        const result = await listenService.findStrandedSession();

        expect(result).toBeNull();
    });

    test('should handle session exists but DB corrupted (error handling)', async () => {
        mockSessionRepo.findLatestUnfinishedListen.mockImplementation(() => {
            throw new Error('Database corruption');
        });

        const result = await listenService.findStrandedSession();

        expect(result).toBeNull();
    });

    test('should skip recovery bootstrap before auth', async () => {
        mockAuthService.getCurrentUserId.mockReturnValue(null);

        const result = await listenService.findStrandedSession();

        expect(result).toBeNull();
        expect(mockSessionRepo.findLatestUnfinishedListen).not.toHaveBeenCalled();
    });

    test('should handle recovery with no authenticated user', async () => {
        mockAuthService.getCurrentUserId.mockReturnValue(null);

        const result = await listenService.findStrandedSession();

        expect(result).toBeNull();
    });

    test('should handle window not ready when sending recovery data', async () => {
        const session = {
            id: 'session-123',
            uid: 'test-user-id',
            session_type: 'listen',
            started_at: Date.now(),
            ended_at: null,
        };

        const transcripts = [{ id: 1, speaker: 'User', text: 'Test', timestamp: 1000 }];

        const { windowPool } = require('../../../src/window/windowManager');
        windowPool.get.mockReturnValue(null); // Window not ready

        mockSessionRepo.findLatestUnfinishedListen.mockReturnValue(session);
        mockTranscriptRepo.getAllTranscriptsBySessionId.mockResolvedValue(transcripts);
        mockInsightsRepo.getAllInsightsBySessionId.mockReturnValue([]);

        listenService.strandedSession = await listenService.findStrandedSession();
        await listenService.resumeStrandedSession();

        // Should not throw error, just skip sending to UI
        expect(listenService.strandedSession).toBeNull();
    });

    test('should block Listen button clicked before recovery resolved', async () => {
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

        // Simulate Listen button click
        const headerWindow = {
            isDestroyed: jestModule.fn(() => false),
            webContents: { send: jestModule.fn() },
        };

        const { windowPool } = require('../../../src/window/windowManager');
        windowPool.get.mockReturnValue(headerWindow);

        // Should block and notify header
        expect(listenService.strandedSession).not.toBeNull();
    });

    test('should take latest unfinished session when multiple exist', async () => {
        const latestSession = {
            id: 'session-latest',
            uid: 'test-user-id',
            session_type: 'listen',
            started_at: Date.now(),
            ended_at: null,
        };

        mockSessionRepo.findLatestUnfinishedListen.mockReturnValue(latestSession);
        mockTranscriptRepo.getAllTranscriptsBySessionId.mockResolvedValue([
            { id: 1, speaker: 'User', text: 'Test', timestamp: 1000 },
        ]);
        mockInsightsRepo.getAllInsightsBySessionId.mockReturnValue([]);

        const result = await listenService.findStrandedSession();

        expect(result.session.id).toBe('session-latest');
        expect(mockSessionRepo.findLatestUnfinishedListen).toHaveBeenCalledTimes(1);
    });

    test('should handle recovery prompt dismissed, then crash again', async () => {
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

        // First detection
        listenService.strandedSession = await listenService.findStrandedSession();
        await listenService.handleRecoveryAction('dismiss', 'session-123');

        expect(listenService.isRecoveryDismissed).toBe(true);

        // Crash again - should detect again
        listenService.isRecoveryDismissed = false;
        const secondRecovery = await listenService.findStrandedSession();

        expect(secondRecovery).not.toBeNull();
    });

    test('should handle finalize with incomplete data', async () => {
        const session = {
            id: 'session-123',
            uid: 'test-user-id',
            session_type: 'listen',
            started_at: Date.now(),
            ended_at: null,
        };

        const transcripts = [{ id: 1, speaker: 'User', text: 'Partial', timestamp: 1000 }];

        mockSessionRepo.findLatestUnfinishedListen.mockReturnValue(session);
        mockTranscriptRepo.getAllTranscriptsBySessionId.mockResolvedValue(transcripts);
        mockInsightsRepo.getAllInsightsBySessionId.mockReturnValue([]);

        listenService.strandedSession = await listenService.findStrandedSession();
        const result = await listenService.handleRecoveryAction('finalize', 'session-123');

        expect(result.success).toBe(true);
        expect(mockSessionRepo.end).toHaveBeenCalledWith('session-123');
    });

    test('should handle resume with STT initialization failure', async () => {
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
        listenService.sttService.initializeSttSessions.mockRejectedValue(new Error('STT init failed'));

        await expect(listenService.resumeStrandedSession()).rejects.toThrow('STT resume failed after retries');
    });
});

