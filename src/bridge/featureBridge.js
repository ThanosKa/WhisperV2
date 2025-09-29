// src/bridge/featureBridge.js
const { ipcMain, app, BrowserWindow } = require('electron');
const settingsService = require('../features/settings/settingsService');
const authService = require('../features/common/services/authService');
const shortcutsService = require('../features/shortcuts/shortcutsService');
const presetRepository = require('../features/common/repositories/preset');
const askService = require('../features/ask/askService');
const listenService = require('../features/listen/listenService');
const permissionService = require('../features/common/services/permissionService');
const encryptionService = require('../features/common/services/encryptionService');

module.exports = {
    // Receive requests from renderer and forward to services
    initialize() {
        // Settings Service
        ipcMain.handle('settings:getPresets', async () => await settingsService.getPresets());
        ipcMain.handle('settings:get-auto-update', async () => await settingsService.getAutoUpdateSetting());
        ipcMain.handle('settings:set-auto-update', async (event, isEnabled) => await settingsService.setAutoUpdateSetting(isEnabled));
        ipcMain.handle('settings:clear-api-key', async (e, { provider }) => await settingsService.clearApiKey(provider));
        ipcMain.handle('settings:set-selected-model', async (e, { type, modelId }) => await settingsService.setSelectedModel(type, modelId));

        // Add new handler for opening DB path
        ipcMain.handle('settings:open-db-path', async () => {
            const { app, shell } = require('electron');
            try {
                const userDataPath = app.getPath('userData');
                await shell.openPath(userDataPath);
                console.log('[FeatureBridge] Opened DB folder:', userDataPath);
                return { success: true };
            } catch (error) {
                console.error('[FeatureBridge] Failed to open DB folder:', error);
                return { success: false, error: error.message };
            }
        });

        // Shortcuts
        ipcMain.handle('settings:getCurrentShortcuts', async () => await shortcutsService.loadKeybinds());
        ipcMain.handle('shortcut:toggleAllWindowsVisibility', async () => await shortcutsService.toggleAllWindowsVisibility());

        // Permissions
        ipcMain.handle('check-system-permissions', async () => await permissionService.checkSystemPermissions());
        ipcMain.handle('request-microphone-permission', async () => await permissionService.requestMicrophonePermission());
        ipcMain.handle('open-system-preferences', async (event, section) => await permissionService.openSystemPreferences(section));
        ipcMain.handle('mark-keychain-completed', async () => await permissionService.markKeychainCompleted());
        ipcMain.handle('check-keychain-completed', async () => await permissionService.checkKeychainCompleted());
        ipcMain.handle('initialize-encryption-key', async () => {
            const userId = authService.getCurrentUserId();
            if (!userId) {
                console.log('[FeatureBridge] Cannot initialize encryption key: user not authenticated');
                return { success: false, error: 'User not authenticated' };
            }
            await encryptionService.initializeKey(userId);
            return { success: true };
        });

        // User/Auth
        ipcMain.handle('get-current-user', () => authService.getCurrentUser());
        ipcMain.handle('start-webapp-auth', async () => await authService.startWebappAuthFlow());
        ipcMain.handle('firebase-logout', async () => await authService.signOut());

        // App
        ipcMain.handle('quit-application', () => app.quit());

        // General
        ipcMain.handle('get-preset-templates', () => presetRepository.getPresetTemplates());
        ipcMain.handle('get-web-url', () => process.env.pickleglass_WEB_URL || 'http://localhost:3000');

        // Ask
        ipcMain.handle('ask:sendQuestionFromAsk', async (event, userPrompt) => {
            // Get conversation history from listenService and pass it to askService
            const conversationHistory = listenService.getConversationHistory();
            console.log(`[FeatureBridge] ask:sendQuestionFromAsk: clickLen=${userPrompt?.length || 0}, historyItems=${conversationHistory.length}`);
            if (Array.isArray(conversationHistory)) {
                const preview = conversationHistory.slice(-2);
                console.log('[FeatureBridge] history preview:', JSON.stringify(preview));
            }
            return await askService.sendMessageManual(userPrompt, conversationHistory);
        });
        ipcMain.handle('ask:sendQuestionFromSummary', async (event, userPrompt) => {
            // Get conversation history from listenService and pass it to askService
            const conversationHistory = listenService.getConversationHistory();
            console.log(
                `[FeatureBridge] ask:sendQuestionFromSummary: clickLen=${userPrompt?.length || 0}, historyItems=${conversationHistory.length}`
            );
            if (Array.isArray(conversationHistory)) {
                const preview = conversationHistory.slice(-2);
                console.log('[FeatureBridge] history preview:', JSON.stringify(preview));
            }
            const presetId = listenService.summaryService.selectedPresetId;
            return await askService.sendMessage(userPrompt, conversationHistory, presetId);
        });
        ipcMain.handle('ask:toggleAskButton', async () => await askService.toggleAskButton());
        ipcMain.handle('ask:closeAskWindow', async () => await askService.closeAskWindow());
        ipcMain.handle('ask:interruptStream', () => {
            askService.interruptStream();
        });

        // Listen
        ipcMain.handle('listen:sendMicAudio', async (event, { data, mimeType }) => await listenService.handleSendMicAudioContent(data, mimeType));
        ipcMain.handle('listen:sendSystemAudio', async (event, { data, mimeType }) => {
            const result = await listenService.sttService.sendSystemAudioContent(data, mimeType);
            if (result.success) {
                listenService.sendToRenderer('system-audio-data', { data });
            }
            return result;
        });
        ipcMain.handle('listen:startMacosSystemAudio', async () => await listenService.handleStartMacosAudio());
        ipcMain.handle('listen:stopMacosSystemAudio', async () => await listenService.handleStopMacosAudio());
        ipcMain.handle('update-google-search-setting', async (event, enabled) => await listenService.handleUpdateGoogleSearchSetting(enabled));
        ipcMain.handle('listen:isSessionActive', async () => await listenService.isSessionActive());
        ipcMain.handle('listen:changeSession', async (event, listenButtonText) => {
            console.log('[FeatureBridge] listen:changeSession from mainheader', listenButtonText);
            try {
                await listenService.handleListenRequest(listenButtonText);
                return { success: true };
            } catch (error) {
                console.error('[FeatureBridge] listen:changeSession failed', error.message);
                return { success: false, error: error.message };
            }
        });
        // Analysis presets for Listen (Phase 1)
        ipcMain.handle('listen:listAnalysisPresets', async () => {
            return await settingsService.getPresets();
        });
        ipcMain.handle('listen:getAnalysisPreset', async () => {
            const current = await settingsService.getSettings();
            return { presetId: current?.analysisPresetId || null };
        });
        ipcMain.handle('listen:setAnalysisPreset', async (event, { presetId }) => {
            try {
                // Persist selection
                await settingsService.saveSettings({ analysisPresetId: presetId || null });
                // Apply to summary service via listenService
                await listenService.summaryService.setAnalysisPreset(presetId || null);
                return { success: true };
            } catch (err) {
                console.error('[FeatureBridge] listen:setAnalysisPreset failed:', err.message);
                return { success: false, error: err.message };
            }
        });

        // ModelStateService
        console.log('[FeatureBridge] Initialized with all feature handlers.');
    },

    // Send status to renderer
    sendAskProgress(win, progress) {
        win.webContents.send('feature:ask:progress', progress);
    },
};
