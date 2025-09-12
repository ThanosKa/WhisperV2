const { BrowserWindow, globalShortcut, screen, app, shell } = require('electron');
const WindowLayoutManager = require('./windowLayoutManager');
const SmoothMovementManager = require('./smoothMovementManager');
const path = require('node:path');
const os = require('os');
const shortcutsService = require('../features/shortcuts/shortcutsService');
const internalBridge = require('../bridge/internalBridge');
const permissionRepository = require('../features/common/repositories/permission');

/* ────────────────[ UNIFIED CROSS-PLATFORM DESIGN ]─────────────── */
// Liquid glass disabled for consistent cross-platform performance
// and smoother user experience across all operating systems
let shouldUseLiquidGlass = false;
/* ────────────────[ UNIFIED CROSS-PLATFORM DESIGN ]─────────────── */

let isContentProtectionOn = true;
let lastVisibleWindows = new Set(['header']);

let currentHeaderState = 'apikey';
const windowPool = new Map();

let settingsHideTimer = null;

let layoutManager = null;
let movementManager = null;

function updateChildWindowLayouts(animated = true) {
    // if (movementManager.isAnimating) return;

    const visibleWindows = {};
    const listenWin = windowPool.get('listen');
    const askWin = windowPool.get('ask');
    if (listenWin && !listenWin.isDestroyed() && listenWin.isVisible()) {
        visibleWindows.listen = true;
    }
    if (askWin && !askWin.isDestroyed() && askWin.isVisible()) {
        visibleWindows.ask = true;
    }

    if (Object.keys(visibleWindows).length === 0) return;

    const newLayout = layoutManager.calculateFeatureWindowLayout(visibleWindows);
    movementManager.animateLayout(newLayout, animated);
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

// Plan tooltip window show/hide via external IPC
const showPlanWindow = visible => {
    internalBridge.emit('window:showPlanWindow', { visible });
};

const moveWindowStep = direction => {
    internalBridge.emit('window:moveStep', { direction });
};

const resizeHeaderWindow = ({ width, height }) => {
    internalBridge.emit('window:resizeHeaderWindow', { width, height });
};

const handleHeaderAnimationFinished = state => {
    internalBridge.emit('window:headerAnimationFinished', state);
};

const getHeaderPosition = () => {
    return new Promise(resolve => {
        internalBridge.emit('window:getHeaderPosition', position => {
            resolve(position);
        });
    });
};

const moveHeaderTo = (newX, newY) => {
    internalBridge.emit('window:moveHeaderTo', { newX, newY });
};

const adjustWindowHeight = (winName, targetHeight) => {
    internalBridge.emit('window:adjustWindowHeight', { winName, targetHeight });
};

function setupWindowController(windowPool, layoutManager, movementManager) {
    internalBridge.on('window:requestVisibility', ({ name, visible }) => {
        handleWindowVisibilityRequest(windowPool, layoutManager, movementManager, name, visible);
    });
    internalBridge.on('window:requestToggleAllWindowsVisibility', ({ targetVisibility }) => {
        changeAllWindowsVisibility(windowPool, targetVisibility);
    });
    internalBridge.on('window:moveToDisplay', ({ displayId }) => {
        // movementManager.moveToDisplay(displayId);
        const header = windowPool.get('header');
        if (header) {
            const newPosition = layoutManager.calculateNewPositionForDisplay(header, displayId);
            if (newPosition) {
                movementManager.animateWindowPosition(header, newPosition, {
                    onComplete: () => updateChildWindowLayouts(true),
                });
            }
        }
    });
    internalBridge.on('window:moveToEdge', ({ direction }) => {
        const header = windowPool.get('header');
        if (header) {
            const newPosition = layoutManager.calculateEdgePosition(header, direction);
            movementManager.animateWindowPosition(header, newPosition, {
                onComplete: () => updateChildWindowLayouts(true),
            });
        }
    });

    internalBridge.on('window:moveStep', ({ direction }) => {
        const header = windowPool.get('header');
        if (header) {
            const newHeaderPosition = layoutManager.calculateStepMovePosition(header, direction);
            if (!newHeaderPosition) return;

            const futureHeaderBounds = { ...header.getBounds(), ...newHeaderPosition };
            const visibleWindows = {};
            const listenWin = windowPool.get('listen');
            const askWin = windowPool.get('ask');
            if (listenWin && !listenWin.isDestroyed() && listenWin.isVisible()) {
                visibleWindows.listen = true;
            }
            if (askWin && !askWin.isDestroyed() && askWin.isVisible()) {
                visibleWindows.ask = true;
            }

            const newChildLayout = layoutManager.calculateFeatureWindowLayout(visibleWindows, futureHeaderBounds);

            movementManager.animateWindowPosition(header, newHeaderPosition);
            movementManager.animateLayout(newChildLayout);
        }
    });

    internalBridge.on('window:resizeHeaderWindow', ({ width, height }) => {
        const header = windowPool.get('header');
        if (!header || movementManager.isAnimating) return;

        const newHeaderBounds = layoutManager.calculateHeaderResize(header, { width, height });

        const wasResizable = header.isResizable();
        if (!wasResizable) header.setResizable(true);

        movementManager.animateWindowBounds(header, newHeaderBounds, {
            onComplete: () => {
                if (!wasResizable) header.setResizable(false);
                updateChildWindowLayouts(true);
            },
        });
    });
    internalBridge.on('window:headerAnimationFinished', state => {
        const header = windowPool.get('header');
        if (!header || header.isDestroyed()) return;

        if (state === 'hidden') {
            header.hide();
        } else if (state === 'visible') {
            updateChildWindowLayouts(false);
        }
    });
    internalBridge.on('window:getHeaderPosition', reply => {
        const header = windowPool.get('header');
        if (header && !header.isDestroyed()) {
            reply(header.getBounds());
        } else {
            reply({ x: 0, y: 0, width: 0, height: 0 });
        }
    });
    internalBridge.on('window:moveHeaderTo', ({ newX, newY }) => {
        const header = windowPool.get('header');
        if (header) {
            const newPosition = layoutManager.calculateClampedPosition(header, { x: newX, y: newY });
            header.setPosition(newPosition.x, newPosition.y);
        }
    });
    internalBridge.on('window:adjustWindowHeight', ({ winName, targetHeight }) => {
        // console.log(`[Layout Debug] adjustWindowHeight: targetHeight=${targetHeight}`);
        const senderWindow = windowPool.get(winName);
        if (senderWindow) {
            const newBounds = layoutManager.calculateWindowHeightAdjustment(senderWindow, targetHeight);

            const wasResizable = senderWindow.isResizable();
            if (!wasResizable) senderWindow.setResizable(true);

            movementManager.animateWindowBounds(senderWindow, newBounds, {
                onComplete: () => {
                    if (!wasResizable) senderWindow.setResizable(false);
                    updateChildWindowLayouts(true);
                },
            });
        }
    });

    // Plan tooltip show/hide
    internalBridge.on('window:showPlanWindow', ({ visible }) => {
        const plan = windowPool.get('plan');
        if (!plan || plan.isDestroyed()) {
            console.warn('[WindowManager] Plan window not found or destroyed');
            return;
        }

        if (visible) {
            const pos = layoutManager.calculatePlanWindowPosition();
            if (pos) {
                console.log(`[WindowManager] Showing plan window at position:`, pos);
                const currentBounds = plan.getBounds();
                console.log(`[WindowManager] Plan current bounds:`, currentBounds);

                plan.setPosition(pos.x, pos.y);
                plan.showInactive();
                plan.moveTop();
                plan.setAlwaysOnTop(true);

                // Log bounds after setting
                const newBounds = plan.getBounds();
                console.log(`[WindowManager] Plan bounds after positioning:`, newBounds);
            } else {
                console.warn('[WindowManager] Could not calculate plan window position.');
            }
        } else {
            console.log(`[WindowManager] Hiding plan window`);
            plan.setAlwaysOnTop(false);
            plan.hide();
            console.log(`[WindowManager] Plan window hidden`);
        }
    });
}

function changeAllWindowsVisibility(windowPool, targetVisibility) {
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
            if (win && !win.isDestroyed()) win.hide();
        });
        header.hide();

        return;
    }

    lastVisibleWindows.forEach(name => {
        const win = windowPool.get(name);
        if (win && !win.isDestroyed()) win.show();
    });
}

