import { shell, BrowserWindow } from 'electron';
import * as windowManager from '../window/windowManager';
import { handle, on } from '../ipc/typedIpc';
import { sendEvent } from '../ipc/sendEvent';

// Bridge only registers IPC handlers (no business logic)
export default {
    initialize() {
        handle({ channel: 'toggle-content-protection', handler: () => windowManager.toggleContentProtection() });
        handle({ channel: 'resize-header-window', handler: args => windowManager.resizeHeaderWindow(args) });
        handle({ channel: 'get-content-protection-status', handler: () => windowManager.getContentProtectionStatus() });
        on({ channel: 'show-settings-window', listener: () => windowManager.showSettingsWindow() });
        on({ channel: 'hide-settings-window', listener: () => windowManager.hideSettingsWindow() });
        on({ channel: 'cancel-hide-settings-window', listener: () => windowManager.cancelHideSettingsWindow() });
        // Screenshot window show/hide
        on({
            channel: 'show-screenshot-window',
            listener: ({ base64Data, position }) => windowManager.showScreenshotWindow({ base64Data, position }),
        });
        on({ channel: 'hide-screenshot-window', listener: () => windowManager.hideScreenshotWindow() });
        on({ channel: 'cancel-hide-screenshot-window', listener: () => windowManager.cancelHideScreenshotWindow() });
        // Plan tooltip show/hide
        on({ channel: 'window:showPlanWindow', listener: ({ visible }) => windowManager.showPlanWindow(visible) });
        on({ channel: 'hide-plan-window', listener: () => windowManager.hidePlanWindow() });
        on({ channel: 'cancel-hide-plan-window', listener: () => windowManager.cancelHidePlanWindow() });

        // Recovery toast
        handle({
            channel: 'recovery-toast:show',
            handler: (sessionInfo, headerBounds) => {
                windowManager.showRecoveryToast({ sessionInfo, headerBounds });
                return { success: true };
            },
        });

        handle({ channel: 'open-personalize-page', handler: () => windowManager.openLoginPage() });
        handle({ channel: 'move-window-step', handler: direction => windowManager.moveWindowStep(direction) });
        handle({ channel: 'open-external', handler: url => shell.openExternal(url) });

        on({ channel: 'header-state-changed', listener: state => windowManager.handleHeaderStateChanged(state) });
        on({ channel: 'header-animation-finished', listener: state => windowManager.handleHeaderAnimationFinished(state) });
        handle({ channel: 'get-header-position', handler: () => windowManager.getHeaderPosition() });
        handle({ channel: 'move-header-to', handler: (newX, newY) => windowManager.moveHeaderTo({ newX, newY }) });
        handle({
            channel: 'adjust-window-height',
            handler: ({ winName, height }) => windowManager.adjustWindowHeight({ winName, targetHeight: height }),
        });

        // Window visibility controls
        handle({ channel: 'window:set-visibility', handler: ({ name, visible }) => windowManager.setWindowVisibility({ name, visible }) });
        handle({ channel: 'window:is-visible', handler: name => windowManager.isWindowVisible(name) });

        // Display management
        handle({ channel: 'get-displays', handler: () => windowManager.listDisplays() });
        handle({ channel: 'move-to-display', handler: displayId => windowManager.moveToDisplay(displayId) });

        // Force show permission onboarding
        handle({ channel: 'header:force-show-permission', handler: () => windowManager.forceShowPermissionOnboarding() });

        // Auth events: one window starting sign-in tells every window
        on({
            channel: 'auth-started',
            listener: () => {
                BrowserWindow.getAllWindows().forEach(win => {
                    if (win && !win.isDestroyed() && win.webContents && !win.webContents.isDestroyed()) {
                        sendEvent({ webContents: win.webContents, channel: 'auth-started', args: [] });
                    }
                });
            },
        });
    },
};
