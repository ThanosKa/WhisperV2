// src/bridge/windowBridge.js
const { ipcMain, shell } = require('electron');

// Bridge only registers IPC handlers (no business logic)
module.exports = {
    initialize() {
        // Require windowManager at initialization to resolve circular dependency
        const windowManager = require('../window/windowManager');

        // Existing IPC handlers
        ipcMain.handle('toggle-content-protection', () => windowManager.toggleContentProtection());
        ipcMain.handle('resize-header-window', (event, args) => windowManager.resizeHeaderWindow(args));
        ipcMain.handle('get-content-protection-status', () => windowManager.getContentProtectionStatus());
        ipcMain.on('show-settings-window', () => windowManager.showSettingsWindow());
        ipcMain.on('hide-settings-window', () => windowManager.hideSettingsWindow());
        ipcMain.on('cancel-hide-settings-window', () => windowManager.cancelHideSettingsWindow());
        // Screenshot window show/hide
        ipcMain.on('show-screenshot-window', (event, { base64Data, position }) => windowManager.showScreenshotWindow(base64Data, position));
        ipcMain.on('hide-screenshot-window', () => windowManager.hideScreenshotWindow());
        ipcMain.on('cancel-hide-screenshot-window', () => windowManager.cancelHideScreenshotWindow());
        // Plan tooltip show/hide
        ipcMain.on('window:showPlanWindow', (event, { visible }) => windowManager.showPlanWindow(visible));
        ipcMain.on('hide-plan-window', () => windowManager.hidePlanWindow());
        ipcMain.on('cancel-hide-plan-window', () => windowManager.cancelHidePlanWindow());

        ipcMain.handle('open-login-page', () => windowManager.openLoginPage());
        ipcMain.handle('open-personalize-page', () => windowManager.openLoginPage());
        ipcMain.handle('move-window-step', (event, direction) => windowManager.moveWindowStep(direction));
        ipcMain.handle('open-external', (event, url) => shell.openExternal(url));

        // Newly moved handlers from windowManager
        ipcMain.on('header-state-changed', (event, state) => windowManager.handleHeaderStateChanged(state));
        ipcMain.on('header-animation-finished', (event, state) => windowManager.handleHeaderAnimationFinished(state));
        ipcMain.handle('get-header-position', () => windowManager.getHeaderPosition());
        ipcMain.handle('move-header-to', (event, newX, newY) => windowManager.moveHeaderTo(newX, newY));
        ipcMain.handle('adjust-window-height', (event, { winName, height }) => windowManager.adjustWindowHeight(winName, height));

        // Window visibility controls
        ipcMain.handle('window:set-visibility', (event, { name, visible }) => windowManager.setWindowVisibility(name, visible));
        ipcMain.handle('window:is-visible', (event, name) => windowManager.isWindowVisible(name));

        // Display management
        ipcMain.handle('get-displays', () => windowManager.listDisplays());
        ipcMain.handle('move-to-display', (event, displayId) => windowManager.moveToDisplay(displayId));

        // Force show permission onboarding
        ipcMain.handle('header:force-show-permission', () => windowManager.forceShowPermissionOnboarding());
    },

    notifyFocusChange(win, isFocused) {
        win.webContents.send('window:focus-change', isFocused);
    },
};
