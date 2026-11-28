import { app, BrowserWindow, shell } from 'electron';
import { autoUpdater } from 'electron-updater';
import * as settingsService from '../features/settings/settingsService';
import authService from '../features/common/services/authService';
import shortcutsService from '../features/shortcuts/shortcutsService';
import askService from '../features/ask/askService';
import listenService from '../features/listen/listenService';
import permissionService from '../features/common/services/permissionService';
import { env } from '../features/common/config/env';
import { errorMessage } from '../features/common/utils/errors';
import { logger } from '../features/common/utils/logger';
import { handle } from '../ipc/typedIpc';

const log = logger.child({ module: 'FeatureBridge' });

const updatesDisabledInDevelopment: { success: false; error: string } = { success: false, error: 'Development mode - updates disabled' };

export default {
    // Receive requests from renderer and forward to services
    initialize() {
        // Settings
        handle({ channel: 'settings:get-auto-update', handler: async () => await settingsService.getAutoUpdateSetting() });
        handle({ channel: 'settings:set-auto-update', handler: async isEnabled => await settingsService.setAutoUpdateSetting(isEnabled) });
        handle({ channel: 'settings:get-app-version', handler: async () => app.getVersion() });
        handle({
            channel: 'settings:open-db-path',
            handler: async () => {
                try {
                    const userDataPath = app.getPath('userData');
                    await shell.openPath(userDataPath);
                    log.info({ userDataPath }, 'Opened DB folder');
                    return { success: true };
                } catch (error) {
                    log.error({ err: error }, 'Failed to open DB folder');
                    return { success: false, error: errorMessage(error) };
                }
            },
        });

        // Shortcuts
        handle({ channel: 'settings:getCurrentShortcuts', handler: async () => await shortcutsService.loadKeybinds() });
        handle({ channel: 'shortcut:toggleAllWindowsVisibility', handler: async () => await shortcutsService.toggleAllWindowsVisibility() });

        // Permissions
        handle({ channel: 'check-system-permissions', handler: async () => await permissionService.checkSystemPermissions() });
        handle({ channel: 'request-microphone-permission', handler: async () => await permissionService.requestMicrophonePermission() });
        handle({ channel: 'open-system-preferences', handler: async section => await permissionService.openSystemPreferences(section) });

        // User/Auth
        handle({ channel: 'get-current-user', handler: () => authService.getCurrentUser() });
        handle({ channel: 'start-webapp-auth', handler: async () => await authService.startWebappAuthFlow() });
        // A no-op in main: the renderer resets its own auth state
        handle({ channel: 'reset-auth-state', handler: async () => ({ success: true }) });
        handle({
            channel: 'sign-out',
            handler: async () => {
                await authService.signOut();
                return { success: true };
            },
        });

        // App
        handle({ channel: 'quit-application', handler: () => app.quit() });

        // Auto-update
        handle({
            channel: 'app:check-for-updates',
            handler: async () => {
                try {
                    if (env.NODE_ENV === 'development') return updatesDisabledInDevelopment;
                    await autoUpdater.checkForUpdatesAndNotify();
                    return { success: true };
                } catch (error) {
                    log.error({ err: error }, 'Error checking for updates');
                    return { success: false, error: errorMessage(error) };
                }
            },
        });

        handle({
            channel: 'app:install-update',
            handler: async () => {
                try {
                    if (env.NODE_ENV === 'development') return updatesDisabledInDevelopment;

                    // Force close all windows to prevent "zombie" processes from blocking quit
                    // Using destroy() bypasses close event listeners that might prevent quit
                    log.info('Force closing all windows before update install');
                    BrowserWindow.getAllWindows().forEach(win => {
                        if (win && !win.isDestroyed()) {
                            log.info({ windowId: win.id }, 'Destroying window');
                            win.destroy();
                        }
                    });

                    // Small delay to ensure windows are fully destroyed
                    await new Promise(resolve => setTimeout(resolve, 100));

                    // isSilent=false: show normal quit behavior; isForceRunAfter=true: launch the updated app immediately
                    log.info('Calling quitAndInstall');
                    autoUpdater.quitAndInstall(false, true);
                    return { success: true };
                } catch (error) {
                    log.error({ err: error }, 'Error installing update');
                    return { success: false, error: errorMessage(error) };
                }
            },
        });

        // Ask
        handle({
            channel: 'ask:sendQuestionFromAsk',
            handler: async (userPrompt, useScreenCapture = true, webSearchEnabled = false) => {
                // Get conversation history from listenService and pass it to askService
                const conversationHistory = listenService.getConversationHistory();
                log.info(
                    { channel: 'ask:sendQuestionFromAsk', clickLen: userPrompt.length, historyItems: conversationHistory.length, useScreenCapture, webSearchEnabled },
                    'Question from Ask'
                );
                log.info({ preview: JSON.stringify(conversationHistory.slice(-2)) }, 'History preview');
                return await askService.sendMessageManual({ userPrompt, conversationHistory, useScreenCapture, webSearchEnabled });
            },
        });
        handle({
            channel: 'ask:sendQuestionFromSummary',
            handler: async userPrompt => {
                // Get conversation history from listenService and pass it to askService
                const conversationHistory = listenService.getConversationHistory();
                log.info(
                    { channel: 'ask:sendQuestionFromSummary', clickLen: userPrompt.length, historyItems: conversationHistory.length },
                    'Question from Summary'
                );
                log.info({ preview: JSON.stringify(conversationHistory.slice(-2)) }, 'History preview');
                const presetId = listenService.summaryService.selectedPresetId;
                return await askService.sendMessage({ userPrompt, conversationHistory, presetId });
            },
        });
        handle({ channel: 'ask:toggleAskButton', handler: async () => await askService.toggleAskButton() });
        handle({
            channel: 'ask:setUseScreenCapture',
            handler: async value => {
                askService.state.useScreenCapture = value;
            },
        });
        handle({ channel: 'ask:closeAskWindow', handler: async () => await askService.closeAskWindow() });
        handle({
            channel: 'ask:interruptStream',
            handler: () => {
                askService.interruptStream();
            },
        });

        // Listen
        handle({ channel: 'listen:sendMicAudio', handler: async ({ data, mimeType }) => await listenService.handleSendMicAudioContent({ data, mimeType }) });
        handle({
            channel: 'listen:sendSystemAudio',
            handler: async ({ data, mimeType }) => {
                const result = await listenService.sttService.sendSystemAudioContent({ data, mimeType });
                if (result.success) {
                    listenService.sendToRenderer({ channel: 'system-audio-data', data: { data } });
                }
                return result;
            },
        });
        handle({ channel: 'listen:startMacosSystemAudio', handler: async () => await listenService.handleStartMacosAudio() });
        handle({ channel: 'listen:stopMacosSystemAudio', handler: async () => await listenService.handleStopMacosAudio() });
        handle({ channel: 'listen:isSessionActive', handler: async () => listenService.isSessionActive() });
        handle({
            channel: 'listen:changeSession',
            handler: async listenButtonText => {
                log.info({ listenButtonText }, 'listen:changeSession from main header');
                try {
                    await listenService.handleListenRequest(listenButtonText);
                    return { success: true };
                } catch (error) {
                    log.error({ err: error, listenButtonText }, 'listen:changeSession failed');
                    return { success: false, error: errorMessage(error) };
                }
            },
        });
        // Analysis presets for Listen
        handle({ channel: 'listen:listAnalysisPresets', handler: async () => await settingsService.getPresets() });
        handle({
            channel: 'listen:getAnalysisPreset',
            handler: async () => {
                const current = await settingsService.getSettings();
                return { presetId: current.analysisPresetId || null };
            },
        });
        handle({
            channel: 'listen:setAnalysisPreset',
            handler: async ({ presetId }) => {
                try {
                    // Persist selection
                    await settingsService.saveSettings({ analysisPresetId: presetId || null });
                    // Apply to summary service via listenService
                    await listenService.summaryService.setAnalysisPreset(presetId || null);
                    return { success: true };
                } catch (error) {
                    log.error({ err: error, presetId }, 'listen:setAnalysisPreset failed');
                    return { success: false, error: errorMessage(error) };
                }
            },
        });

        // Recovery actions
        handle({
            channel: 'listen:handleRecoveryAction',
            handler: async (action, sessionId) => {
                try {
                    return await listenService.handleRecoveryAction({ action, sessionId });
                } catch (error) {
                    log.error({ err: error, action, sessionId }, 'Recovery action failed');
                    return { success: false, error: errorMessage(error) };
                }
            },
        });
        handle({
            channel: 'listen:getStrandedSession',
            handler: async () => {
                try {
                    return listenService.getStrandedSessionInfo();
                } catch (error) {
                    log.error({ err: error }, 'listen:getStrandedSession failed');
                    return null;
                }
            },
        });

        // Model providers are server-only; the header still calls this, so it stays a no-op
        handle({ channel: 'model:re-initialize-state', handler: async () => ({ success: true }) });

        log.info('Initialized with core feature handlers');
    },
};
