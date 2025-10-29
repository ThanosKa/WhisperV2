const { describe, test, expect, beforeEach } = require('@jest/globals');

jest.mock('../../../src/features/common/services/authService', () => ({
    getCurrentUserId: jest.fn(() => 'test-user-id'),
}));

jest.mock('../../../src/features/settings/repositories', () => require('../../mocks/database.mock').presetRepository);

jest.mock('../../../src/window/windowManager', () => {
    const { BrowserWindow } = require('electron');
    const createWindow = () => ({
        isDestroyed: jest.fn(() => false),
        isVisible: jest.fn(() => true),
        webContents: {
            send: jest.fn(),
        },
    });

    const settingsWindow = createWindow();
    const listenWindow = createWindow();

    BrowserWindow.getAllWindows.mockImplementation(() => [settingsWindow, listenWindow]);

    return {
        windowPool: new Map([
            ['settings', settingsWindow],
            ['listen', listenWindow],
        ]),
    };
});

describe('SettingsService', () => {
    let settingsService;
    let storeInstance;

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
        jest.resetModules();
        settingsService = require('../../../src/features/settings/settingsService');
        const Store = require('electron-store');
        storeInstance = Store.__instances[0];
    });

    afterEach(() => {
        jest.runOnlyPendingTimers();
        jest.useRealTimers();
    });

    describe('getSettings', () => {
        test('merges defaults with stored values for authenticated user', async () => {
            storeInstance.get.mockReturnValueOnce({ profile: 'sales', customField: 'custom-value' });

            const settings = await settingsService.getSettings();

            expect(settings.profile).toBe('sales');
            expect(settings.customField).toBe('custom-value');
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

            expect(storeInstance.set).toHaveBeenCalledWith(
                'users.test-user-id',
                expect.objectContaining({ fontSize: 16 })
            );
        });

        test('returns success indicator', async () => {
            storeInstance.get.mockReturnValue({});

            const result = await settingsService.saveSettings({ fontSize: 18 });
            expect(result).toEqual({ success: true });
        });
    });

    describe('Window lifecycle helpers', () => {
        test('initialize executes without throwing', () => {
            expect(() => settingsService.initialize()).not.toThrow();
        });

        test('cleanup executes without throwing', () => {
            expect(() => settingsService.cleanup()).not.toThrow();
        });
    });
});
