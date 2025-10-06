const { ipcMain, BrowserWindow } = require('electron');
const Store = require('electron-store');
const authService = require('../common/services/authService');
const settingsRepository = require('./repositories');
const { windowPool } = require('../../window/windowManager');

// New imports for common services
// Model provider management removed (server-only)

const store = new Store({
    name: 'whisper-settings',
    defaults: {
        users: {},
    },
});

// Configuration constants
const NOTIFICATION_CONFIG = {
    RELEVANT_WINDOW_TYPES: ['settings', 'main', 'listen'],
    DEBOUNCE_DELAY: 300, // prevent spam during bulk operations (ms)
    MAX_RETRY_ATTEMPTS: 3,
    RETRY_BASE_DELAY: 1000, // exponential backoff base (ms)
};

// Removed provider-model facade functions

// window targeting system
class WindowNotificationManager {
    constructor() {
        this.pendingNotifications = new Map();
    }

    /**
     * Send notifications only to relevant windows
     * @param {string} event - Event name
     * @param {*} data - Event data
     * @param {object} options - Notification options
     */
    notifyRelevantWindows(event, data = null, options = {}) {
        const { windowTypes = NOTIFICATION_CONFIG.RELEVANT_WINDOW_TYPES, debounce = NOTIFICATION_CONFIG.DEBOUNCE_DELAY } = options;

        if (debounce > 0) {
            this.debounceNotification(
                event,
                () => {
                    this.sendToTargetWindows(event, data, windowTypes);
                },
                debounce
            );
        } else {
            this.sendToTargetWindows(event, data, windowTypes);
        }
    }

    sendToTargetWindows(event, data, windowTypes) {
        const relevantWindows = this.getRelevantWindows(windowTypes);

        if (relevantWindows.length === 0) {
            console.log(`[WindowNotificationManager] No relevant windows found for event: ${event}`);
            return;
        }

        console.log(`[WindowNotificationManager] Sending ${event} to ${relevantWindows.length} relevant windows`);

        relevantWindows.forEach(win => {
            try {
                if (data) {
                    win.webContents.send(event, data);
                } else {
                    win.webContents.send(event);
                }
            } catch (error) {
                console.warn(`[WindowNotificationManager] Failed to send ${event} to window:`, error.message);
            }
        });
    }

    getRelevantWindows(windowTypes) {
        const allWindows = BrowserWindow.getAllWindows();
        const relevantWindows = [];

        allWindows.forEach(win => {
            if (win.isDestroyed()) return;

            for (const [windowName, poolWindow] of windowPool || []) {
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

    debounceNotification(key, fn, delay) {
        // Clear existing timeout
        if (this.pendingNotifications.has(key)) {
            clearTimeout(this.pendingNotifications.get(key));
        }

        // Set new timeout
        const timeoutId = setTimeout(() => {
            fn();
            this.pendingNotifications.delete(key);
        }, delay);

        this.pendingNotifications.set(key, timeoutId);
    }

    cleanup() {
        // Clear all pending notifications
        this.pendingNotifications.forEach(timeoutId => clearTimeout(timeoutId));
        this.pendingNotifications.clear();
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

// Service state
let currentSettings = null;

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
        googleSearchEnabled: false,
        backgroundTransparency: 0.5,
        fontSize: 14,
        contentProtection: true,
        analysisPresetId: 'meetings',
    };
}

async function getSettings() {
    try {
        const uid = authService.getCurrentUserId();
        const userSettingsKey = uid ? `users.${uid}` : 'users.default';

        const defaultSettings = getDefaultSettings();
        const savedSettings = store.get(userSettingsKey, {});

        currentSettings = { ...defaultSettings, ...savedSettings };
        return currentSettings;
    } catch (error) {
        console.error('[SettingsService] Error getting settings from store:', error);
        return getDefaultSettings();
    }
}

async function saveSettings(settings) {
    try {
        const uid = authService.getCurrentUserId();
        const userSettingsKey = uid ? `users.${uid}` : 'users.default';

        const currentSaved = store.get(userSettingsKey, {});
        const newSettings = { ...currentSaved, ...settings };

        store.set(userSettingsKey, newSettings);
        currentSettings = newSettings;

        // Use smart notification system
        windowNotificationManager.notifyRelevantWindows('settings-updated', currentSettings);

        return { success: true };
    } catch (error) {
        console.error('[SettingsService] Error saving settings to store:', error);
        return { success: false, error: error.message };
    }
}

async function getPresets() {
    try {
        // The adapter now handles which presets to return based on login state.
        const presets = await settingsRepository.getPresets();
        return presets;
    } catch (error) {
        console.error('[SettingsService] Error getting presets:', error);
        return [];
    }
}

async function getPresetTemplates() {
    try {
        const templates = await settingsRepository.getPresetTemplates();
        return templates;
    } catch (error) {
        console.error('[SettingsService] Error getting preset templates:', error);
        return [];
    }
}

async function updatePreset(id, updates) {
    // updates: {title?, prompt?, append_text?}
    try {
        // The adapter injects the UID.
        await settingsRepository.updatePreset(id, updates);
        windowNotificationManager.notifyRelevantWindows('presets-updated', {
            action: 'updated',
            presetId: id,
            title: updates.title || undefined, // Only if changed
        });
        return { success: true };
    } catch (error) {
        console.error('[SettingsService] Error updating preset:', error);
        return { success: false, error: error.message };
    }
}

// Removed API key save/remove (server-only)

async function updateContentProtection(enabled) {
    try {
        const settings = await getSettings();
        settings.contentProtection = enabled;

        // Update content protection in main window
        const { app } = require('electron');
        const mainWindow = windowPool.get('main');
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.setContentProtection(enabled);
        }

        return await saveSettings(settings);
    } catch (error) {
        console.error('[SettingsService] Error updating content protection:', error);
        return { success: false, error: error.message };
    }
}

async function getAutoUpdateSetting() {
    try {
        return settingsRepository.getAutoUpdate();
    } catch (error) {
        console.error('[SettingsService] Error getting auto update setting:', error);
        return true; // Fallback to enabled
    }
}

async function setAutoUpdateSetting(isEnabled) {
    try {
        await settingsRepository.setAutoUpdate(isEnabled);
        return { success: true };
    } catch (error) {
        console.error('[SettingsService] Error setting auto update setting:', error);
        return { success: false, error: error.message };
    }
}

function initialize() {
    // cleanup
    windowNotificationManager.cleanup();

    console.log('[SettingsService] Initialized and ready.');
}

// Cleanup function
function cleanup() {
    windowNotificationManager.cleanup();
    console.log('[SettingsService] Cleaned up resources.');
}

function notifyPresetUpdate(action, presetId, title = null) {
    const data = { action, presetId };
    if (title) data.title = title;

    windowNotificationManager.notifyRelevantWindows('presets-updated', data);
}

module.exports = {
    initialize,
    cleanup,
    notifyPresetUpdate,
    getSettings,
    saveSettings,
    getPresets,
    getPresetTemplates,
    updatePreset,
    updateContentProtection,
    getAutoUpdateSetting,
    setAutoUpdateSetting,
};
