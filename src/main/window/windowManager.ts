import { BrowserWindow, screen, app, shell } from 'electron';
import type { Rectangle } from 'electron';
import WindowLayoutManager, { getCurrentDisplay } from './windowLayoutManager';
import type { Direction, WindowLayout } from './windowLayoutManager';
import SmoothMovementManager from './smoothMovementManager';
import path from 'node:path';
import shortcutsService from '../features/shortcuts/shortcutsService';
import internalBridge from '../bridge/internalBridge';
import askService from '../features/ask/askService';
import { env } from '../features/common/config/env';
import { logger } from '../features/common/utils/logger';
import { apiBaseUrlArgument } from '../../shared/preloadArguments';

const log = logger.child({ module: 'WindowManager' });

// Main is bundled into out/main/: the preload is built into out/preload/, and the Lit renderer is
// served from src/renderer/ with its esbuild bundles in public/build/ (build.js).
const PRELOAD_PATH = path.join(__dirname, '../preload/preload.js');
const RENDERER_APP_DIR = path.join(__dirname, '../../src/renderer/app');

type FeatureWindowName = 'listen' | 'ask' | 'settings' | 'plan' | 'screenshot' | 'recoveryToast';
type Visibility = { listen?: boolean; ask?: boolean };
type Timer = ReturnType<typeof setTimeout>;

let isContentProtectionOn = true;
const lastVisibleWindows = new Set(['header']);

let currentHeaderState = 'apikey';
const windowPool = new Map<string, BrowserWindow>();

// A caught value is `unknown`; the old code read `e?.message || 'unknown'`.
const failureReason = (e: unknown): string => (e instanceof Error && e.message) || 'unknown';

function notifyWindowVisibility({ name, visible }: { name: string; visible: boolean }) {
    if (name !== 'listen') return;
    const header = windowPool.get('header');
    if (!header || header.isDestroyed()) return;
    try {
        header.webContents.send('listen-window-visibility', !!visible);
    } catch (e) {
        log.warn({ err: e, name }, 'Failed to notify window visibility');
    }
}

let settingsHideTimer: Timer | null = null;
let screenshotHideTimer: Timer | null = null;
let planHideTimer: Timer | null = null;

let layoutManager: WindowLayoutManager | null = null;
let movementManager: SmoothMovementManager | null = null;

function visibleFeatureWindows(): Visibility {
    const visibleWindows: Visibility = {};
    const listenWin = windowPool.get('listen');
    const askWin = windowPool.get('ask');
    if (listenWin && !listenWin.isDestroyed() && listenWin.isVisible()) {
        visibleWindows.listen = true;
    }
    if (askWin && !askWin.isDestroyed() && askWin.isVisible()) {
        visibleWindows.ask = true;
    }
    return visibleWindows;
}

function updateChildWindowLayouts(animated = true) {
    if (!layoutManager || !movementManager) return;

    const visibleWindows = visibleFeatureWindows();
    if (Object.keys(visibleWindows).length === 0) return;

    const newLayout = layoutManager.calculateFeatureWindowLayout({ visibility: visibleWindows });
    movementManager.animateLayout({ layout: newLayout, animated });
}

const showSettingsWindow = () => {
    internalBridge.emit('window:requestVisibility', { name: 'settings', visible: true });
};

const hideSettingsWindow = () => {
    internalBridge.emit('window:requestVisibility', { name: 'settings', visible: false });
};

const cancelHideSettingsWindow = () => {
    internalBridge.emit('window:requestVisibility', { name: 'settings', visible: true });
};

type Point = { x: number; y: number };

