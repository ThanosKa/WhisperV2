import { globalShortcut, screen } from 'electron';
import type { BrowserWindow } from 'electron';
import internalBridge from '../../bridge/internalBridge';
import askService from '../ask/askService';
import { logger } from '../common/utils/logger';

const log = logger.child({ module: 'ShortcutsService' });

type Keybinds = {
    moveUp: string;
    moveDown: string;
    moveLeft: string;
    moveRight: string;
    toggleVisibility: string;
    toggleClickThrough: string;
    nextStep: string;
    manualScreenshot: string;
    previousResponse: string;
    nextResponse: string;
};

class ShortcutsService {
    private mouseEventsIgnored = false;
    private windowPool: Map<string, BrowserWindow> | null = null;
    private allWindowVisibility = true;

    initialize(windowPool: Map<string, BrowserWindow>) {
        this.windowPool = windowPool;
        internalBridge.on('reregister-shortcuts', () => {
            log.info('Reregistering shortcuts due to header state change');
            void this.registerShortcuts();
        });
        log.info('Initialized with dependencies and event listener');
    }

    getDefaultKeybinds(): Keybinds {
        // Use CommandOrControl for cross-platform compatibility.
        return {
            moveUp: 'CommandOrControl+Up',
            moveDown: 'CommandOrControl+Down',
            moveLeft: 'CommandOrControl+Left',
            moveRight: 'CommandOrControl+Right',
            toggleVisibility: 'CommandOrControl+\\',
            toggleClickThrough: 'CommandOrControl+M',
            nextStep: 'CommandOrControl+Enter',
            manualScreenshot: 'CommandOrControl+Shift+S',
            previousResponse: 'CommandOrControl+[',
            nextResponse: 'CommandOrControl+]',
        };
    }

    async loadKeybinds(): Promise<Keybinds> {
        // Always return default keybinds and don't touch the database.
        return this.getDefaultKeybinds();
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
        const windowPool = this.windowPool;
        if (!windowPool) {
            log.error('Service not initialized. Cannot register shortcuts.');
            return;
        }
        const keybinds = await this.loadKeybinds();
        globalShortcut.unregisterAll();

        const header = windowPool.get('header');
        const mainWindow = header;

        const sendToRenderer = (channel: string) => {
            windowPool.forEach(win => {
                if (win && !win.isDestroyed()) {
                    try {
                        win.webContents.send(channel);
                    } catch {
                        // Ignore errors for destroyed windows
                    }
                }
            });
        };

        if (registerOnlyToggleVisibility) {
            if (keybinds.toggleVisibility) {
                globalShortcut.register(keybinds.toggleVisibility, () => void this.toggleAllWindowsVisibility());
            }
            log.info('registerOnlyToggleVisibility, only toggleVisibility shortcut is registered');
            return;
        }

        // --- Hardcoded shortcuts ---
        // Unified modifier using 'CommandOrControl' for all platforms
        const modifier = 'CommandOrControl';

        // Monitor switching (temporarily disabled to prevent cross-monitor moves)
        const ALLOW_MONITOR_SWITCHING = false;
        if (ALLOW_MONITOR_SWITCHING) {
            const displays = screen.getAllDisplays();
            if (displays.length > 1) {
                displays.forEach((display, index) => {
                    const key = `${modifier}+Shift+${index + 1}`;
                    globalShortcut.register(key, () => internalBridge.emit('window:moveToDisplay', { displayId: display.id }));
                });
            }
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

        const moveStep = (direction: string) => () => {
            if (header && header.isVisible()) internalBridge.emit('window:moveStep', { direction });
        };

        for (const [action, accelerator] of Object.entries(keybinds)) {
            if (!accelerator) continue;

            let callback: (() => void) | undefined;
            switch (action) {
                case 'toggleVisibility':
                    callback = () => void this.toggleAllWindowsVisibility();
                    break;
                case 'nextStep':
                    callback = () => void askService.toggleAskButton(true);
                    break;
                case 'moveUp':
                    callback = moveStep('up');
                    break;
                case 'moveDown':
                    callback = moveStep('down');
                    break;
                case 'moveLeft':
                    callback = moveStep('left');
                    break;
                case 'moveRight':
                    callback = moveStep('right');
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
                            void mainWindow.webContents.executeJavaScript('window.captureManualScreenshot && window.captureManualScreenshot();');
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
                    log.error({ err: e, action, accelerator }, 'Failed to register shortcut');
                }
            }
        }
        log.info('All shortcuts have been registered');
    }

    unregisterAll() {
        globalShortcut.unregisterAll();
        log.info('All shortcuts have been unregistered');
    }
}

const shortcutsService = new ShortcutsService();

export default shortcutsService;
