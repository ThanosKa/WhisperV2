import { beforeEach, describe, expect, test, vi } from 'vitest';
import listenService from '../../../src/main/features/listen/listenService';

const { mockSessionRepo, mockTranscriptRepo, mockAuthService, mockSummaryService, SttServiceMock } = vi.hoisted(() => {
    const mockSessionRepo = {
        findLatestUnfinishedListen: vi.fn(),
        end: vi.fn(),
        endAllActiveSessions: vi.fn(),
        create: vi.fn(),
    };
    const mockTranscriptRepo = {
        getAllTranscriptsBySessionId: vi.fn(async (): Promise<unknown[]> => []),
    };
    const mockAuthService = {
        getCurrentUserId: vi.fn((): string | null => 'test-user-id'),
    };
    const mockSummaryService = {
        setCallbacks: vi.fn(),
        setSessionId: vi.fn(),
        hydrateConversation: vi.fn(),
        hydrateInsights: vi.fn(),
        selectedPresetId: null,
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

    return { mockSessionRepo, mockTranscriptRepo, mockAuthService, mockSummaryService, SttServiceMock };
});

vi.mock('../../../src/main/features/common/repositories/session', () => ({
    default: {
        findLatestUnfinishedListen: () => mockSessionRepo.findLatestUnfinishedListen(),
        end: (id: string) => mockSessionRepo.end(id),
        endAllActiveSessions: () => mockSessionRepo.endAllActiveSessions(),
    },
}));

vi.mock('../../../src/main/features/common/services/authService', () => ({ default: mockAuthService }));

vi.mock('../../../src/main/features/listen/stt/sttService', () => ({ default: SttServiceMock }));

vi.mock('../../../src/main/features/listen/summary/summaryService', () => ({ default: mockSummaryService }));

vi.mock('../../../src/main/features/listen/stt/repositories', () => ({
    default: {
        getAllTranscriptsBySessionId: () => mockTranscriptRepo.getAllTranscriptsBySessionId(),
    },
}));

vi.mock('../../../src/main/features/listen/summary/repositories', () => ({
    default: {
        getAllInsightsBySessionId: vi.fn(() => []),
    },
}));

vi.mock('../../../src/main/window/windowManager', () => ({
    windowPool: {
        get: vi.fn(() => ({
            isDestroyed: vi.fn(() => false),
            webContents: { send: vi.fn() },
        })),
    },
}));

describe('Crash Recovery - Session Persistence', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        listenService.strandedSession = null;
        listenService.isRecoveryDismissed = false;
        listenService.currentSessionId = null;
        mockAuthService.getCurrentUserId.mockReturnValue('test-user-id');

        SttServiceMock.mockImplementation(function () {
            return {
                setCallbacks: vi.fn(),
                initializeSttSessions: vi.fn(async () => true),
                closeSessions: vi.fn(async () => true),
            };
        });
    });

    test('should persist session on app close (not ended)', async () => {
        const session = {
            id: 'session-123',
            uid: 'test-user-id',
            session_type: 'listen',
            started_at: Date.now(),
            ended_at: null,
        };

        mockTranscriptRepo.getAllTranscriptsBySessionId.mockResolvedValue([
            { id: 1, speaker: 'User', text: 'Recovered line', timestamp: Date.now() },
        ]);

        mockSessionRepo.findLatestUnfinishedListen.mockReturnValue(session);

        const result = await listenService.findStrandedSession();

        expect(result).not.toBeNull();
        expect(result?.session.id).toBe('session-123');
        expect(result?.session.ended_at).toBeNull();
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

        mockTranscriptRepo.getAllTranscriptsBySessionId.mockResolvedValue([
            { id: 1, speaker: 'User', text: 'First transcript', timestamp: Date.now() },
            { id: 2, speaker: 'User', text: 'Second transcript', timestamp: Date.now() },
        ]);

        mockSessionRepo.findLatestUnfinishedListen.mockReturnValue(session);

        const result = await listenService.findStrandedSession();

        expect(result).not.toBeNull();
        expect(result?.transcripts).toHaveLength(2);
        expect(result?.session.ended_at).toBeNull();
    });

    test('should handle session persisted with no transcripts (edge case)', async () => {
        const session = {
            id: 'session-123',
            uid: 'test-user-id',
            session_type: 'listen',
            started_at: Date.now(),
            ended_at: null,
        };

        mockTranscriptRepo.getAllTranscriptsBySessionId.mockResolvedValue([]);

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

        mockTranscriptRepo.getAllTranscriptsBySessionId.mockResolvedValue([{ id: 1, speaker: 'User', text: 'Test', timestamp: Date.now() }]);

        const result = await listenService.findStrandedSession();

        expect(result).not.toBeNull();
        expect(result?.session.id).toBe('session-latest');
        expect(mockSessionRepo.findLatestUnfinishedListen).toHaveBeenCalledTimes(1);
    });

    test('should clear sessions on explicit sign-out', async () => {
        mockAuthService.getCurrentUserId.mockReturnValue(null);

        const result = await listenService.findStrandedSession();

        expect(result).toBeNull();
        expect(mockSessionRepo.findLatestUnfinishedListen).not.toHaveBeenCalled();
    });
});
