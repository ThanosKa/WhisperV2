const createSessionRepository = () => ({
    setAuthService: jest.fn(),
    create: jest.fn(async () => 1),
    getById: jest.fn(async id => ({ id, uid: 'test-user', title: 'Test Session' })),
    getAllByUserId: jest.fn(async () => []),
    update: jest.fn(async () => ({ success: true })),
    updateTitle: jest.fn(async () => ({ success: true })),
    updateType: jest.fn(async () => ({ success: true })),
    delete: jest.fn(async () => ({ success: true })),
    deleteWithRelatedData: jest.fn(async () => ({ success: true })),
    getOrCreateActive: jest.fn(async () => 1),
    end: jest.fn(async () => ({ success: true })),
    endAllActiveSessions: jest.fn(async () => ({ success: true })),
    touch: jest.fn(async () => ({ success: true })),
});

const createAskRepository = () => ({
    addAiMessage: jest.fn(async () => ({ success: true })),
    getAllAiMessagesBySessionId: jest.fn(async () => []),
});

const createSttRepository = () => ({
    addTranscript: jest.fn(async () => ({ success: true })),
    getAllTranscriptsBySessionId: jest.fn(async () => [
        { id: 1, speaker: 'User', text: 'Test transcript', timestamp: Date.now() },
    ]),
});

const createUserRepository = () => ({
    findOrCreate: jest.fn(async () => ({ success: true })),
});

const createPresetRepository = () => ({
    getPresets: jest.fn(async () => []),
    getPresetTemplates: jest.fn(async () => []),
    update: jest.fn(async () => ({ success: true })),
});

module.exports = {
    sessionRepository: createSessionRepository(),
    askRepository: createAskRepository(),
    sttRepository: createSttRepository(),
    userRepository: createUserRepository(),
    presetRepository: createPresetRepository(),
};