/**
 *
 * @param {Map<string, BrowserWindow>} windowPool
 * @param {WindowLayoutManager} layoutManager
 * @param {SmoothMovementManager} movementManager
 * @param {'listen' | 'ask' | 'settings'} name
 * @param {boolean} shouldBeVisible
 */
async function handleWindowVisibilityRequest(windowPool, layoutManager, movementManager, name, shouldBeVisible) {
    console.log(`[WindowManager] Request: set '${name}' visibility to ${shouldBeVisible}`);
    const win = windowPool.get(name);

    if (!win || win.isDestroyed()) {
        console.warn(`[WindowManager] Window '${name}' not found or destroyed.`);
        return;
    }

    if (name !== 'settings') {
        const isCurrentlyVisible = win.isVisible();
        if (isCurrentlyVisible === shouldBeVisible) {
            console.log(`[WindowManager] Window '${name}' is already in the desired state.`);
            return;
        }
    }

    const disableClicks = selectedWindow => {
        for (const [name, win] of windowPool) {
            if (win !== selectedWindow && !win.isDestroyed()) {
                win.setIgnoreMouseEvents(true, { forward: true });
            }
        }
    };

    const restoreClicks = () => {
        for (const [, win] of windowPool) {
            if (!win.isDestroyed()) win.setIgnoreMouseEvents(false);
        }
    };

    if (name === 'settings') {
        if (shouldBeVisible) {
            // Cancel any pending hide operations
            if (settingsHideTimer) {
                clearTimeout(settingsHideTimer);
                settingsHideTimer = null;
            }
            const position = layoutManager.calculateSettingsWindowPosition();
            if (position) {
                console.log(`[WindowManager] Showing settings window at position:`, position);
                const currentBounds = win.getBounds();
                console.log(`[WindowManager] Settings current bounds:`, currentBounds);
                console.log(`[WindowManager] Settings maxHeight: ${win.getMaximumSize()[1]}, minHeight: ${win.getMinimumSize()[1]}`);

                win.setBounds(position);
                win.__lockedByButton = true;
                win.show();
                win.moveTop();
                win.setAlwaysOnTop(true);

                // Log bounds after setting
                const newBounds = win.getBounds();
                console.log(`[WindowManager] Settings bounds after setBounds:`, newBounds);
            } else {
                console.warn('[WindowManager] Could not calculate settings window position.');
            }
        } else {
            console.log(`[WindowManager] Hiding settings window`);
            // Hide after a delay
            if (settingsHideTimer) {
                clearTimeout(settingsHideTimer);
            }
            settingsHideTimer = setTimeout(() => {
                if (win && !win.isDestroyed()) {
                    win.setAlwaysOnTop(false);
                    win.hide();
                    console.log(`[WindowManager] Settings window hidden`);
                }
                settingsHideTimer = null;
            }, 200);

            win.__lockedByButton = false;
        }
        return;
    }

    if (name === 'listen' || name === 'ask') {
        const win = windowPool.get(name);
        const otherName = name === 'listen' ? 'ask' : 'listen';
        const otherWin = windowPool.get(otherName);
        const isOtherWinVisible = otherWin && !otherWin.isDestroyed() && otherWin.isVisible();

        const ANIM_OFFSET_X = 50;
        const ANIM_OFFSET_Y = 20;

        const finalVisibility = {
            listen: (name === 'listen' && shouldBeVisible) || (otherName === 'listen' && isOtherWinVisible),
            ask: (name === 'ask' && shouldBeVisible) || (otherName === 'ask' && isOtherWinVisible),
        };
        if (!shouldBeVisible) {
            finalVisibility[name] = false;
        }

        const targetLayout = layoutManager.calculateFeatureWindowLayout(finalVisibility);

        if (shouldBeVisible) {
            if (!win) return;
            const targetBounds = targetLayout[name];
            if (!targetBounds) return;

            const startPos = { ...targetBounds };
            if (name === 'listen') startPos.x -= ANIM_OFFSET_X;
            else if (name === 'ask') startPos.y -= ANIM_OFFSET_Y;

            win.setOpacity(0);
            win.setBounds(startPos);
            win.show();

            movementManager.fade(win, { to: 1 });
            movementManager.animateLayout(targetLayout);
        } else {
            if (!win || !win.isVisible()) return;

            const currentBounds = win.getBounds();
            const targetPos = { ...currentBounds };
            if (name === 'listen') targetPos.x -= ANIM_OFFSET_X;
            else if (name === 'ask') targetPos.y -= ANIM_OFFSET_Y;

            movementManager.fade(win, { to: 0, onComplete: () => win.hide() });
            movementManager.animateWindowPosition(win, targetPos);

            // Animate other windows to new layout
            const otherWindowsLayout = { ...targetLayout };
            delete otherWindowsLayout[name];
            movementManager.animateLayout(otherWindowsLayout);
        }
    }
}