const showScreenshotWindow = ({ base64Data, position }: { base64Data: string; position?: Point | undefined }) => {
    const screenshotWin = windowPool.get('screenshot');
    if (!screenshotWin || screenshotWin.isDestroyed()) {
        // Create window if it doesn't exist
        const header = windowPool.get('header');
        if (header && !header.isDestroyed()) {
            createFeatureWindows({ header, names: ['screenshot'] });
            const createdWin = windowPool.get('screenshot');
            if (!createdWin || createdWin.isDestroyed()) return;
            // The page can take longer than 100 ms to load (Electron 45), and data sent before it
            // listens is lost: send the data once the page has loaded.
            createdWin.webContents.once('did-finish-load', () => {
                if (!createdWin.isDestroyed()) createdWin.webContents.send('screenshot:data', base64Data);
            });
            // Wait a bit for window to be created, then show
            setTimeout(() => {
                const newWin = windowPool.get('screenshot');
                if (newWin && !newWin.isDestroyed()) {
                    if (position) {
                        log.info({ position }, 'Showing screenshot window');
                        const currentBounds = newWin.getBounds();
                        log.info({ currentBounds }, 'Screenshot current bounds');
                        newWin.setBounds({
                            x: position.x,
                            y: position.y,
                            width: 400,
                            height: 300,
                        });
                        const newBounds = newWin.getBounds();
                        log.info({ newBounds }, 'Screenshot bounds after setBounds');
                    }
                    newWin.show();
                    newWin.setAlwaysOnTop(true);
                    newWin.moveTop();
                }
            }, 100);
        }
        return;
    }

    // Cancel any pending hide operations
    if (screenshotHideTimer) {
        clearTimeout(screenshotHideTimer);
        screenshotHideTimer = null;
    }

    // Send screenshot data to window
    screenshotWin.webContents.send('screenshot:data', base64Data);

    // Position window near indicator
    if (position) {
        log.info({ position }, 'Showing screenshot window');
        const currentBounds = screenshotWin.getBounds();
        log.info({ currentBounds }, 'Screenshot current bounds');
        screenshotWin.setBounds({
            x: position.x,
            y: position.y,
            width: 400,
            height: 300,
        });
        const newBounds = screenshotWin.getBounds();
        log.info({ newBounds }, 'Screenshot bounds after setBounds');
    }

    screenshotWin.show();
    screenshotWin.setAlwaysOnTop(true);
    screenshotWin.moveTop();
};

const hideScreenshotWindow = () => {
    const screenshotWin = windowPool.get('screenshot');
    if (!screenshotWin || screenshotWin.isDestroyed()) return;

    // Hide after a delay
    if (screenshotHideTimer) {
        clearTimeout(screenshotHideTimer);
    }
    screenshotHideTimer = setTimeout(() => {
        if (screenshotWin && !screenshotWin.isDestroyed()) {
            screenshotWin.setAlwaysOnTop(false);
            screenshotWin.hide();
            screenshotHideTimer = null;
        }
    }, 200);
};

const cancelHideScreenshotWindow = () => {
    if (screenshotHideTimer) {
        clearTimeout(screenshotHideTimer);
        screenshotHideTimer = null;
    }
};

const hidePlanWindow = () => {
    const planWin = windowPool.get('plan');
    if (!planWin || planWin.isDestroyed()) return;

    log.info({ at: Date.now() }, 'hidePlanWindow called');

    // Hide after a delay
    if (planHideTimer) {
        log.info('Clearing existing planHideTimer');
        clearTimeout(planHideTimer);
    }
    log.info('Setting planHideTimer (200ms delay)');
    planHideTimer = setTimeout(() => {
        if (planWin && !planWin.isDestroyed()) {
            log.info({ at: Date.now() }, 'planHideTimer fired, hiding window');
            planWin.setAlwaysOnTop(false);
            planWin.hide();
            planHideTimer = null;
        }
    }, 200);
};

const cancelHidePlanWindow = () => {
    log.info({ at: Date.now() }, 'cancelHidePlanWindow called');
    if (planHideTimer) {
        log.info('Cancelling planHideTimer');
        clearTimeout(planHideTimer);
        planHideTimer = null;
    } else {
        log.info('No planHideTimer to cancel');
    }
};

// Plan tooltip window show/hide via external IPC
const showPlanWindow = (visible: boolean) => {
    internalBridge.emit('window:showPlanWindow', { visible });
};

const showRecoveryToast = ({ sessionInfo, headerBounds }: { sessionInfo: unknown; headerBounds?: Rectangle | undefined }) => {
    const toastWin = windowPool.get('recoveryToast');
    if (!toastWin || toastWin.isDestroyed()) {
        const header = windowPool.get('header');
        if (header) {
            createFeatureWindows({ header, names: ['recoveryToast'] });
            setTimeout(() => {
                const newWin = windowPool.get('recoveryToast');
                if (newWin && !newWin.isDestroyed()) {
                    positionRecoveryToast({ toastWin: newWin, headerBounds });
                    newWin.webContents.send('recovery-toast:show', sessionInfo);
                    newWin.show();
                    newWin.setAlwaysOnTop(true);
                    newWin.moveTop();
                }
            }, 100);
        }
        return;
    }

    positionRecoveryToast({ toastWin, headerBounds });
    toastWin.webContents.send('recovery-toast:show', sessionInfo);
    toastWin.show();
    toastWin.setAlwaysOnTop(true);
    toastWin.moveTop();
};

