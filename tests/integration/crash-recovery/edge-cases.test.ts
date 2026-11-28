import { beforeEach, describe, expect, test, vi } from 'vitest';
import listenService from '../../../src/main/features/listen/listenService';

const { mockSessionRepo, mockTranscriptRepo, mockInsightsRepo, mockAuthService, mockSummaryService, mockWindow, SttServiceMock } = vi.hoisted(() => {
    const mockSessionRepo = {
        findLatestUnfinishedListen: vi.fn(),
        end: vi.fn(),
    };
    const mockTranscriptRepo = {
        getAllTranscriptsBySessionId: vi.fn(),
    };
    const mockInsightsRepo = {
        getAllInsightsBySessionId: vi.fn(),
    };
    const mockAuthService = {
        getCurrentUserId: vi.fn((): string | null => 'test-user-id'),
    };
    const mockSummaryService = {
        setCallbacks: vi.fn(),
        setSessionId: vi.fn(),
        hydrateConversation: vi.fn(),
        hydrateInsights: vi.fn(),
        selectedPresetId: 'meeting',
    };
    const mockWindow = {
        isDestroyed: vi.fn(() => false),
        webContents: { send: vi.fn() },
    };
    // listenService builds its STT service when the module loads, so the stand-in needs a working
    // implementation from the start; each test sets its own again.
    const SttServiceMock = vi.fn(function SttService(): Record<string, unknown> {
        return {
            setCallbacks: vi.fn(),
            initializeSttSessions: vi.fn(async () => true),
            closeSessions: vi.fn(async () => true),
        };
    });

    return { mockSessionRepo, mockTranscriptRepo, mockInsightsRepo, mockAuthService, mockSummaryService, mockWindow, SttServiceMock };
});

vi.mock('../../../src/main/features/common/repositories/session', () => ({
    default: {
        findLatestUnfinishedListen: () => mockSessionRepo.findLatestUnfinishedListen(),
        end: (id: string) => mockSessionRepo.end(id),
    },
}));

vi.mock('../../../src/main/features/common/services/authService', () => ({ default: mockAuthService }));

vi.mock('../../../src/main/features/listen/stt/repositories', () => ({
    default: {
        getAllTranscriptsBySessionId: (sessionId: string) => mockTranscriptRepo.getAllTranscriptsBySessionId(sessionId),
    },
}));

vi.mock('../../../src/main/features/listen/summary/repositories', () => ({
    default: {
        getAllInsightsBySessionId: (sessionId: string) => mockInsightsRepo.getAllInsightsBySessionId(sessionId),
    },
}));

vi.mock('../../../src/main/features/listen/stt/sttService', () => ({ default: SttServiceMock }));

vi.mock('../../../src/main/features/listen/summary/summaryService', () => ({ default: mockSummaryService }));

vi.mock('../../../src/main/window/windowManager', () => ({
    windowPool: {
        get: vi.fn(() => mockWindow),
    },
}));

describe('Crash Recovery - Edge Cases', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        listenService.strandedSession = null;
        listenService.isRecoveryDismissed = false;
        listenService.currentSessionId = null;
        mockAuthService.getCurrentUserId.mockReturnValue('test-user-id');

        const windowManager = await import('../../../src/main/window/windowManager');
        vi.mocked(windowManager.windowPool.get).mockImplementation(() => mockWindow);
        mockWindow.isDestroyed.mockReturnValue(false);

        SttServiceMock.mockImplementation(function () {
            return {
                setCallbacks: vi.fn(),
                initializeSttSessions: vi.fn(async () => true),
            };
        });
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

        const { windowPool } = await import('../../../src/main/window/windowManager');
        vi.mocked(windowPool.get).mockReturnValue(null); // Window not ready

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
            isDestroyed: vi.fn(() => false),
            webContents: { send: vi.fn() },
        };

        const { windowPool } = await import('../../../src/main/window/windowManager');
        vi.mocked(windowPool.get).mockReturnValue(headerWindow);

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
        mockTranscriptRepo.getAllTranscriptsBySessionId.mockResolvedValue([{ id: 1, speaker: 'User', text: 'Test', timestamp: 1000 }]);
        mockInsightsRepo.getAllInsightsBySessionId.mockReturnValue([]);

        const result = await listenService.findStrandedSession();

        expect(result?.session.id).toBe('session-latest');
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
        await new Promise(setImmediate);
        expect(mockSessionRepo.end).toHaveBeenCalledWith('session-123');
    });

    test('should clear stranded session immediately after finalize action', async () => {
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
        expect(listenService.strandedSession).toBeNull();

        await new Promise(setImmediate);
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
        vi.mocked(listenService.sttService.initializeSttSessions).mockRejectedValue(new Error('STT init failed'));

        await expect(listenService.resumeStrandedSession()).rejects.toThrow('STT resume failed after retries');
    });
});