const setContentProtection = status => {
    isContentProtectionOn = status;
    console.log(`[Protection] Content protection toggled to: ${isContentProtectionOn}`);
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
    const webUrl = process.env.pickleglass_WEB_URL || 'http://localhost:3000';
    const personalizeUrl = `${webUrl}/personalize?desktop=true`;
    shell.openExternal(personalizeUrl);
    console.log('Opening personalization page:', personalizeUrl);
};

// List available displays and identify current/primary
function listDisplays() {
    try {
        const allDisplays = screen.getAllDisplays();
        const primaryId = screen.getPrimaryDisplay().id;
        const header = windowPool.get('header');
        const currentDisplay = getCurrentDisplay(header);
        const currentDisplayId = currentDisplay?.id ?? primaryId;

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
        console.error('[WindowManager] Failed to list displays:', e);
        return { currentDisplayId: null, displays: [] };
    }
}

// Move header (and thus the app) to a specific display via internal bridge
function moveToDisplay(displayId) {
    try {
        internalBridge.emit('window:moveToDisplay', { displayId });
        return { success: true };
    } catch (e) {
        console.error('[WindowManager] Failed to move to display:', e);
        return { success: false, error: e?.message || 'unknown' };
    }
}

function createFeatureWindows(header, namesToCreate) {
    // if (windowPool.has('listen')) return;

    const commonChildOptions = {
        parent: header,
        show: false,
        frame: false,
        transparent: true,
        vibrancy: false,
        hasShadow: false,
        skipTaskbar: true,
        hiddenInMissionControl: true,
        resizable: false,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, '../preload.js'),
        },
    };

    const createFeatureWindow = name => {
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
                    // Dynamic dimensions - window grows with content from 250px to 500px
                    // backgroundColor: '#ff0000', // Red background to visualize window boundaries
                    // transparent: false, // Disable transparency to show the red background
                    // useContentSize: true // Use content size to ensure proper sizing
                });
                listen.setContentProtection(isContentProtectionOn);
                listen.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
                if (process.platform === 'darwin') {
                    listen.setWindowButtonVisibility(false);
                }
                const listenLoadOptions = { query: { view: 'listen' } };
                // Load content consistently across all platforms
                listen.loadFile(path.join(__dirname, '../ui/app/content.html'), listenLoadOptions);
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
                    // maxHeight: 700,
                    // backgroundColor: '#ff0000', // Red background to visualize window boundaries
                    // transparent: false, // Disable transparency to show the red background
                    // useContentSize: true // Use content size to ensure proper sizing
                });
                ask.setContentProtection(isContentProtectionOn);
                ask.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
                if (process.platform === 'darwin') {
                    ask.setWindowButtonVisibility(false);
                }
                const askLoadOptions = { query: { view: 'ask' } };
                // Load content consistently across all platforms
                ask.loadFile(path.join(__dirname, '../ui/app/content.html'), askLoadOptions);

                // Open DevTools in development
                if (!app.isPackaged) {
                    ask.webContents.openDevTools({ mode: 'detach' });
                }
                windowPool.set('ask', ask);
                break;
            }

            // settings
            case 'settings': {
                const settings = new BrowserWindow({
                    ...commonChildOptions,
                    width: 240,
                    maxHeight: 400,
                    parent: undefined,
                });
                settings.setContentProtection(isContentProtectionOn);
                settings.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
                if (process.platform === 'darwin') {
                    settings.setWindowButtonVisibility(false);
                }
                const settingsLoadOptions = { query: { view: 'settings' } };
                // Load content consistently across all platforms
                settings.loadFile(path.join(__dirname, '../ui/app/content.html'), settingsLoadOptions).catch(console.error);
                windowPool.set('settings', settings);

                if (!app.isPackaged) {
                    settings.webContents.openDevTools({ mode: 'detach' });
                }

                // Add logging for settings window creation
                console.log(`[WindowManager] Settings window created with maxHeight: ${settings.getMaximumSize()[1]}`);
                break;
            }
            // plan tooltip (small ephemeral window)
            case 'plan': {
                const plan = new BrowserWindow({
                    ...commonChildOptions,
                    width: 280,
                    height: 120,
                });
                plan.setContentProtection(isContentProtectionOn);
                plan.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
                if (process.platform === 'darwin') {
                    plan.setWindowButtonVisibility(false);
                }
                const planLoadOptions = { query: { view: 'plan' } };
                plan.loadFile(path.join(__dirname, '../ui/app/content.html'), planLoadOptions).catch(console.error);
                windowPool.set('plan', plan);

                if (!app.isPackaged) {
                    plan.webContents.openDevTools({ mode: 'detach' });
                }

                // Add logging for plan window creation
                console.log(`[WindowManager] Plan window created with dimensions: ${plan.getBounds().width}x${plan.getBounds().height}`);
                break;
            }
        }
    };

    if (Array.isArray(namesToCreate)) {
        namesToCreate.forEach(name => createFeatureWindow(name));
    } else if (typeof namesToCreate === 'string') {
        createFeatureWindow(namesToCreate);
    } else {
        createFeatureWindow('listen');
        createFeatureWindow('ask');
        createFeatureWindow('settings');
        createFeatureWindow('plan');
    }
}

