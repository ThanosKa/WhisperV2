import 'dotenv/config';

import { app, BrowserWindow, dialog, desktopCapturer, session } from 'electron';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const express = require('express');
import { autoUpdater } from 'electron-updater';

// CommonJS modules remain until migrated
// eslint-disable-next-line @typescript-eslint/no-var-requires
const featureBridge = require('./bridge/featureBridge');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const windowBridge = require('./bridge/windowBridge');
// windowManager remains in CommonJS for now; require with explicit extension
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createWindows, windowPool } = require('./window/windowManager.js');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const listenService = require('./features/listen/listenService');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const databaseInitializer = require('./features/common/services/databaseInitializer');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const authService = require('./features/common/services/authService');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const settingsService = require('./features/settings/settingsService');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const sessionRepository = require('./features/common/repositories/session');

type EventBridgePayload = {
    success: boolean;
    data?: unknown;
    error?: string;
};

const eventBridge = new EventEmitter();
let WEB_PORT = 3000;
let isShuttingDown = false;
let pendingDeepLinkUrl: string | null = null;

function setupProtocolHandling() {
    try {
        const isDevRegistration = process.defaultApp || !app.isPackaged;
        if (!app.isDefaultProtocolClient('whisper')) {
            let success = false;
            if (isDevRegistration) {
                const appArg = process.argv.length >= 2 ? [path.resolve(process.argv[1])] : [];
                success = app.setAsDefaultProtocolClient('whisper', process.execPath, appArg);
            } else {
                success = app.setAsDefaultProtocolClient('whisper');
            }
            if (success) {
                console.log('[Protocol] Successfully set as default protocol client for whisper://');
            } else {
                console.warn('[Protocol] Failed to set as default protocol client - this may affect deep linking');
            }
        } else {
            console.log('[Protocol] Already registered as default protocol client for whisper://');
        }
    } catch (error) {
        console.error('[Protocol] Error during protocol registration:', error);
    }

    app.on('second-instance', (_event, commandLine) => {
        console.log('[Protocol] Second instance command line:', commandLine);
        focusMainWindow();

        let protocolUrl: string | null = null;

        for (const arg of commandLine) {
            if (typeof arg === 'string' && arg.startsWith('whisper://')) {
                const cleanUrl = arg.replace(/[\\₩]/g, '');

                if (process.platform === 'win32') {
                    if (!cleanUrl.includes(':') || cleanUrl.indexOf('://') === cleanUrl.lastIndexOf(':')) {
                        protocolUrl = cleanUrl;
                        break;
                    }
                } else {
                    protocolUrl = cleanUrl;
                    break;
                }
            }
        }

        if (protocolUrl) {
            console.log('[Protocol] Valid URL found from second instance:', protocolUrl);
            handleCustomUrl(protocolUrl);
        } else {
            console.log('[Protocol] No valid protocol URL found in command line arguments');
        }
    });

    app.on('open-url', (event, url) => {
        event.preventDefault();
        console.log('[Protocol] Received URL via open-url:', url);

        if (!url || !url.startsWith('whisper://')) {
            console.warn('[Protocol] Invalid URL format:', url);
            return;
        }

        if (app.isReady()) {
            handleCustomUrl(url);
        } else {
            pendingDeepLinkUrl = url;
            console.log('[Protocol] App not ready, storing URL for later');
        }
    });
}

function focusMainWindow() {
    if (windowPool) {
        const header = windowPool.get('header');
        if (header && !header.isDestroyed()) {
            if (header.isMinimized()) header.restore();
            header.focus();
            return true;
        }
    }

    const windows = BrowserWindow.getAllWindows();
    if (windows.length > 0) {
        const mainWindow = windows[0];
        if (!mainWindow.isDestroyed()) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
            return true;
        }
    }

    return false;
}

