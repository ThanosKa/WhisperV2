import { beforeEach, describe, expect, test, vi } from 'vitest';
import listenService from '../../../src/main/features/listen/listenService';

const { mockSessionRepo, mockTranscriptRepo, mockAuthService, mockSummaryService, mockWindow, SttServiceMock } = vi.hoisted(() => {
    const mockSessionRepo = {
        findLatestUnfinishedListen: vi.fn(),
    };
    const mockTranscriptRepo = {
        getAllTranscriptsBySessionId: vi.fn(),
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

    return { mockSessionRepo, mockTranscriptRepo, mockAuthService, mockSummaryService, mockWindow, SttServiceMock };
});

vi.mock('../../../src/main/features/common/repositories/session', () => ({
    default: {
        findLatestUnfinishedListen: () => mockSessionRepo.findLatestUnfinishedListen(),
    },
}));

vi.mock('../../../src/main/features/common/services/authService', () => ({ default: mockAuthService }));

vi.mock('../../../src/main/features/listen/stt/repositories', () => ({
    default: {
        getAllTranscriptsBySessionId: (sessionId: string) => mockTranscriptRepo.getAllTranscriptsBySessionId(sessionId),
    },
}));

vi.mock('../../../src/main/features/listen/stt/sttService', () => ({ default: SttServiceMock }));

vi.mock('../../../src/main/features/listen/summary/summaryService', () => ({ default: mockSummaryService }));

vi.mock('../../../src/main/features/listen/summary/repositories', () => ({
    default: {
        getAllInsightsBySessionId: vi.fn(() => []),
    },
}));

const windowPoolGet = vi.hoisted(() => vi.fn<(name: string) => object | null | undefined>(() => mockWindow));

vi.mock('../../../src/main/window/windowManager', () => ({
    windowPool: { get: windowPoolGet },
}));

describe('Crash Recovery - Transcript Recovery', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        listenService.strandedSession = null;
        listenService.isRecoveryDismissed = false;
        listenService.currentSessionId = null;
        mockAuthService.getCurrentUserId.mockReturnValue('test-user-id');

        windowPoolGet.mockImplementation(() => mockWindow);
        mockWindow.isDestroyed.mockReturnValue(false);

        SttServiceMock.mockImplementation(function () {
            return {
                setCallbacks: vi.fn(),
                initializeSttSessions: vi.fn(async () => true),
            };
        });
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
        expect(result?.transcripts).toHaveLength(3);
        expect(result?.transcripts[0]).toHaveProperty('text', 'First message');
        expect(result?.transcripts[2]).toHaveProperty('text', 'Third message');
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

        expect(result?.transcripts[0]).toHaveProperty('text', 'A');
        expect(result?.transcripts[1]).toHaveProperty('text', 'B');
        expect(result?.transcripts[2]).toHaveProperty('text', 'C');
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
        expect(result?.transcripts).toHaveLength(150);
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

        expect(result?.transcripts).toHaveLength(4);
        expect(result?.transcripts[0]).toHaveProperty('speaker', 'User');
        expect(result?.transcripts[1]).toHaveProperty('speaker', 'Assistant');
        expect(result?.transcripts[3]).toHaveProperty('speaker', 'System');
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