const positionRecoveryToast = ({ toastWin, headerBounds }: { toastWin: BrowserWindow; headerBounds?: Rectangle | undefined }) => {
    let bounds = headerBounds;
    if (!bounds) {
        const header = windowPool.get('header');
        if (header && !header.isDestroyed()) {
            bounds = header.getBounds();
        } else {
            return;
        }
    }

    // Position toast below Listen button (center of header, offset down)
    const toastWidth = 270;
    const toastHeight = 125;
    const offsetY = 10; // Gap below header

    const x = bounds.x + bounds.width / 2 - toastWidth / 2;
    const y = bounds.y + bounds.height + offsetY;

    toastWin.setBounds({
        x: Math.round(x),
        y: Math.round(y),
        width: toastWidth,
        height: toastHeight,
    });
};

const moveWindowStep = (direction: Direction) => {
    internalBridge.emit('window:moveStep', { direction });
};

const resizeHeaderWindow = ({ width, height }: { width: number; height: number }) => {
    internalBridge.emit('window:resizeHeaderWindow', { width, height });
};

const handleHeaderAnimationFinished = (state: string) => {
    internalBridge.emit('window:headerAnimationFinished', state);
};

const getHeaderPosition = () => {
    return new Promise<Rectangle>(resolve => {
        internalBridge.emit('window:getHeaderPosition', (position: Rectangle) => {
            resolve(position);
        });
    });
};

const moveHeaderTo = ({ newX, newY }: { newX: number; newY: number }) => {
    internalBridge.emit('window:moveHeaderTo', { newX, newY });
};

const adjustWindowHeight = ({ winName, targetHeight }: { winName: string; targetHeight: number }) => {
    internalBridge.emit('window:adjustWindowHeight', { winName, targetHeight });
};

// Expose visibility controls for specific windows (e.g., 'listen')
function setWindowVisibility({ name, visible }: { name: string; visible: boolean }) {
    try {
        internalBridge.emit('window:requestVisibility', { name, visible });
        return { success: true };
    } catch (e) {
        log.error({ err: e, name }, 'Failed to set window visibility');
        return { success: false, error: failureReason(e) };
    }
}

function isWindowVisible(name: string) {
    try {
        const win = windowPool.get(name);
        return !!(win && !win.isDestroyed() && win.isVisible());
    } catch {
        return false;
    }
}