function setupWebDataHandlers() {
    const sttRepository = require('./features/listen/stt/repositories');
    const summaryRepository = require('./features/listen/summary/repositories');
    const askRepository = require('./features/ask/repositories');
    const userRepository = require('./features/common/repositories/user');
    const presetRepository = require('./features/common/repositories/preset');

    const handleRequest = async (channel: string, responseChannel: string, payload: unknown) => {
        let result: unknown;
        try {
            switch (channel) {
                case 'get-sessions': {
                    result = await sessionRepository.getAllByUserId();
                    break;
                }
                case 'get-session-details': {
                    const session = await sessionRepository.getById(payload);
                    if (!session) {
                        result = null;
                        break;
                    }
                    try {
                        const currentUid = authService.getCurrentUserId();
                        if (!currentUid || session.uid !== currentUid) {
                            console.warn('[WebData] Unauthorized access to session details blocked');
                            result = null;
                            break;
                        }
                    } catch (e) {
                        console.warn('[WebData] Failed to validate session ownership:', e);
                        result = null;
                        break;
                    }
                    const [transcripts, aiMessages, summary] = await Promise.all([
                        sttRepository.getAllTranscriptsBySessionId(payload),
                        askRepository.getAllAiMessagesBySessionId(payload),
                        summaryRepository.getSummaryBySessionId(payload),
                    ]);
                    result = { session, transcripts, ai_messages: aiMessages, summary };
                    break;
                }
                case 'delete-session': {
                    try {
                        const currentUidForDelete = authService.getCurrentUserId();
                        const sessionForDelete = await sessionRepository.getById(payload);
                        if (!sessionForDelete || !currentUidForDelete || sessionForDelete.uid !== currentUidForDelete) {
                            console.warn('[WebData] Unauthorized delete-session blocked');
                            result = { success: false, error: 'Unauthorized' };
                            break;
                        }
                    } catch (e) {
                        console.warn('[WebData] Failed to validate session ownership for delete:', e);
                        result = { success: false, error: 'Unauthorized' };
                        break;
                    }
                    result = await sessionRepository.deleteWithRelatedData(payload);
                    break;
                }
                case 'create-session': {
                    const id = await sessionRepository.create('ask');
                    if (payload && typeof payload === 'object' && 'title' in payload && typeof (payload as { title: string }).title === 'string') {
                        await sessionRepository.updateTitle(id, (payload as { title: string }).title);
                    }
                    result = { id };
                    break;
                }
                case 'update-session-title': {
                    if (!payload || typeof payload !== 'object') {
                        throw new Error('id and title are required');
                    }
                    const { id, title } = payload as { id: string; title: string };
                    if (!id || !title) {
                        throw new Error('id and title are required');
                    }
                    try {
                        const currentUidForUpdate = authService.getCurrentUserId();
                        const sessionForUpdate = await sessionRepository.getById(id);
                        if (!sessionForUpdate || !currentUidForUpdate || sessionForUpdate.uid !== currentUidForUpdate) {
                            console.warn('[WebData] Unauthorized update-session-title blocked');
                            result = { success: false, error: 'Unauthorized' };
                            break;
                        }
                    } catch (e) {
                        console.warn('[WebData] Failed to validate session ownership for update:', e);
                        result = { success: false, error: 'Unauthorized' };
                        break;
                    }
                    result = await sessionRepository.updateTitle(id, title);
                    break;
                }
                case 'get-user-profile': {
                    result = await userRepository.getById();
                    break;
                }
                case 'update-user-profile': {
                    result = await userRepository.update(payload);
                    break;
                }
                case 'find-or-create-user': {
                    result = await userRepository.findOrCreate(payload);
                    break;
                }
                case 'delete-account': {
                    result = await userRepository.deleteById();
                    break;
                }
                case 'get-presets': {
                    result = await presetRepository.getPresets();
                    break;
                }
                case 'update-preset': {
                    if (!payload || typeof payload !== 'object') {
                        throw new Error('Invalid payload for update-preset');
                    }
                    const { id, data } = payload as { id: string; data: { title?: string } };
                    result = await presetRepository.update(id, data);
                    settingsService.notifyPresetUpdate('updated', id, data?.title);
                    break;
                }
                case 'get-batch-data': {
                    const includes = typeof payload === 'string' ? payload.split(',').map(item => item.trim()) : ['profile', 'presets', 'sessions'];
                    const promises: Record<string, Promise<unknown>> = {};

                    if (includes.includes('profile')) {
                        promises.profile = userRepository.getById();
                    }
                    if (includes.includes('presets')) {
                        promises.presets = presetRepository.getPresets();
                    }
                    if (includes.includes('sessions')) {
                        promises.sessions = sessionRepository.getAllByUserId();
                    }

                    const batchResult: Record<string, unknown> = {};
                    const promiseResults = await Promise.all(Object.values(promises));
                    Object.keys(promises).forEach((key, index) => {
                        batchResult[key] = promiseResults[index];
                    });

                    result = batchResult;
                    break;
                }
                case 'save-api-key': {
                    result = { success: true };
                    break;
                }
                case 'check-api-key-status': {
                    result = { hasApiKey: true };
                    break;
                }
                default: {
                    throw new Error(`Unknown web data channel: ${channel}`);
                }
            }
            eventBridge.emit(responseChannel, { success: true, data: result } satisfies EventBridgePayload);
        } catch (error) {
            console.error(`Error handling web data request for ${channel}:`, error);
            eventBridge.emit(responseChannel, { success: false, error: (error as Error).message } satisfies EventBridgePayload);
        }
    };

    eventBridge.on('web-data-request', handleRequest);
}

