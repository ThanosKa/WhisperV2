import { vi } from 'vitest';

const createSessionRepository = () => ({
    setAuthService: vi.fn(),
    create: vi.fn(async () => 1),
    getById: vi.fn(async (id: number) => ({ id, uid: 'test-user', title: 'Test Session' })),
    getAllByUserId: vi.fn(async () => []),
    update: vi.fn(async () => ({ success: true })),
    updateTitle: vi.fn(async () => ({ success: true })),
    updateType: vi.fn(async () => ({ success: true })),
    delete: vi.fn(async () => ({ success: true })),
    deleteWithRelatedData: vi.fn(async () => ({ success: true })),
    getOrCreateActive: vi.fn(async () => 1),
    end: vi.fn(async () => ({ success: true })),
    endAllActiveSessions: vi.fn(async () => ({ success: true })),
    touch: vi.fn(async () => ({ success: true })),
});

const createAskRepository = () => ({
    addAiMessage: vi.fn(async () => ({ success: true })),
    getAllAiMessagesBySessionId: vi.fn(async () => []),
});

const createSttRepository = () => ({
    addTranscript: vi.fn(async () => ({ success: true })),
    getAllTranscriptsBySessionId: vi.fn(async () => [{ id: 1, speaker: 'User', text: 'Test transcript', timestamp: Date.now() }]),
});

const createUserRepository = () => ({
    findOrCreate: vi.fn(async () => ({ success: true })),
});

const createPresetRepository = () => ({
    getPresets: vi.fn(async () => []),
    update: vi.fn(async () => ({ success: true })),
});

export const repositoryMocks = {
    sessionRepository: createSessionRepository(),
    askRepository: createAskRepository(),
    sttRepository: createSttRepository(),
    userRepository: createUserRepository(),
    presetRepository: createPresetRepository(),
};