function setupWindowController({
    layoutManager,
    movementManager,
}: {
    layoutManager: WindowLayoutManager;
    movementManager: SmoothMovementManager;
}) {
    internalBridge.on('window:requestVisibility', ({ name, visible }: { name: string; visible: boolean }) => {
        void handleWindowVisibilityRequest({ layoutManager, movementManager, name, shouldBeVisible: visible });
    });
    internalBridge.on('window:requestToggleAllWindowsVisibility', ({ targetVisibility }: { targetVisibility: boolean }) => {
        changeAllWindowsVisibility({ targetVisibility });
    });
    internalBridge.on('window:moveToDisplay', ({ displayId }: { displayId: number }) => {
        const header = windowPool.get('header');
        if (header) {
            const newPosition = layoutManager.calculateNewPositionForDisplay({ window: header, targetDisplayId: displayId });
            if (newPosition) {
                movementManager.animateWindowPosition({
                    win: header,
                    targetPosition: newPosition,
                    onComplete: () => updateChildWindowLayouts(true),
                });
            }
        }
    });
    internalBridge.on('window:moveToEdge', ({ direction }: { direction: Direction }) => {
        const header = windowPool.get('header');
        if (header) {
            const newPosition = layoutManager.calculateEdgePosition({ header, direction });
            movementManager.animateWindowPosition({
                win: header,
                targetPosition: newPosition,
                onComplete: () => updateChildWindowLayouts(true),
            });
        }
    });

    internalBridge.on('window:moveStep', ({ direction }: { direction: Direction }) => {
        const header = windowPool.get('header');
        if (header) {
            const newHeaderPosition = layoutManager.calculateStepMovePosition({ header, direction });

            const futureHeaderBounds = { ...header.getBounds(), ...newHeaderPosition };
            const newChildLayout = layoutManager.calculateFeatureWindowLayout({
                visibility: visibleFeatureWindows(),
                headerBoundsOverride: futureHeaderBounds,
            });

            movementManager.animateWindowPosition({ win: header, targetPosition: newHeaderPosition });
            movementManager.animateLayout({ layout: newChildLayout });
        }
    });

    internalBridge.on('window:resizeHeaderWindow', ({ width, height }: { width: number; height: number }) => {
        const header = windowPool.get('header');
        if (!header || movementManager.isAnimating) return;

        const newHeaderBounds = layoutManager.calculateHeaderResize({ header, width, height });

        const wasResizable = header.isResizable();
        if (!wasResizable) header.setResizable(true);

        movementManager.animateWindowBounds({
            win: header,
            targetBounds: newHeaderBounds,
            onComplete: () => {
                if (!wasResizable) header.setResizable(false);
                updateChildWindowLayouts(true);
            },
        });
    });
    internalBridge.on('window:headerAnimationFinished', (state: string) => {
        const header = windowPool.get('header');
        if (!header || header.isDestroyed()) return;

        if (state === 'hidden') {
            header.hide();
        } else if (state === 'visible') {
            updateChildWindowLayouts(false);
        }
    });
    internalBridge.on('window:getHeaderPosition', (reply: (bounds: Rectangle) => void) => {
        const header = windowPool.get('header');
        if (header && !header.isDestroyed()) {
            reply(header.getBounds());
        } else {
            reply({ x: 0, y: 0, width: 0, height: 0 });
        }
    });
    internalBridge.on('window:moveHeaderTo', ({ newX, newY }: { newX: number; newY: number }) => {
        const header = windowPool.get('header');
        if (header) {
            const newPosition = layoutManager.calculateClampedPosition({ header, x: newX, y: newY });
            header.setPosition(newPosition.x, newPosition.y);
        }
    });
    internalBridge.on('window:adjustWindowHeight', ({ winName, targetHeight }: { winName: string; targetHeight: number }) => {
        const senderWindow = windowPool.get(winName);
        if (senderWindow) {
            const newBounds = layoutManager.calculateWindowHeightAdjustment({ senderWindow, targetHeight });

            const wasResizable = senderWindow.isResizable();
            if (!wasResizable) senderWindow.setResizable(true);

            movementManager.animateWindowBounds({
                win: senderWindow,
                targetBounds: newBounds,
                onComplete: () => {
                    if (!wasResizable) senderWindow.setResizable(false);
                    updateChildWindowLayouts(true);
                },
            });
        }
    });

    // Plan tooltip show/hide
    internalBridge.on('window:showPlanWindow', ({ visible }: { visible: boolean }) => {
        const plan = windowPool.get('plan');
        if (!plan || plan.isDestroyed()) {
            log.warn('Plan window not found or destroyed');
            return;
        }

        if (visible) {
            // Cancel any pending hide operations
            if (planHideTimer) {
                log.info('Cancelling pending planHideTimer on show');
                clearTimeout(planHideTimer);
                planHideTimer = null;
            }

            const pos = layoutManager.calculatePlanWindowPosition();
            if (pos) {
                log.info({ pos }, 'Showing plan window');
                const currentBounds = plan.getBounds();
                log.info({ currentBounds }, 'Plan current bounds');

                plan.setPosition(pos.x, pos.y);
                plan.showInactive();
                plan.setAlwaysOnTop(true);
                plan.moveTop();

                // Log bounds after setting
                const newBounds = plan.getBounds();
                log.info({ newBounds }, 'Plan bounds after positioning');
            } else {
                log.warn('Could not calculate plan window position');
            }
        } else {
            // Use hidePlanWindow which has delay
            hidePlanWindow();
        }
    });
}

function changeAllWindowsVisibility({ targetVisibility }: { targetVisibility: boolean }) {
    const header = windowPool.get('header');
    if (!header) return;

    if (typeof targetVisibility === 'boolean' && header.isVisible() === targetVisibility) {
        return;
    }

    if (header.isVisible()) {
        lastVisibleWindows.clear();

        windowPool.forEach((win, name) => {
            if (win && !win.isDestroyed() && win.isVisible()) {
                lastVisibleWindows.add(name);
            }
        });

        lastVisibleWindows.forEach(name => {
            if (name === 'header') return;
            const win = windowPool.get(name);
            if (win && !win.isDestroyed()) {
                win.hide();
                notifyWindowVisibility({ name, visible: false });
            }
        });
        header.hide();

        return;
    }

    lastVisibleWindows.forEach(name => {
        const win = windowPool.get(name);
        if (win && !win.isDestroyed()) {
            win.show();
            notifyWindowVisibility({ name, visible: true });
        }
    });
}