async function handleCustomUrl(url: string) {
    try {
        console.log('[Custom URL] Processing URL:', url);

        if (!url || !url.startsWith('whisper://')) {
            console.error('[Custom URL] Invalid URL format:', url);
            return;
        }

        let cleanUrl = url.replace(/[\\₩]/g, '');

        if (cleanUrl !== url) {
            console.log('[Custom URL] Cleaned URL from:', url, 'to:', cleanUrl);
        }

        const urlObj = new URL(cleanUrl);
        const action = urlObj.hostname;
        const params = Object.fromEntries(urlObj.searchParams);

        console.log('[Custom URL] Action:', action, 'Params:', params);

        switch (action) {
            case 'login':
            case 'auth-success':
                await handleWebappAuthCallback(params);
                break;
            case 'personalize':
                handlePersonalizeFromUrl(params);
                break;
            default: {
                const header = windowPool.get('header');
                if (header) {
                    if (header.isMinimized()) header.restore();
                    header.focus();

                    const targetUrl = `http://localhost:${WEB_PORT}/${action}`;
                    console.log(`[Custom URL] Navigating webview to: ${targetUrl}`);
                    header.webContents.loadURL(targetUrl);
                }
            }
        }
    } catch (error) {
        console.error('[Custom URL] Error parsing URL:', error);
    }
}

async function handleWebappAuthCallback(params: Record<string, string>) {
    const userRepository = require('./features/common/repositories/user');
    const { sessionUuid, uid, email, displayName } = params;

    console.log('[Auth] Deep link callback received with params:', params);

    if (!sessionUuid) {
        console.error('[Auth] Webapp auth callback is missing session UUID.');
        return;
    }

    console.log('[Auth] Received session UUID from deep link, validating session...');

    try {
        let userInfo: { uid: string; email: string; displayName: string } | null = null;
        if (uid && email) {
            userInfo = {
                uid,
                email,
                displayName: displayName ? decodeURIComponent(displayName) : 'User',
            };
            console.log('[Auth] Using user data from deep link:', userInfo);
        }

        await authService.signInWithSession(sessionUuid, userInfo ?? undefined);

        console.log('[Auth] Successfully signed in with session UUID:', sessionUuid);

        const header = windowPool.get('header');
        if (header) {
            if (header.isMinimized()) header.restore();
            header.focus();
        } else {
            console.error('[Auth] Header window not found after auth callback.');
        }
    } catch (error) {
        console.error('[Auth] Error during session validation or sign-in:', error);
        const header = windowPool.get('header');
        if (header) {
            header.webContents.send('auth-failed', { message: (error as Error).message });
        }
    }
}

function handlePersonalizeFromUrl(params: Record<string, string>) {
    console.log('[Custom URL] Personalize params:', params);

    const header = windowPool.get('header');

    if (header) {
        if (header.isMinimized()) header.restore();
        header.focus();

        const personalizeUrl = `http://localhost:${WEB_PORT}/settings`;
        console.log(`[Custom URL] Navigating to personalize page: ${personalizeUrl}`);
        header.webContents.loadURL(personalizeUrl);

        BrowserWindow.getAllWindows().forEach(win => {
            win.webContents.send('enter-personalize-mode', {
                message: 'Personalization mode activated',
                params,
            });
        });
    } else {
        console.error('[Custom URL] Header window not found for personalize');
    }
}

