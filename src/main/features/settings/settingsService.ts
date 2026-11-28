import { BrowserWindow } from 'electron';
import Store from 'electron-store';
import { z } from 'zod';
import authService from '../common/services/authService';
import settingsRepository from './repositories';
import { windowPool } from '../../window/windowManager';
import { errorMessage } from '../common/utils/errors';
import { logger } from '../common/utils/logger';
import { sendEvent } from '../../ipc/sendEvent';
import type { EventArgs } from '../../../shared/ipc';

const log = logger.child({ module: 'SettingsService' });

const store = new Store({
    name: 'whisper-settings',
    defaults: {
        users: {},
    },
});

// What the store holds under `users.<uid>`: the user's own settings. Any key is allowed, and
// `getSettings` fills in the defaults below.
const StoredSettingsSchema = z.record(z.string(), z.unknown());

// Configuration constants
const NOTIFICATION_CONFIG = {
    RELEVANT_WINDOW_TYPES: ['settings', 'main', 'listen'],
    DEBOUNCE_DELAY: 300, // prevent spam during bulk operations (ms)
};

type NotificationOptions = { windowTypes?: string[]; debounce?: number };

// The events this manager sends to the settings, main and listen windows
type SettingsEvent = 'settings-updated' | 'presets-updated';

// window targeting system
class WindowNotificationManager {
    private readonly pendingNotifications = new Map<string, ReturnType<typeof setTimeout>>();

    /** Send notifications only to relevant windows. */
    notifyRelevantWindows<C extends SettingsEvent>({ event, args, options = {} }: { event: C; args: EventArgs[C]; options?: NotificationOptions }) {
        const { windowTypes = NOTIFICATION_CONFIG.RELEVANT_WINDOW_TYPES, debounce = NOTIFICATION_CONFIG.DEBOUNCE_DELAY } = options;

        if (debounce > 0) {
            this.debounceNotification({
                key: event,
                fn: () => {
                    this.sendToTargetWindows({ event, args, windowTypes });
                },
                delay: debounce,
            });
        } else {
            this.sendToTargetWindows({ event, args, windowTypes });
        }
    }

    private sendToTargetWindows<C extends SettingsEvent>({ event, args, windowTypes }: { event: C; args: EventArgs[C]; windowTypes: string[] }) {
        const relevantWindows = this.getRelevantWindows(windowTypes);

        if (relevantWindows.length === 0) {
            log.info({ event }, 'No relevant windows found for event');
            return;
        }

        log.info({ event, windows: relevantWindows.length }, 'Sending event to relevant windows');

        relevantWindows.forEach(win => {
            try {
                sendEvent({ webContents: win.webContents, channel: event, args });
            } catch (error) {
                log.warn({ err: error, event }, 'Failed to send event to window');
            }
        });
    }

    private getRelevantWindows(windowTypes: string[]): BrowserWindow[] {
        const allWindows = BrowserWindow.getAllWindows();
        const relevantWindows: BrowserWindow[] = [];

        allWindows.forEach(win => {
            if (win.isDestroyed()) return;

            for (const [windowName, poolWindow] of windowPool) {
                if (poolWindow === win && windowTypes.includes(windowName)) {
                    if (windowName === 'settings' || win.isVisible()) {
                        relevantWindows.push(win);
                    }
                    break;
                }
            }
        });

        return relevantWindows;
    }

    private debounceNotification({ key, fn, delay }: { key: string; fn: () => void; delay: number }) {
        // Clear existing timeout
        const pending = this.pendingNotifications.get(key);
        if (pending !== undefined) {
            clearTimeout(pending);
        }

        // Set new timeout
        const timeoutId = setTimeout(() => {
            fn();
            this.pendingNotifications.delete(key);
        }, delay);

        this.pendingNotifications.set(key, timeoutId);
    }
}

// Global instance
const windowNotificationManager = new WindowNotificationManager();

// Default keybinds configuration - unified for all platforms
const DEFAULT_KEYBINDS = {
    moveUp: 'Cmd+Up',
    moveDown: 'Cmd+Down',
    moveLeft: 'Cmd+Left',
    moveRight: 'Cmd+Right',
    toggleVisibility: 'Cmd+\\',
    toggleClickThrough: 'Cmd+M',
    nextStep: 'Cmd+Enter',
    manualScreenshot: 'Cmd+Shift+S',
    previousResponse: 'Cmd+[',
    nextResponse: 'Cmd+]',
};

function getDefaultSettings() {
    return {
        profile: 'school',
        language: 'en',
        screenshotInterval: '5000',
        imageQuality: '0.8',
        layoutMode: 'stacked',
        keybinds: DEFAULT_KEYBINDS, // Unified keybinds for all platforms
        throttleTokens: 500,
        maxTokens: 2000,
        throttlePercent: 80,
        backgroundTransparency: 0.5,
        fontSize: 14,
        contentProtection: true,
        analysisPresetId: 'meetings',
    };
}

export type Settings = ReturnType<typeof getDefaultSettings> & Record<string, unknown>;

const userSettingsKey = (uid: string | null) => (uid ? `users.${uid}` : 'users.default');

async function getSettings(): Promise<Settings> {
    try {
        const uid = authService.getCurrentUserId();

        const defaultSettings = getDefaultSettings();
        const savedSettings = StoredSettingsSchema.parse(store.get(userSettingsKey(uid), {}));

        return { ...defaultSettings, ...savedSettings };
    } catch (error) {
        log.error({ err: error }, 'Error getting settings from store');
        return getDefaultSettings();
    }
}

async function saveSettings(settings: Record<string, unknown>): Promise<{ success: true } | { success: false; error: string }> {
    try {
        const uid = authService.getCurrentUserId();
        const key = userSettingsKey(uid);

        const currentSaved = StoredSettingsSchema.parse(store.get(key, {}));
        const newSettings = { ...currentSaved, ...settings };

        store.set(key, newSettings);

        // Use smart notification system
        windowNotificationManager.notifyRelevantWindows({ event: 'settings-updated', args: [newSettings] });

        return { success: true };
    } catch (error) {
        log.error({ err: error }, 'Error saving settings to store');
        return { success: false, error: errorMessage(error) };
    }
}

async function getPresets() {
    try {
        // The adapter now handles which presets to return based on login state.
        const presets = await settingsRepository.getPresets();
        return presets;
    } catch (error) {
        log.error({ err: error }, 'Error getting presets');
        return [];
    }
}

async function getAutoUpdateSetting() {
    try {
        return settingsRepository.getAutoUpdate();
    } catch (error) {
        log.error({ err: error }, 'Error getting auto update setting');
        return true; // Fallback to enabled
    }
}

async function setAutoUpdateSetting(isEnabled: boolean): Promise<{ success: true } | { success: false; error: string }> {
    try {
        await settingsRepository.setAutoUpdate(isEnabled);
        return { success: true };
    } catch (error) {
        log.error({ err: error }, 'Error setting auto update setting');
        return { success: false, error: errorMessage(error) };
    }
}

function notifyPresetUpdate({ action, presetId, title = null }: { action: string; presetId: string; title?: string | null }) {
    const data: { action: string; presetId: string; title?: string } = { action, presetId };
    if (title) data.title = title;

    windowNotificationManager.notifyRelevantWindows({ event: 'presets-updated', args: [data] });
}

export { notifyPresetUpdate, getSettings, saveSettings, getPresets, getAutoUpdateSetting, setAutoUpdateSetting };