async function handleWindowVisibilityRequest({
    layoutManager,
    movementManager,
    name,
    shouldBeVisible,
}: {
    layoutManager: WindowLayoutManager;
    movementManager: SmoothMovementManager;
    name: string;
    shouldBeVisible: boolean;
}) {
    log.info({ name, shouldBeVisible }, 'Request: set window visibility');
    const win = windowPool.get(name);

    if (!win || win.isDestroyed()) {
        log.warn({ name }, 'Window not found or destroyed');
        return;
    }

    if (name !== 'settings') {
        const isCurrentlyVisible = win.isVisible();
        if (isCurrentlyVisible === shouldBeVisible) {
            log.info({ name }, 'Window is already in the desired state');
            notifyWindowVisibility({ name, visible: isCurrentlyVisible });
            return;
        }
    }

    if (name === 'settings') {
        if (shouldBeVisible) {
            // Cancel any pending hide operations
            if (settingsHideTimer) {
                clearTimeout(settingsHideTimer);
                settingsHideTimer = null;
            }
            const position = layoutManager.calculateSettingsWindowPosition();
            if (position) {
                log.info({ position }, 'Showing settings window');
                const currentBounds = win.getBounds();
                log.info({ currentBounds }, 'Settings current bounds');
                log.info({ maxHeight: win.getMaximumSize()[1], minHeight: win.getMinimumSize()[1] }, 'Settings height limits');

                win.setBounds(position);
                win.show();
                win.setAlwaysOnTop(true);
                win.moveTop();

                // Log bounds after setting
                const newBounds = win.getBounds();
                log.info({ newBounds }, 'Settings bounds after setBounds');
            } else {
                log.warn('Could not calculate settings window position');
            }
        } else {
            log.info('Hiding settings window');
            // Hide after a delay
            if (settingsHideTimer) {
                clearTimeout(settingsHideTimer);
            }
            settingsHideTimer = setTimeout(() => {
                if (win && !win.isDestroyed()) {
                    win.setAlwaysOnTop(false);
                    win.hide();
                    log.info('Settings window hidden');
                }
                settingsHideTimer = null;
            }, 200);
        }
        return;
    }

    if (name === 'listen' || name === 'ask') {
        const otherName = name === 'listen' ? 'ask' : 'listen';
        const otherWin = windowPool.get(otherName);
        const isOtherWinVisible = otherWin && !otherWin.isDestroyed() && otherWin.isVisible();

        const ANIM_OFFSET_X = 50;
        const ANIM_OFFSET_Y = 20;

        const finalVisibility: Visibility = {
            listen: (name === 'listen' && shouldBeVisible) || (otherName === 'listen' && !!isOtherWinVisible),
            ask: (name === 'ask' && shouldBeVisible) || (otherName === 'ask' && !!isOtherWinVisible),
        };
        if (!shouldBeVisible) {
            finalVisibility[name] = false;
        }

        const targetLayout = layoutManager.calculateFeatureWindowLayout({ visibility: finalVisibility });

        if (shouldBeVisible) {
            const targetBounds = targetLayout[name];
            if (!targetBounds) return;

            const startPos = { ...targetBounds };
            if (name === 'listen') startPos.x -= ANIM_OFFSET_X;
            else if (name === 'ask') startPos.y -= ANIM_OFFSET_Y;

            win.setOpacity(0);
            win.setBounds(startPos);
            win.show();

            movementManager.fade({ win, to: 1 });
            movementManager.animateLayout({ layout: targetLayout });
            notifyWindowVisibility({ name, visible: true });
        } else {
            if (!win.isVisible()) {
                notifyWindowVisibility({ name, visible: false });
                return;
            }

            const currentBounds = win.getBounds();
            const targetPos = { ...currentBounds };
            if (name === 'listen') targetPos.x -= ANIM_OFFSET_X;
            else if (name === 'ask') targetPos.y -= ANIM_OFFSET_Y;

            movementManager.fade({
                win,
                to: 0,
                onComplete: () => {
                    win.hide();
                    notifyWindowVisibility({ name, visible: false });
                },
            });
            movementManager.animateWindowPosition({ win, targetPosition: targetPos });

            // Animate other windows to new layout
            const otherWindowsLayout: WindowLayout = { ...targetLayout };
            delete otherWindowsLayout[name];
            movementManager.animateLayout({ layout: otherWindowsLayout });
        }
    }
}

const setContentProtection = (status: boolean) => {
    isContentProtectionOn = status;
    log.info({ enabled: isContentProtectionOn }, 'Content protection toggled');
    windowPool.forEach(win => {
        if (win && !win.isDestroyed()) {
            win.setContentProtection(isContentProtectionOn);
        }
    });
};

const getContentProtectionStatus = () => isContentProtectionOn;

const toggleContentProtection = () => {
    const newStatus = !getContentProtectionStatus();
    setContentProtection(newStatus);
    return newStatus;
};

const openLoginPage = () => {
    const webUrl = process.env.whisper_WEB_URL || 'http://localhost:3000';
    const personalizeUrl = `${webUrl}/personalize?desktop=true`;
    void shell.openExternal(personalizeUrl);
    log.info({ personalizeUrl }, 'Opening personalization page');
};

