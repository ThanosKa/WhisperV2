const { describe, test, expect, beforeEach, jest: jestModule } = require('@jest/globals');

const mockSessionRepo = {
    findLatestUnfinishedListen: jestModule.fn(),
    end: jestModule.fn(),
    endAllActiveSessions: jestModule.fn(),
    create: jestModule.fn(),
};

const mockAuthService = {
    getCurrentUserId: jestModule.fn(() => 'test-user-id'),
};

jestModule.mock('../../../src/features/common/repositories/session', () => ({
    findLatestUnfinishedListen: () => mockSessionRepo.findLatestUnfinishedListen(),
    end: id => mockSessionRepo.end(id),
    endAllActiveSessions: () => mockSessionRepo.endAllActiveSessions(),
}));

jestModule.mock('../../../src/features/common/services/authService', () => mockAuthService);

jestModule.mock('../../../src/features/listen/stt/sttService', () =>
    jestModule.fn().mockImplementation(() => ({
        setCallbacks: jestModule.fn(),
        initializeSttSessions: jestModule.fn(async () => true),
        closeSessions: jestModule.fn(async () => true),
    }))
);

const mockSummaryService = {
    setCallbacks: jestModule.fn(),
    setSessionId: jestModule.fn(),
    hydrateConversation: jestModule.fn(),
    hydrateInsights: jestModule.fn(),
    selectedPresetId: null,
};

jestModule.mock('../../../src/features/listen/summary/summaryService', () => mockSummaryService);

jestModule.mock('../../../src/features/listen/stt/repositories', () => ({
    getAllTranscriptsBySessionId: jestModule.fn(async () => []),
}));

jestModule.mock('../../../src/features/listen/summary/repositories', () => ({
    getAllInsightsBySessionId: jestModule.fn(() => []),
}));

jestModule.mock('../../../src/window/windowManager', () => ({
    windowPool: {
        get: jestModule.fn(() => ({
            isDestroyed: jestModule.fn(() => false),
            webContents: { send: jestModule.fn() },
        })),
    },
}));

describe('Crash Recovery - Session Persistence', () => {
    let listenService;

    beforeEach(() => {
        jestModule.clearAllMocks();
        listenService = require('../../../src/features/listen/listenService');
        listenService.strandedSession = null;
        listenService.isRecoveryDismissed = false;
        listenService.currentSessionId = null;
        mockAuthService.getCurrentUserId.mockReturnValue('test-user-id');

        const SttService = require('../../../src/features/listen/stt/sttService');
        SttService.mockImplementation(() => ({
            setCallbacks: jestModule.fn(),
            initializeSttSessions: jestModule.fn(async () => true),
            closeSessions: jestModule.fn(async () => true),
        }));
    });

    test('should persist session on app close (not ended)', async () => {
        const session = {
            id: 'session-123',
            uid: 'test-user-id',
            session_type: 'listen',
            started_at: Date.now(),
            ended_at: null,
        };

        const { getAllTranscriptsBySessionId } = require('../../../src/features/listen/stt/repositories');
        getAllTranscriptsBySessionId.mockResolvedValue([{ id: 1, speaker: 'User', text: 'Recovered line', timestamp: Date.now() }]);

        mockSessionRepo.findLatestUnfinishedListen.mockReturnValue(session);

        const result = await listenService.findStrandedSession();

        expect(result).not.toBeNull();
        expect(result.session.id).toBe('session-123');
        expect(result.session.ended_at).toBeNull();
    });

    test('should NOT persist session on explicit "Done" click', async () => {
        const session = {
            id: 'session-123',
            uid: 'test-user-id',
            session_type: 'listen',
            started_at: Date.now(),
            ended_at: Date.now(), // Session was explicitly ended
        };

        mockSessionRepo.findLatestUnfinishedListen.mockReturnValue(null);

        const result = await listenService.findStrandedSession();

        expect(result).toBeNull();
    });

    test('should persist session on crash mid-transcription', async () => {
        const session = {
            id: 'session-123',
            uid: 'test-user-id',
            session_type: 'listen',
            started_at: Date.now() - 60000, // Started 1 minute ago
            ended_at: null,
        };

        const { getAllTranscriptsBySessionId } = require('../../../src/features/listen/stt/repositories');
        getAllTranscriptsBySessionId.mockResolvedValue([
            { id: 1, speaker: 'User', text: 'First transcript', timestamp: Date.now() },
            { id: 2, speaker: 'User', text: 'Second transcript', timestamp: Date.now() },
        ]);

        mockSessionRepo.findLatestUnfinishedListen.mockReturnValue(session);

        const result = await listenService.findStrandedSession();

        expect(result).not.toBeNull();
        expect(result.transcripts).toHaveLength(2);
        expect(result.session.ended_at).toBeNull();
    });

    test('should handle session persisted with no transcripts (edge case)', async () => {
        const session = {
            id: 'session-123',
            uid: 'test-user-id',
            session_type: 'listen',
            started_at: Date.now(),
            ended_at: null,
        };

        const { getAllTranscriptsBySessionId } = require('../../../src/features/listen/stt/repositories');
        getAllTranscriptsBySessionId.mockResolvedValue([]);

        mockSessionRepo.findLatestUnfinishedListen.mockReturnValue(session);

        const result = await listenService.findStrandedSession();

        expect(result).toBeNull(); // Should ignore sessions without transcripts
    });

    test('should recover only latest unfinished session when multiple exist', async () => {
        const latestSession = {
            id: 'session-latest',
            uid: 'test-user-id',
            session_type: 'listen',
            started_at: Date.now(),
            ended_at: null,
        };

        mockSessionRepo.findLatestUnfinishedListen.mockReturnValue(latestSession);

        const { getAllTranscriptsBySessionId } = require('../../../src/features/listen/stt/repositories');
        getAllTranscriptsBySessionId.mockResolvedValue([{ id: 1, speaker: 'User', text: 'Test', timestamp: Date.now() }]);

        const result = await listenService.findStrandedSession();

        expect(result).not.toBeNull();
        expect(result.session.id).toBe('session-latest');
        expect(mockSessionRepo.findLatestUnfinishedListen).toHaveBeenCalledTimes(1);
    });

    test('should clear sessions on explicit sign-out', async () => {
        mockAuthService.getCurrentUserId.mockReturnValue(null);

        const result = await listenService.findStrandedSession();

        expect(result).toBeNull();
        expect(mockSessionRepo.findLatestUnfinishedListen).not.toHaveBeenCalled();
    });
});