async function startWebStack() {
    console.log('NODE_ENV =', process.env.NODE_ENV);

    const getAvailablePort = () =>
        new Promise<number>((resolve, reject) => {
            const server = require('net').createServer();
            server.listen(0, (err: Error | null) => {
                if (err) reject(err);
                const address = server.address();
                if (typeof address === 'string' || !address) {
                    server.close(() => reject(new Error('Unable to acquire port')));
                    return;
                }
                const port = address.port;
                server.close(() => resolve(port));
            });
        });

    const apiPort = await getAvailablePort();
    const frontendPort = await getAvailablePort();

    console.log(`🔧 Allocated ports: API=${apiPort}, Frontend=${frontendPort}`);

    process.env.whisper_API_PORT = apiPort.toString();
    process.env.whisper_API_URL = `http://localhost:${apiPort}`;
    process.env.whisper_WEB_PORT = frontendPort.toString();
    process.env.whisper_WEB_URL = `http://localhost:${frontendPort}`;

    console.log(`🌍 Environment variables set:`, {
        whisper_API_URL: process.env.whisper_API_URL,
        whisper_WEB_URL: process.env.whisper_WEB_URL,
    });

    const createBackendApp = require('../whisper_web/backend_node/dist');
    const nodeApi = createBackendApp(eventBridge);

    const staticDir = app.isPackaged ? path.join(process.resourcesPath, 'out') : path.join(__dirname, '..', 'whisper_web', 'out');

    const fs = require('fs');

    if (!fs.existsSync(staticDir)) {
        console.error('============================================================');
        console.error('[ERROR] Frontend build directory not found!');
        console.error(`Path: ${staticDir}`);
        console.error("Please run 'npm run build' inside the 'whisper_web' directory first.");
        console.error('============================================================');
        app.quit();
        return;
    }

    const runtimeConfig = {
        API_URL: `http://localhost:${apiPort}`,
        WEB_URL: `http://localhost:${frontendPort}`,
        timestamp: Date.now(),
    };

    const tempDir = app.getPath('temp');
    const configPath = path.join(tempDir, 'runtime-config.json');
    fs.writeFileSync(configPath, JSON.stringify(runtimeConfig, null, 2));
    console.log(`📝 Runtime config created in temp location: ${configPath}`);

    const frontSrv = express();

    frontSrv.get('/runtime-config.json', (_req, res) => {
        res.sendFile(configPath);
    });

    frontSrv.use((req, res, next) => {
        if (!req.path.includes('.') && req.path !== '/') {
            const htmlPath = path.join(staticDir, req.path + '.html');
            if (fs.existsSync(htmlPath)) {
                res.sendFile(htmlPath);
                return;
            }
        }
        next();
    });

    frontSrv.use(express.static(staticDir));

    const frontendServer = await new Promise((resolve, reject) => {
        const server = frontSrv.listen(frontendPort, '127.0.0.1', () => resolve(server));
        server.on('error', reject);
        app.once('before-quit', () => server.close());
    });

    console.log(`✅ Frontend server started on http://localhost:${frontendPort}`);

    const apiSrv = express();
    apiSrv.use(nodeApi);

    await new Promise((resolve, reject) => {
        const server = apiSrv.listen(apiPort, '127.0.0.1', () => resolve(server));
        server.on('error', reject);
        app.once('before-quit', () => server.close());
    });

    console.log(`✅ API server started on http://localhost:${apiPort}`);

    console.log(`🚀 All services ready:\n  Frontend: http://localhost:${frontendPort}\n  API:      http://localhost:${apiPort}`);

    return frontendPort;
}

async function initAutoUpdater() {
    if (process.env.NODE_ENV === 'development') {
        console.log('Development environment, skipping auto-updater.');
        return;
    }

    try {
        await autoUpdater.checkForUpdates();
        autoUpdater.on('update-available', () => {
            console.log('Update available!');
            autoUpdater.downloadUpdate();
        });
        autoUpdater.on('update-downloaded', event => {
            const releaseName = event.releaseName ?? event.version;
            const releaseNotes = Array.isArray(event.releaseNotes)
                ? event.releaseNotes.map(note => note.note).join('\n')
                : (event.releaseNotes ?? '');
            console.log('Update downloaded:', releaseNotes, releaseName, event.releaseDate, event.version);
            dialog
                .showMessageBox({
                    type: 'info',
                    title: 'Application Update',
                    message: `A new version of Whisper (${releaseName}) has been downloaded. It will be installed the next time you launch the application.`,
                    buttons: ['Restart', 'Later'],
                })
                .then(response => {
                    if (response.response === 0) {
                        autoUpdater.quitAndInstall();
                    }
                });
        });
        autoUpdater.on('error', err => {
            console.error('Error in auto-updater:', err);
        });
    } catch (err) {
        console.error('Error initializing auto-updater:', err);
    }
}

