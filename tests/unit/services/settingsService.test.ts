import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('../../../src/main/features/common/services/authService', () => ({
    default: {
        getCurrentUserId: vi.fn(() => 'test-user-id'),
    },
}));

vi.mock('../../../src/main/features/settings/repositories', async () => ({
    default: (await import('../../mocks/database.mock')).repositoryMocks.presetRepository,
}));

vi.mock('../../../src/main/window/windowManager', async () => {
    const { electronMock } = await import('../../setup/electronMocks');
    const createWindow = () => ({
        isDestroyed: vi.fn(() => false),
        isVisible: vi.fn(() => true),
        webContents: {
            send: vi.fn(),
        },
    });

    const settingsWindow = createWindow();
    const listenWindow = createWindow();

    electronMock.BrowserWindow.getAllWindows.mockImplementation(() => [settingsWindow, listenWindow]);

    return {
        windowPool: new Map([
            ['settings', settingsWindow],
            ['listen', listenWindow],
        ]),
    };
});

describe('SettingsService', () => {
    let settingsService: typeof import('../../../src/main/features/settings/settingsService');
    let storeInstance: import('../../setup/electronMocks').MockStore;

    beforeEach(async () => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        vi.resetModules();
        settingsService = await import('../../../src/main/features/settings/settingsService');
        // resetModules gave the service a fresh electron-store stand-in; read its instance.
        const { mockStoreInstances } = await import('../../setup/electronMocks');
        const [firstStore] = mockStoreInstances;
        if (!firstStore) throw new Error('settingsService did not create a store');
        storeInstance = firstStore;
    });

    afterEach(() => {
        vi.runOnlyPendingTimers();
        vi.useRealTimers();
    });

    describe('getSettings', () => {
        test('merges defaults with stored values for authenticated user', async () => {
            storeInstance.get.mockReturnValueOnce({ profile: 'sales', customField: 'custom-value' });

            const settings = await settingsService.getSettings();

            expect(settings.profile).toBe('sales');
            expect(settings).toHaveProperty('customField', 'custom-value');
            expect(settings.language).toBe('en');
        });

        test('returns defaults when store throws', async () => {
            storeInstance.get.mockImplementationOnce(() => {
                throw new Error('storage error');
            });

            const settings = await settingsService.getSettings();
            expect(settings).toHaveProperty('language', 'en');
            expect(settings).toHaveProperty('profile', 'school');
        });
    });

    describe('saveSettings', () => {
        test('writes merged settings for user key', async () => {
            storeInstance.get.mockReturnValue({ profile: 'school' });

            await settingsService.saveSettings({ fontSize: 16 });

            expect(storeInstance.set).toHaveBeenCalledWith('users.test-user-id', expect.objectContaining({ fontSize: 16 }));
        });

        test('returns success indicator', async () => {
            storeInstance.get.mockReturnValue({});

            const result = await settingsService.saveSettings({ fontSize: 18 });
            expect(result).toEqual({ success: true });
        });
    });
});