// List available displays and identify current/primary
function listDisplays() {
    try {
        const allDisplays = screen.getAllDisplays();
        const primaryId = screen.getPrimaryDisplay().id;
        const header = windowPool.get('header');
        const currentDisplayId = getCurrentDisplay(header).id;

        const displays = allDisplays.map((d, index) => ({
            id: d.id,
            name: `Monitor ${index + 1}${d.id === primaryId ? ' (Primary)' : ''}`,
            isPrimary: d.id === primaryId,
            bounds: d.bounds,
            workArea: d.workArea,
            scaleFactor: d.scaleFactor,
        }));

        return { currentDisplayId, displays };
    } catch (e) {
        log.error({ err: e }, 'Failed to list displays');
        return { currentDisplayId: null, displays: [] };
    }
}

// Move header (and thus the app) to a specific display via internal bridge
function moveToDisplay(displayId: number) {
    try {
        internalBridge.emit('window:moveToDisplay', { displayId });
        return { success: true };
    } catch (e) {
        log.error({ err: e, displayId }, 'Failed to move to display');
        return { success: false, error: failureReason(e) };
    }
}

function createFeatureWindows({ header, names }: { header: BrowserWindow; names?: FeatureWindowName[] | FeatureWindowName }) {
    const standaloneOptions = {
        show: false,
        frame: false,
        transparent: true,
        hasShadow: false,
        skipTaskbar: true,
        hiddenInMissionControl: true,
        resizable: false,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: PRELOAD_PATH,
            additionalArguments: [apiBaseUrlArgument(env.API_BASE_URL)],
        },
    };
    const commonChildOptions = { ...standaloneOptions, parent: header };

    const createFeatureWindow = (name: FeatureWindowName) => {
        if (windowPool.has(name)) return;

        switch (name) {
            case 'listen': {
                const listen = new BrowserWindow({
                    ...commonChildOptions,
                    width: 400,
                    height: 250, // Start small when empty
                    minWidth: 400,
                    maxWidth: 400,
                    minHeight: 250, // Minimum when empty
                    maxHeight: 500, // Maximum when full content
                    resizable: true, // Allow resizing for dynamic growth
                });
                listen.setContentProtection(isContentProtectionOn);
                listen.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
                if (process.platform === 'darwin') {
                    listen.setWindowButtonVisibility(false);
                }
                const listenLoadOptions = { query: { view: 'listen' } };
                // Load content consistently across all platforms
                void listen.loadFile(path.join(RENDERER_APP_DIR, 'content.html'), listenLoadOptions);
                if (!app.isPackaged) {
                    listen.webContents.openDevTools({ mode: 'detach' });
                }
                windowPool.set('listen', listen);
                break;
            }

            // ask
            case 'ask': {
                const ask = new BrowserWindow({
                    ...commonChildOptions,
                    width: 750,
                });
                ask.setContentProtection(isContentProtectionOn);
                ask.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
                if (process.platform === 'darwin') {
                    ask.setWindowButtonVisibility(false);
                }
                const askLoadOptions = { query: { view: 'ask' } };
                // Load content consistently across all platforms
                void ask.loadFile(path.join(RENDERER_APP_DIR, 'content.html'), askLoadOptions);

                // Open DevTools in development
                if (!app.isPackaged) {
                    ask.webContents.openDevTools({ mode: 'detach' });
                }
                windowPool.set('ask', ask);

                // Handle blur event: close ask window when clicking outside if no content
                ask.on('blur', () => {
                    const focusedWindow = BrowserWindow.getFocusedWindow();
                    const isFocusInApp = focusedWindow && Array.from(windowPool.values()).includes(focusedWindow);

                    // If focus moved outside app windows (clicked outside)
                    if (!isFocusInApp) {
                        const state = askService.state;
                        const hasNoContent = !state.currentResponse && !state.isLoading && !state.isStreaming;

                        if (hasNoContent) {
                            askService.closeAskWindow();
                        }
                    }
                });

                break;
            }

            // settings
            case 'settings': {
                const settings = new BrowserWindow({
                    ...standaloneOptions,
                    width: 240,
                    maxHeight: 400,
                });
                settings.setContentProtection(isContentProtectionOn);
                settings.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
                if (process.platform === 'darwin') {
                    settings.setWindowButtonVisibility(false);
                }
                const settingsLoadOptions = { query: { view: 'settings' } };
                // Load content consistently across all platforms
                settings
                    .loadFile(path.join(RENDERER_APP_DIR, 'content.html'), settingsLoadOptions)
                    .catch((err: unknown) => log.error({ err }, 'Failed to load the settings window'));
                windowPool.set('settings', settings);

                if (!app.isPackaged) {
                    settings.webContents.openDevTools({ mode: 'detach' });
                }

                log.info({ maxHeight: settings.getMaximumSize()[1] }, 'Settings window created');
                break;
            }
            // plan tooltip (small ephemeral window)
            case 'plan': {
                const plan = new BrowserWindow({
                    ...commonChildOptions,
                    width: 280,
                    height: 160,
                });
                plan.setContentProtection(isContentProtectionOn);
                plan.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
                if (process.platform === 'darwin') {
                    plan.setWindowButtonVisibility(false);
                }
                const planLoadOptions = { query: { view: 'plan' } };
                plan.loadFile(path.join(RENDERER_APP_DIR, 'content.html'), planLoadOptions).catch((err: unknown) =>
                    log.error({ err }, 'Failed to load the plan window')
                );
                windowPool.set('plan', plan);

                if (!app.isPackaged) {
                    plan.webContents.openDevTools({ mode: 'detach' });
                }

                log.info({ width: plan.getBounds().width, height: plan.getBounds().height }, 'Plan window created');
                break;
            }

            // screenshot viewer (popup window)
            case 'screenshot': {
                const screenshot = new BrowserWindow({
                    ...standaloneOptions,
                    width: 400,
                    height: 300,
                    minWidth: 250,
                    minHeight: 150,
                    alwaysOnTop: true, // Ensure it's always on top
                });
                screenshot.setContentProtection(isContentProtectionOn);
                screenshot.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
                if (process.platform === 'darwin') {
                    screenshot.setWindowButtonVisibility(false);
                }
                const screenshotLoadOptions = { query: { view: 'screenshot' } };
                screenshot
                    .loadFile(path.join(RENDERER_APP_DIR, 'content.html'), screenshotLoadOptions)
                    .catch((err: unknown) => log.error({ err }, 'Failed to load the screenshot window'));
                windowPool.set('screenshot', screenshot);

                if (!app.isPackaged) {
                    screenshot.webContents.openDevTools({ mode: 'detach' });
                }

                log.info('Screenshot window created');
                break;
            }

            // recovery toast (small ephemeral window)
            case 'recoveryToast': {
                const recoveryToast = new BrowserWindow({
                    ...standaloneOptions,
                    width: 270,
                    height: 125,
                    alwaysOnTop: true,
                });
                recoveryToast.setContentProtection(isContentProtectionOn);
                recoveryToast.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
                if (process.platform === 'darwin') {
                    recoveryToast.setWindowButtonVisibility(false);
                }
                recoveryToast
                    .loadFile(path.join(RENDERER_APP_DIR, 'recovery-toast.html'))
                    .catch((err: unknown) => log.error({ err }, 'Failed to load the recovery toast window'));
                windowPool.set('recoveryToast', recoveryToast);

                log.info('Recovery toast window created');
                break;
            }
        }
    };

    if (Array.isArray(names)) {
        names.forEach(name => createFeatureWindow(name));
    } else if (typeof names === 'string') {
        createFeatureWindow(names);
    } else {
        createFeatureWindow('listen');
        createFeatureWindow('ask');
        createFeatureWindow('settings');
        createFeatureWindow('plan');
    }
}

