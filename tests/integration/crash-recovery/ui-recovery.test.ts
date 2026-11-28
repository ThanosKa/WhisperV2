import { beforeEach, describe, expect, test, vi } from 'vitest';
import listenService from '../../../src/main/features/listen/listenService';

const {
    mockSessionRepo,
    mockTranscriptRepo,
    mockInsightsRepo,
    mockAuthService,
    mockSummaryService,
    mockHeaderWindow,
    mockListenWindow,
    SttServiceMock,
} = vi.hoisted(() => {
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
    const mockHeaderWindow = {
        isDestroyed: vi.fn(() => false),
        webContents: { send: vi.fn() },
    };
    const mockListenWindow = {
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

    return {
        mockSessionRepo,
        mockTranscriptRepo,
        mockInsightsRepo,
        mockAuthService,
        mockSummaryService,
        mockHeaderWindow,
        mockListenWindow,
        SttServiceMock,
    };
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

const windowPoolGet = vi.hoisted(() => vi.fn<(name: string) => object | null | undefined>((name: string) => {
            if (name === 'header') return mockHeaderWindow;
            if (name === 'listen') return mockListenWindow;
            return null;
        }));

vi.mock('../../../src/main/window/windowManager', () => ({
    windowPool: { get: windowPoolGet },
}));

describe('Crash Recovery - UI Recovery', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        listenService.strandedSession = null;
        listenService.isRecoveryDismissed = false;
        listenService.currentSessionId = null;
        mockAuthService.getCurrentUserId.mockReturnValue('test-user-id');
        mockSessionRepo.end.mockResolvedValue(undefined);
        listenService._generateAndSaveComprehensiveSummary = vi.fn(async () => {});

        windowPoolGet.mockImplementation((name: string) => {
            if (name === 'header') return mockHeaderWindow;
            if (name === 'listen') return mockListenWindow;
            return null;
        });
        mockHeaderWindow.isDestroyed.mockReturnValue(false);
        mockListenWindow.isDestroyed.mockReturnValue(false);

        SttServiceMock.mockImplementation(function () {
            return {
                setCallbacks: vi.fn(),
                initializeSttSessions: vi.fn(async () => true),
            };
        });
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
        expect(captureCall?.[1]).toMatchObject({ status: 'start' });
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
        expect(sessionStateCall?.[1]).toMatchObject({ isActive: true, mode: 'resume' });
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
