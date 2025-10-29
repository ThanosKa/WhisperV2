const { describe, test, expect, beforeEach } = require('@jest/globals');

const mockSummaryService = {
    setCallbacks: jest.fn(),
    addConversationTurn: jest.fn(),
    resetConversationHistory: jest.fn(),
    setSessionId: jest.fn(),
    getConversationHistory: jest.fn(() => ['Speaker: test message']),
    getCurrentAnalysisData: jest.fn(() => ({ summary: 'Mock summary' })),
    setAnalysisPreset: jest.fn(async () => {}),
};

jest.mock('../../../src/features/listen/stt/sttService', () =>
    jest.fn().mockImplementation(() => ({
        setCallbacks: jest.fn(),
        initializeSttSessions: jest.fn(async () => true),
        closeSessions: jest.fn(async () => true),
        isSessionActive: jest.fn(() => false),
        sendMicAudioContent: jest.fn(async () => ({ success: true })),
        startMacOSAudioCapture: jest.fn(async () => ({ success: true })),
        stopMacOSAudioCapture: jest.fn(),
        isMacOSAudioRunning: jest.fn(() => false),
    }))
);

jest.mock('../../../src/features/listen/summary/summaryService', () => mockSummaryService);
jest.mock('../../../src/features/common/repositories/session', () => require('../../mocks/database.mock').sessionRepository);
jest.mock('../../../src/features/listen/stt/repositories', () => require('../../mocks/database.mock').sttRepository);

jest.mock('../../../src/features/common/services/authService', () => ({
    getCurrentUser: jest.fn(() => ({ uid: 'test-user-id', email: 'test@example.com' })),
    getCurrentUserId: jest.fn(() => 'test-user-id'),
}));

jest.mock('../../../src/features/settings/settingsService', () => ({
    getSettings: jest.fn(async () => ({ analysisPresetId: 'sales' })),
}));

jest.mock('../../../src/window/windowManager', () => {
    const createMockWindow = () => ({
        isDestroyed: jest.fn(() => false),
        isVisible: jest.fn(() => true),
        webContents: {
            send: jest.fn(),
        },
    });

    const listenWindow = createMockWindow();
    const headerWindow = createMockWindow();

    return {
        windowPool: new Map([
            ['listen', listenWindow],
            ['header', headerWindow],
        ]),
        __mockListenWindow: listenWindow,
        __mockHeaderWindow: headerWindow,
    };
});

describe('ListenService', () => {
    let listenService;

    beforeEach(() => {
        jest.clearAllMocks();
        jest.resetModules();
        listenService = require('../../../src/features/listen/listenService');
    });

    describe('initializeNewSession', () => {
        test('returns true and sets current session ID', async () => {
            const result = await listenService.initializeNewSession();

            expect(result).toBe(true);
            expect(listenService.currentSessionId).toBe(1);
            expect(mockSummaryService.setSessionId).toHaveBeenCalledWith(1);
            expect(mockSummaryService.setAnalysisPreset).toHaveBeenCalledWith('sales');
        });

        test('resets conversation history during initialization', async () => {
            await listenService.initializeNewSession();
            expect(mockSummaryService.resetConversationHistory).toHaveBeenCalled();
        });
    });

    describe('handleTranscriptionComplete', () => {
        test('skips very short transcriptions', async () => {
            await listenService.handleTranscriptionComplete('User', 'ok');

            const sttRepository = require('../../mocks/database.mock').sttRepository;
            expect(sttRepository.addTranscript).not.toHaveBeenCalled();
            expect(mockSummaryService.addConversationTurn).not.toHaveBeenCalled();
        });

        test('persists longer transcriptions and forwards to summary', async () => {
            listenService.currentSessionId = 1;
            await listenService.handleTranscriptionComplete('User', 'This is a valid transcript line');

            const sttRepository = require('../../mocks/database.mock').sttRepository;
            expect(sttRepository.addTranscript).toHaveBeenCalledWith(
                expect.objectContaining({
                    sessionId: 1,
                    speaker: 'User',
                    text: 'This is a valid transcript line',
                })
            );
            expect(mockSummaryService.addConversationTurn).toHaveBeenCalledWith('User', 'This is a valid transcript line');
        });
    });

    describe('saveConversationTurn', () => {
        test('does nothing when no active session', async () => {
            listenService.currentSessionId = null;
            await listenService.saveConversationTurn('User', 'Hello world');

            const sttRepository = require('../../mocks/database.mock').sttRepository;
            expect(sttRepository.addTranscript).not.toHaveBeenCalled();
        });
    });

    describe('getCurrentSessionData', () => {
        test('returns conversation metadata bundle', () => {
            mockSummaryService.getConversationHistory.mockReturnValue(['Speaker: test message']);
            mockSummaryService.getCurrentAnalysisData.mockReturnValue({ summary: 'Mock summary' });
            listenService.currentSessionId = 42;
            const data = listenService.getCurrentSessionData();

            expect(data).toEqual(
                expect.objectContaining({
                    sessionId: 42,
                    conversationHistory: expect.any(Array),
                    analysisData: { summary: 'Mock summary' },
                })
            );
        });
    });
});