function destroyFeatureWindows() {
    const featureWindows: FeatureWindowName[] = ['listen', 'ask', 'settings', 'plan', 'screenshot', 'recoveryToast'];
    if (settingsHideTimer) {
        clearTimeout(settingsHideTimer);
        settingsHideTimer = null;
    }
    if (screenshotHideTimer) {
        clearTimeout(screenshotHideTimer);
        screenshotHideTimer = null;
    }
    featureWindows.forEach(name => {
        const win = windowPool.get(name);
        if (win && !win.isDestroyed()) win.destroy();
        windowPool.delete(name);
    });
}

function createWindows() {
    const HEADER_HEIGHT = 47;
    const DEFAULT_WINDOW_WIDTH = 353;

    const primaryDisplay = screen.getPrimaryDisplay();
    const { y: workAreaY, width: screenWidth } = primaryDisplay.workArea;

    const initialX = Math.round((screenWidth - DEFAULT_WINDOW_WIDTH) / 2);
    const initialY = workAreaY + 21;

    const header = new BrowserWindow({
        width: DEFAULT_WINDOW_WIDTH,
        height: HEADER_HEIGHT,
        x: initialX,
        y: initialY,
        frame: false,
        transparent: true,
        hasShadow: false,
        alwaysOnTop: true,
        skipTaskbar: true,
        hiddenInMissionControl: true,
        resizable: false,
        focusable: true,
        acceptFirstMouse: true,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: PRELOAD_PATH,
            additionalArguments: [apiBaseUrlArgument(env.API_BASE_URL)],
            backgroundThrottling: false,
            webSecurity: false,
            // Ensure proper rendering and prevent pixelation
            experimentalFeatures: false,
        },
        // Prevent pixelation and ensure proper rendering
        useContentSize: true,
        disableAutoHideCursor: true,
    });
    if (process.platform === 'darwin') {
        header.setWindowButtonVisibility(false);
    }
    // Load content consistently across all platforms
    void header.loadFile(path.join(RENDERER_APP_DIR, 'header.html'));
    windowPool.set('header', header);
    const newLayoutManager = new WindowLayoutManager(windowPool);
    const newMovementManager = new SmoothMovementManager(windowPool);
    layoutManager = newLayoutManager;
    movementManager = newMovementManager;

    header.on('moved', () => {
        if (newMovementManager.isAnimating) {
            return;
        }
        updateChildWindowLayouts(false);
    });

    header.webContents.once('dom-ready', () => {
        shortcutsService.initialize(windowPool);
        void shortcutsService.registerShortcuts();
    });

    setupIpcHandlers({ layoutManager: newLayoutManager });
    setupWindowController({ layoutManager: newLayoutManager, movementManager: newMovementManager });

    if (currentHeaderState === 'main') {
        createFeatureWindows({ header, names: ['listen', 'ask', 'settings', 'plan', 'recoveryToast'] });
    }

    header.setContentProtection(isContentProtectionOn);
    header.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

    // Open DevTools in development
    if (!app.isPackaged) {
        header.webContents.openDevTools({ mode: 'detach' });
    }

    header.on('focus', () => {
        log.info('Header gained focus');
    });

    header.on('blur', () => {
        log.info('Header lost focus');
    });

    header.on('resize', () => updateChildWindowLayouts(false));

    return windowPool;
}