function destroyFeatureWindows() {
    const featureWindows = ['listen', 'ask', 'settings', 'plan'];
    if (settingsHideTimer) {
        clearTimeout(settingsHideTimer);
        settingsHideTimer = null;
    }
    featureWindows.forEach(name => {
        const win = windowPool.get(name);
        if (win && !win.isDestroyed()) win.destroy();
        windowPool.delete(name);
    });
}

function getCurrentDisplay(window) {
    if (!window || window.isDestroyed()) return screen.getPrimaryDisplay();

    const windowBounds = window.getBounds();
    const windowCenter = {
        x: windowBounds.x + windowBounds.width / 2,
        y: windowBounds.y + windowBounds.height / 2,
    };

    return screen.getDisplayNearestPoint(windowCenter);
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
        vibrancy: false,
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
            preload: path.join(__dirname, '../preload.js'),
            backgroundThrottling: false,
            webSecurity: false,
            enableRemoteModule: false,
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
    header.loadFile(path.join(__dirname, '../ui/app/header.html'));
    windowPool.set('header', header);
    layoutManager = new WindowLayoutManager(windowPool);
    movementManager = new SmoothMovementManager(windowPool);

    header.on('moved', () => {
        if (movementManager.isAnimating) {
            return;
        }
        updateChildWindowLayouts(false);
    });

    header.webContents.once('dom-ready', () => {
        shortcutsService.initialize(windowPool);
        shortcutsService.registerShortcuts();
    });

    setupIpcHandlers(windowPool, layoutManager);
    setupWindowController(windowPool, layoutManager, movementManager);

    if (currentHeaderState === 'main') {
        createFeatureWindows(header, ['listen', 'ask', 'settings', 'plan']);
    }

    header.setContentProtection(isContentProtectionOn);
    header.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

    // Open DevTools in development
    if (!app.isPackaged) {
        header.webContents.openDevTools({ mode: 'detach' });
    }

    header.on('focus', () => {
        console.log('[WindowManager] Header gained focus');
    });

    header.on('blur', () => {
        console.log('[WindowManager] Header lost focus');
    });

    header.webContents.on('before-input-event', (event, input) => {
        if (input.type === 'mouseDown') {
            const target = input.target;
            if (target && (target.includes('input') || target.includes('apikey'))) {
                header.focus();
            }
        }
    });

    header.on('resize', () => updateChildWindowLayouts(false));

    return windowPool;
}

