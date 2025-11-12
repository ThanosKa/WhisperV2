// src/bridge/featureBridge.js
const { ipcMain, app, BrowserWindow } = require('electron');
const settingsService = require('../features/settings/settingsService');
const authService = require('../features/common/services/authService');
// Model provider management removed (server-only)
const shortcutsService = require('../features/shortcuts/shortcutsService');
const presetRepository = require('../features/common/repositories/preset');
const askService = require('../features/ask/askService');
const listenService = require('../features/listen/listenService');
const permissionService = require('../features/common/services/permissionService');

module.exports = {
    // Receive requests from renderer and forward to services
    initialize() {
        // Settings Service
        ipcMain.handle('settings:getPresets', async () => await settingsService.getPresets());
        ipcMain.handle('settings:getSettings', async () => await settingsService.getSettings());
        ipcMain.handle('settings:saveSettings', async (event, settings) => await settingsService.saveSettings(settings));
        ipcMain.handle('settings:get-auto-update', async () => await settingsService.getAutoUpdateSetting());
        ipcMain.handle('settings:set-auto-update', async (event, isEnabled) => await settingsService.setAutoUpdateSetting(isEnabled));
        ipcMain.handle('settings:get-app-version', async () => {
            const { app } = require('electron');
            return app.getVersion();
        });
        // Removed legacy provider-model settings IPC

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

        // User/Auth
        ipcMain.handle('get-current-user', () => authService.getCurrentUser());
        ipcMain.handle('start-webapp-auth', async () => await authService.startWebappAuthFlow());
        ipcMain.handle('reset-auth-state', async () => {
            // Reset auth state - this is a no-op on the backend
            // The actual state reset happens in the renderer
            return { success: true };
        });

        // New logout handler
        ipcMain.handle('sign-out', async () => {
            await authService.signOut();
            return { success: true };
        });

        // App
        ipcMain.handle('quit-application', () => app.quit());

        // General
        ipcMain.handle('get-preset-templates', () => presetRepository.getPresetTemplates());
        ipcMain.handle('get-web-url', () => process.env.whisper_WEB_URL || 'http://localhost:3000');

        // Ask
        ipcMain.handle('ask:sendQuestionFromAsk', async (event, userPrompt, useScreenCapture = true) => {
            // Get conversation history from listenService and pass it to askService
            const conversationHistory = listenService.getConversationHistory();
            console.log(`[FeatureBridge] ask:sendQuestionFromAsk: clickLen=${userPrompt?.length || 0}, historyItems=${conversationHistory.length}, useScreenCapture=${useScreenCapture}`);
            if (Array.isArray(conversationHistory)) {
                const preview = conversationHistory.slice(-2);
                console.log('[FeatureBridge] history preview:', JSON.stringify(preview));
            }
            return await askService.sendMessageManual(userPrompt, conversationHistory, useScreenCapture);
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
        ipcMain.handle('ask:setUseScreenCapture', async (event, value) => {
            askService.state.useScreenCapture = value;
        });
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

        // Model provider IPC removed; keep a no-op re-initialize for header compat
        ipcMain.handle('model:re-initialize-state', async () => ({ success: true }));
        // Removed broadcasting model-state/settings-updated from modelStateService

        console.log('[FeatureBridge] Initialized with core feature handlers.');
    },

    // Send status to renderer
    sendAskProgress(win, progress) {
        win.webContents.send('feature:ask:progress', progress);
    },
};