function setupIpcHandlers({ layoutManager }: { layoutManager: WindowLayoutManager }) {
    screen.on('display-added', (_event, newDisplay) => {
        log.info({ displayId: newDisplay.id }, 'New display added');
    });

    screen.on('display-removed', (_event, oldDisplay) => {
        log.info({ displayId: oldDisplay.id }, 'Display removed');
        const header = windowPool.get('header');

        if (header && getCurrentDisplay(header).id === oldDisplay.id) {
            const primaryDisplay = screen.getPrimaryDisplay();
            const newPosition = layoutManager.calculateNewPositionForDisplay({ window: header, targetDisplayId: primaryDisplay.id });
            if (newPosition) {
                // Recovery situation, move immediately without animation
                header.setPosition(newPosition.x, newPosition.y, false);
                updateChildWindowLayouts(false);
            }
        }
    });

    screen.on('display-metrics-changed', () => {
        // Call layout update function with new version
        updateChildWindowLayouts(false);
    });
}

const handleHeaderStateChanged = (state: string) => {
    log.info({ state }, 'Header state changed');
    currentHeaderState = state;

    if (state === 'main') {
        const header = windowPool.get('header');
        if (header) createFeatureWindows({ header });
    } else {
        // 'apikey' | 'permission'
        destroyFeatureWindows();
    }
    internalBridge.emit('reregister-shortcuts');
};

function forceShowPermissionOnboarding() {
    try {
        const header = windowPool.get('header');
        if (!header || header.isDestroyed()) {
            return { success: false, error: 'Header window not available' };
        }
        header.webContents.send('header:force-show-permission');
        return { success: true };
    } catch (e) {
        log.error({ err: e }, 'Failed to force show permission onboarding');
        return { success: false, error: failureReason(e) };
    }
}

export {
    createWindows,
    windowPool,
    toggleContentProtection,
    resizeHeaderWindow,
    getContentProtectionStatus,
    showSettingsWindow,
    hideSettingsWindow,
    cancelHideSettingsWindow,
    showScreenshotWindow,
    hideScreenshotWindow,
    cancelHideScreenshotWindow,
    showPlanWindow,
    hidePlanWindow,
    cancelHidePlanWindow,
    showRecoveryToast,
    openLoginPage,
    moveWindowStep,
    handleHeaderStateChanged,
    handleHeaderAnimationFinished,
    getHeaderPosition,
    moveHeaderTo,
    adjustWindowHeight,
    listDisplays,
    moveToDisplay,
    forceShowPermissionOnboarding,
    setWindowVisibility,
    isWindowVisible,
};
