const { describe, test, expect, beforeEach, jest: jestModule } = require('@jest/globals');

const mockSessionRepo = {
    findLatestUnfinishedListen: jestModule.fn(),
};

const mockTranscriptRepo = {
    getAllTranscriptsBySessionId: jestModule.fn(),
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
    selectedPresetId: null,
};

jestModule.mock('../../../src/features/listen/summary/summaryService', () => mockSummaryService);

jestModule.mock('../../../src/features/listen/summary/repositories', () => ({
    getAllInsightsBySessionId: jestModule.fn(() => []),
}));

const mockWindow = {
    isDestroyed: jestModule.fn(() => false),
    webContents: { send: jestModule.fn() },
};

jestModule.mock('../../../src/window/windowManager', () => ({
    windowPool: {
        get: jestModule.fn(() => mockWindow),
    },
}));

describe('Crash Recovery - Transcript Recovery', () => {
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

    test('should recover all transcripts after crash', async () => {
        const session = {
            id: 'session-123',
            uid: 'test-user-id',
            session_type: 'listen',
            started_at: Date.now(),
            ended_at: null,
        };

        const transcripts = [
            { id: 1, speaker: 'User', text: 'First message', timestamp: 1000 },
            { id: 2, speaker: 'Assistant', text: 'Second message', timestamp: 2000 },
            { id: 3, speaker: 'User', text: 'Third message', timestamp: 3000 },
        ];

        mockSessionRepo.findLatestUnfinishedListen.mockReturnValue(session);
        mockTranscriptRepo.getAllTranscriptsBySessionId.mockResolvedValue(transcripts);

        const result = await listenService.findStrandedSession();

        expect(result).not.toBeNull();
        expect(result.transcripts).toHaveLength(3);
        expect(result.transcripts[0].text).toBe('First message');
        expect(result.transcripts[2].text).toBe('Third message');
    });

    test('should recover transcripts in correct order', async () => {
        const session = {
            id: 'session-123',
            uid: 'test-user-id',
            session_type: 'listen',
            started_at: Date.now(),
            ended_at: null,
        };

        const transcripts = [
            { id: 1, speaker: 'User', text: 'A', timestamp: 1000 },
            { id: 2, speaker: 'User', text: 'B', timestamp: 2000 },
            { id: 3, speaker: 'User', text: 'C', timestamp: 3000 },
        ];

        mockSessionRepo.findLatestUnfinishedListen.mockReturnValue(session);
        mockTranscriptRepo.getAllTranscriptsBySessionId.mockResolvedValue(transcripts);

        const result = await listenService.findStrandedSession();

        expect(result.transcripts[0].text).toBe('A');
        expect(result.transcripts[1].text).toBe('B');
        expect(result.transcripts[2].text).toBe('C');
    });

    test('should send transcripts to UI via stt-update events', async () => {
        const session = {
            id: 'session-123',
            uid: 'test-user-id',
            session_type: 'listen',
            started_at: Date.now(),
            ended_at: null,
        };

        const transcripts = [
            { id: 1, speaker: 'User', text: 'Test 1', timestamp: 1000 },
            { id: 2, speaker: 'Assistant', text: 'Test 2', timestamp: 2000 },
        ];

        mockSessionRepo.findLatestUnfinishedListen.mockReturnValue(session);
        mockTranscriptRepo.getAllTranscriptsBySessionId.mockResolvedValue(transcripts);

        listenService.strandedSession = await listenService.findStrandedSession();
        await listenService.resumeStrandedSession();

        expect(mockWindow.webContents.send).toHaveBeenCalledWith(
            'stt-update',
            expect.objectContaining({
                speaker: 'User',
                text: 'Test 1',
                isFinal: true,
                isPartial: false,
            })
        );

        expect(mockWindow.webContents.send).toHaveBeenCalledWith(
            'stt-update',
            expect.objectContaining({
                speaker: 'Assistant',
                text: 'Test 2',
                isFinal: true,
                isPartial: false,
            })
        );
    });

    test('should handle empty transcript session gracefully', async () => {
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

    test('should recover large transcript set (100+ items)', async () => {
        const session = {
            id: 'session-123',
            uid: 'test-user-id',
            session_type: 'listen',
            started_at: Date.now(),
            ended_at: null,
        };

        const transcripts = Array.from({ length: 150 }, (_, i) => ({
            id: i + 1,
            speaker: i % 2 === 0 ? 'User' : 'Assistant',
            text: `Message ${i + 1}`,
            timestamp: 1000 + i * 100,
        }));

        mockSessionRepo.findLatestUnfinishedListen.mockReturnValue(session);
        mockTranscriptRepo.getAllTranscriptsBySessionId.mockResolvedValue(transcripts);

        const result = await listenService.findStrandedSession();

        expect(result).not.toBeNull();
        expect(result.transcripts).toHaveLength(150);
    });

    test('should recover transcripts with mixed speakers', async () => {
        const session = {
            id: 'session-123',
            uid: 'test-user-id',
            session_type: 'listen',
            started_at: Date.now(),
            ended_at: null,
        };

        const transcripts = [
            { id: 1, speaker: 'User', text: 'Hello', timestamp: 1000 },
            { id: 2, speaker: 'Assistant', text: 'Hi there', timestamp: 2000 },
            { id: 3, speaker: 'User', text: 'How are you?', timestamp: 3000 },
            { id: 4, speaker: 'System', text: 'Status update', timestamp: 4000 },
        ];

        mockSessionRepo.findLatestUnfinishedListen.mockReturnValue(session);
        mockTranscriptRepo.getAllTranscriptsBySessionId.mockResolvedValue(transcripts);

        const result = await listenService.findStrandedSession();

        expect(result.transcripts).toHaveLength(4);
        expect(result.transcripts[0].speaker).toBe('User');
        expect(result.transcripts[1].speaker).toBe('Assistant');
        expect(result.transcripts[3].speaker).toBe('System');
    });

    test('should send sync-conversation-history event to SummaryView', async () => {
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

        listenService.strandedSession = await listenService.findStrandedSession();
        await listenService.resumeStrandedSession();

        expect(mockWindow.webContents.send).toHaveBeenCalledWith(
            'listen:sync-conversation-history',
            expect.arrayContaining([expect.objectContaining({ speaker: 'User', text: 'Test' })])
        );
    });
});