if (process.platform === 'win32' && !app.isPackaged) {
    const repoRoot = path.resolve(__dirname, '..');
    const correctCmd = `"${process.execPath}" "${repoRoot}" "%1"`;

    const key = 'HKCU\\Software\\Classes\\whisper\\shell\\open\\command';

    const { stdout } = spawnSync('reg', ['query', key, '/ve'], { encoding: 'utf8' });
    const needsUpdate = !stdout || !stdout.includes(correctCmd);

    if (needsUpdate) {
        console.log('[Dev] Re-registering whisper:// protocol');
        const { status, stderr } = spawnSync('reg', ['add', key, '/ve', '/d', correctCmd, '/f'], { encoding: 'utf8' });
        if (status !== 0) {
            console.warn('[Dev] Protocol auto-registration failed:', stderr);
        }
    }
}

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
    process.exit(0);
}

setupProtocolHandling();

if (process.platform === 'win32') {
    for (const arg of process.argv) {
        if (typeof arg === 'string' && arg.startsWith('whisper://')) {
            const cleanUrl = arg.replace(/[\\₩]/g, '');

            if (!cleanUrl.includes(':') || cleanUrl.indexOf('://') === cleanUrl.lastIndexOf(':')) {
                console.log('[Protocol] Found protocol URL in initial arguments:', cleanUrl);
                pendingDeepLinkUrl = cleanUrl;
                break;
            }
        }
    }

    console.log('[Protocol] Initial process.argv:', process.argv);
}

app.whenReady().then(async () => {
    session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
        try {
            const { screen } = require('electron');
            const askWin = windowPool.get('ask');
            const headerWin = windowPool.get('header');
            const refWin = askWin && !askWin.isDestroyed() && askWin.isVisible() ? askWin : headerWin;

            let targetDisplayId: number | null = null;
            if (refWin && !refWin.isDestroyed()) {
                const b = refWin.getBounds();
                const center = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
                const disp = screen.getDisplayNearestPoint(center);
                targetDisplayId = disp?.id ?? null;
            }

            desktopCapturer
                .getSources({ types: ['screen'] })
                .then(sources => {
                    let videoSource = sources[0];
                    if (targetDisplayId != null) {
                        const idStr = String(targetDisplayId);
                        const byDisplayId = sources.find(s => String(s.display_id || '') === idStr);
                        if (byDisplayId) {
                            videoSource = byDisplayId;
                        } else {
                            const parsed = sources.find(s => {
                                const parts = String(s.id || '').split(':');
                                return parts.length >= 2 && parts[1] === idStr;
                            });
                            if (parsed) videoSource = parsed;
                        }
                    }
                    callback({ video: videoSource, audio: 'loopback' });
                })
                .catch(error => {
                    console.error('Failed to get desktop capturer sources:', error);
                    callback({});
                });
        } catch (e) {
            console.error('DisplayMediaRequestHandler error:', e);
            callback({});
        }
    });

    try {
        await databaseInitializer.initialize();
        console.log('>>> [index.ts] Database initialized successfully');

        await authService.initialize();

        featureBridge.initialize();
        windowBridge.initialize();
        setupWebDataHandlers();

        WEB_PORT = await startWebStack();
        console.log('Web front-end listening on', WEB_PORT);

        createWindows();
    } catch (err) {
        console.error('>>> [index.ts] Database initialization failed - some features may not work', err);
        dialog.showErrorBox(
            'Application Error',
            'A critical error occurred during startup. Some features might be disabled. Please restart the application.'
        );
    }

    initAutoUpdater();

    if (pendingDeepLinkUrl) {
        console.log('[Protocol] Processing pending URL:', pendingDeepLinkUrl);
        handleCustomUrl(pendingDeepLinkUrl);
        pendingDeepLinkUrl = null;
    }
});

app.on('before-quit', async event => {
    if (isShuttingDown) {
        console.log('[Shutdown] 🔄 Shutdown already in progress, allowing quit...');
        return;
    }

    console.log('[Shutdown] App is about to quit. Starting graceful shutdown...');
    isShuttingDown = true;
    event.preventDefault();

    try {
        await listenService.closeSession();
        console.log('[Shutdown] Audio capture stopped');

        try {
            await sessionRepository.endAllActiveSessions();
            console.log('[Shutdown] Active sessions ended');
        } catch (dbError) {
            console.warn('[Shutdown] Could not end active sessions (database may be closed):', dbError);
        }

        try {
            databaseInitializer.close();
            console.log('[Shutdown] Database connections closed');
        } catch (closeError) {
            console.warn('[Shutdown] Error closing database:', closeError);
        }

        console.log('[Shutdown] Graceful shutdown completed successfully');
    } catch (error) {
        console.error('[Shutdown] Error during graceful shutdown:', error);
    } finally {
        console.log('[Shutdown] Exiting application...');
        app.exit(0);
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindows();
    }
});