function setupIpcHandlers(windowPool, layoutManager) {
    screen.on('display-added', (event, newDisplay) => {
        console.log('[Display] New display added:', newDisplay.id);
    });

    screen.on('display-removed', (event, oldDisplay) => {
        console.log('[Display] Display removed:', oldDisplay.id);
        const header = windowPool.get('header');

        if (header && getCurrentDisplay(header).id === oldDisplay.id) {
            const primaryDisplay = screen.getPrimaryDisplay();
            const newPosition = layoutManager.calculateNewPositionForDisplay(header, primaryDisplay.id);
            if (newPosition) {
                // Recovery situation, move immediately without animation
                header.setPosition(newPosition.x, newPosition.y, false);
                updateChildWindowLayouts(false);
            }
        }
    });

    screen.on('display-metrics-changed', (event, display, changedMetrics) => {
        // Call layout update function with new version
        updateChildWindowLayouts(false);
    });
}

const handleHeaderStateChanged = state => {
    console.log(`[WindowManager] Header state changed to: ${state}`);
    currentHeaderState = state;

    if (state === 'main') {
        createFeatureWindows(windowPool.get('header'));
    } else {
        // 'apikey' | 'permission'
        destroyFeatureWindows();
    }
    internalBridge.emit('reregister-shortcuts');
};

module.exports = {
    createWindows,
    windowPool,
    toggleContentProtection,
    resizeHeaderWindow,
    getContentProtectionStatus,
    showSettingsWindow,
    hideSettingsWindow,
    cancelHideSettingsWindow,
    showPlanWindow,
    openLoginPage,
    moveWindowStep,
    handleHeaderStateChanged,
    handleHeaderAnimationFinished,
    getHeaderPosition,
    moveHeaderTo,
    adjustWindowHeight,
    listDisplays,
    moveToDisplay,
};
