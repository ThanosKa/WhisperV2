const { globalShortcut, screen } = require('electron');
const shortcutsRepository = require('./repositories');
const internalBridge = require('../../bridge/internalBridge');
const askService = require('../ask/askService');

class ShortcutsService {
    constructor() {
        this.lastVisibleWindows = new Set(['header']);
        this.mouseEventsIgnored = false;
        this.windowPool = null;
        this.allWindowVisibility = true;
    }

    initialize(windowPool) {
        this.windowPool = windowPool;
        internalBridge.on('reregister-shortcuts', () => {
            console.log('[ShortcutsService] Reregistering shortcuts due to header state change.');
            this.registerShortcuts();
        });
        console.log('[ShortcutsService] Initialized with dependencies and event listener.');
    }

    getDefaultKeybinds() {
        // Unified shortcuts using 'Cmd' for all platforms for simplicity
        return {
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
    }

    async loadKeybinds() {
        let keybindsArray = await shortcutsRepository.getAllKeybinds();

        if (!keybindsArray || keybindsArray.length === 0) {
            console.log(`[Shortcuts] No keybinds found. Loading defaults.`);
            const defaults = this.getDefaultKeybinds();
            await this.saveKeybinds(defaults);
            return defaults;
        }

        const keybinds = {};
        keybindsArray.forEach(k => {
            keybinds[k.action] = k.accelerator;
        });

        const defaults = this.getDefaultKeybinds();
        let needsUpdate = false;
        for (const action in defaults) {
            if (!keybinds[action]) {
                keybinds[action] = defaults[action];
                needsUpdate = true;
            }
        }

        if (needsUpdate) {
            console.log('[Shortcuts] Updating missing keybinds with defaults.');
            await this.saveKeybinds(keybinds);
        }

        return keybinds;
    }

    async saveKeybinds(newKeybinds) {
        const keybindsToSave = [];
        for (const action in newKeybinds) {
            if (Object.prototype.hasOwnProperty.call(newKeybinds, action)) {
                keybindsToSave.push({
                    action: action,
                    accelerator: newKeybinds[action],
                });
            }
        }
        await shortcutsRepository.upsertKeybinds(keybindsToSave);
        console.log(`[Shortcuts] Saved keybinds.`);
    }

    async toggleAllWindowsVisibility() {
        const targetVisibility = !this.allWindowVisibility;
        internalBridge.emit('window:requestToggleAllWindowsVisibility', {
            targetVisibility: targetVisibility,
        });

        if (this.allWindowVisibility) {
            await this.registerShortcuts(true);
        } else {
            await this.registerShortcuts();
        }

        this.allWindowVisibility = !this.allWindowVisibility;
    }

    async registerShortcuts(registerOnlyToggleVisibility = false) {
        if (!this.windowPool) {
            console.error('[Shortcuts] Service not initialized. Cannot register shortcuts.');
            return;
        }
        const keybinds = await this.loadKeybinds();
        globalShortcut.unregisterAll();

        const header = this.windowPool.get('header');
        const mainWindow = header;

        const sendToRenderer = (channel, ...args) => {
            this.windowPool.forEach(win => {
                if (win && !win.isDestroyed()) {
                    try {
                        win.webContents.send(channel, ...args);
                    } catch (e) {
                        // Ignore errors for destroyed windows
                    }
                }
            });
        };

        if (registerOnlyToggleVisibility) {
            if (keybinds.toggleVisibility) {
                globalShortcut.register(keybinds.toggleVisibility, () => this.toggleAllWindowsVisibility());
            }
            console.log('[Shortcuts] registerOnlyToggleVisibility, only toggleVisibility shortcut is registered.');
            return;
        }

        // --- Hardcoded shortcuts ---
        // Unified modifier using 'Cmd' for all platforms
        const modifier = 'Cmd';

        // Monitor switching
        const displays = screen.getAllDisplays();
        if (displays.length > 1) {
            displays.forEach((display, index) => {
                const key = `${modifier}+Shift+${index + 1}`;
                globalShortcut.register(key, () => internalBridge.emit('window:moveToDisplay', { displayId: display.id }));
            });
        }

        // Edge snapping
        const edgeDirections = [
            { key: `${modifier}+Shift+Left`, direction: 'left' },
            { key: `${modifier}+Shift+Right`, direction: 'right' },
        ];
        edgeDirections.forEach(({ key, direction }) => {
            globalShortcut.register(key, () => {
                if (header && header.isVisible()) internalBridge.emit('window:moveToEdge', { direction });
            });
        });

        // --- User-configurable shortcuts ---
        if (header?.currentHeaderState === 'apikey') {
            if (keybinds.toggleVisibility) {
                globalShortcut.register(keybinds.toggleVisibility, () => this.toggleAllWindowsVisibility());
            }
            console.log('[Shortcuts] ApiKeyHeader is active, only toggleVisibility shortcut is registered.');
            return;
        }

        for (const action in keybinds) {
            const accelerator = keybinds[action];
            if (!accelerator) continue;

            let callback;
            switch (action) {
                case 'toggleVisibility':
                    callback = () => this.toggleAllWindowsVisibility();
                    break;
                case 'nextStep':
                    callback = () => askService.toggleAskButton(true);
                    break;
                case 'moveUp':
                    callback = () => {
                        if (header && header.isVisible()) internalBridge.emit('window:moveStep', { direction: 'up' });
                    };
                    break;
                case 'moveDown':
                    callback = () => {
                        if (header && header.isVisible()) internalBridge.emit('window:moveStep', { direction: 'down' });
                    };
                    break;
                case 'moveLeft':
                    callback = () => {
                        if (header && header.isVisible()) internalBridge.emit('window:moveStep', { direction: 'left' });
                    };
                    break;
                case 'moveRight':
                    callback = () => {
                        if (header && header.isVisible()) internalBridge.emit('window:moveStep', { direction: 'right' });
                    };
                    break;
                case 'toggleClickThrough':
                    callback = () => {
                        this.mouseEventsIgnored = !this.mouseEventsIgnored;
                        if (mainWindow && !mainWindow.isDestroyed()) {
                            mainWindow.setIgnoreMouseEvents(this.mouseEventsIgnored, { forward: true });
                            mainWindow.webContents.send('click-through-toggled', this.mouseEventsIgnored);
                        }
                    };
                    break;
                case 'manualScreenshot':
                    callback = () => {
                        if (mainWindow && !mainWindow.isDestroyed()) {
                            mainWindow.webContents.executeJavaScript('window.captureManualScreenshot && window.captureManualScreenshot();');
                        }
                    };
                    break;
                case 'previousResponse':
                    callback = () => sendToRenderer('navigate-previous-response');
                    break;
                case 'nextResponse':
                    callback = () => sendToRenderer('navigate-next-response');
                    break;
            }

            if (callback) {
                try {
                    globalShortcut.register(accelerator, callback);
                } catch (e) {
                    console.error(`[Shortcuts] Failed to register shortcut for "${action}" (${accelerator}):`, e.message);
                }
            }
        }
        console.log('[Shortcuts] All shortcuts have been registered.');
    }

    unregisterAll() {
        globalShortcut.unregisterAll();
        console.log('[Shortcuts] All shortcuts have been unregistered.');
    }
}

const shortcutsService = new ShortcutsService();

module.exports = shortcutsService;
