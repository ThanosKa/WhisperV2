// First import, so `.env` is loaded before any other module reads `process.env`.
import 'dotenv/config';
// Then the environment, parsed once: a wrong value stops startup here with the variable's name.
import { env } from './features/common/config/env';

import { app, BrowserWindow, dialog, desktopCapturer, session, screen, type Streams } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import net from 'node:net';
import type { Server } from 'node:http';
import { spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import express, { type Express } from 'express';
import { autoUpdater, type UpdateInfo } from 'electron-updater';
import { z } from 'zod';
import { createWindows, windowPool } from './window/windowManager';
import listenService from './features/listen/listenService';
import databaseInitializer from './features/common/services/databaseInitializer';
import authService, { type DeepLinkUser } from './features/common/services/authService';
import * as settingsService from './features/settings/settingsService';
import sessionRepository from './features/common/repositories/session';
import sttRepository from './features/listen/stt/repositories';
import summaryRepository from './features/listen/summary/repositories';
import askRepository from './features/ask/repositories';
import userRepository from './features/common/repositories/user';
import presetRepository from './features/common/repositories/preset';
import { errorMessage } from './features/common/utils/errors';
import { logger } from './features/common/utils/logger';
import featureBridge from './bridge/featureBridge';
import windowBridge from './bridge/windowBridge';
import { sendEvent } from './ipc/typedIpc';
import type { EventArgs } from '../shared/ipc';
import createBackendApp from '../../whisper_web/backend_node/dist';

const log = logger.child({ module: 'Main' });
const protocolLog = logger.child({ module: 'Protocol' });
const shutdownLog = logger.child({ module: 'Shutdown' });
const webDataLog = logger.child({ module: 'WebData' });
const customUrlLog = logger.child({ module: 'CustomUrl' });
const authLog = logger.child({ module: 'Auth' });
const updaterLog = logger.child({ module: 'AutoUpdater' });

// Ensure consistent app name so protocol prompts say "Open Whisper" even in dev
app.setName('Whisper');

// -------------------------------------------------
//  auto-register protocol for dev (Windows only)
// -------------------------------------------------
if (process.platform === 'win32' && !app.isPackaged) {
    const repoRoot = path.resolve(__dirname, '../..'); // repo folder (this file runs from out/main/)
    const correctCmd = `"${process.execPath}" "${repoRoot}" "%1"`;

    const key = 'HKCU\\Software\\Classes\\whisper\\shell\\open\\command';

    // 1) check current value
    const { stdout } = spawnSync('reg', ['query', key, '/ve'], { encoding: 'utf8' });
    const needsUpdate = !stdout || !stdout.includes(correctCmd);

    if (needsUpdate) {
        log.info('Dev: re-registering whisper:// protocol');
        // 2) set new value
        const { status, stderr } = spawnSync('reg', ['add', key, '/ve', '/d', correctCmd, '/f'], { encoding: 'utf8' });
        if (status !== 0) {
            log.warn({ stderr }, 'Dev: protocol auto-registration failed');
        }
    }
}

// Ensure single instance and register handlers BEFORE any argv parsing or protocol work
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
    process.exit(0);
}

// Setup protocol after single instance lock so second-instance events are caught correctly
setupProtocolHandling();

// Global variables
const eventBridge = new EventEmitter();
// `undefined` when the dashboard build is missing and startup quits (startWebStack)
let WEB_PORT: number | undefined = 3000;
let isShuttingDown = false; // Flag to prevent infinite shutdown loop

// Native deep link handling - cross-platform compatible
let pendingDeepLinkUrl: string | null = null;

function setupProtocolHandling() {
    // Protocol registration - must be done before app is ready
    try {
        const isDevRegistration = process.defaultApp || !app.isPackaged;
        if (!app.isDefaultProtocolClient('whisper')) {
            // In dev, pass the app folder as an argument so Windows launches the correct project
            let success = false;
            if (isDevRegistration) {
                const appArgument = process.argv[1];
                const appArg = appArgument === undefined ? [] : [path.resolve(appArgument)];
                success = app.setAsDefaultProtocolClient('whisper', process.execPath, appArg);
            } else {
                success = app.setAsDefaultProtocolClient('whisper');
            }
            if (success) {
                protocolLog.info('Set as default protocol client for whisper://');
            } else {
                protocolLog.warn('Failed to set as default protocol client - this may affect deep linking');
            }
        } else {
            protocolLog.info('Already registered as default protocol client for whisper://');
        }
    } catch (error) {
        protocolLog.error({ err: error }, 'Error during protocol registration');
    }

    // Handle protocol URLs on Windows/Linux
    app.on('second-instance', (_event, commandLine) => {
        protocolLog.info({ commandLine }, 'Second instance command line');

        focusMainWindow();

        let protocolUrl = null;

        // Search through all command line arguments for a valid protocol URL
        for (const arg of commandLine) {
            if (arg && typeof arg === 'string' && arg.startsWith('whisper://')) {
                // Clean up the URL by removing problematic characters
                const cleanUrl = arg.replace(/[\\₩]/g, '');

                // Additional validation for Windows
                if (process.platform === 'win32') {
                    // On Windows, ensure the URL doesn't contain file path indicators
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
            protocolLog.info({ url: protocolUrl }, 'Valid URL found from second instance');
            void handleCustomUrl(protocolUrl);
        } else {
            protocolLog.info({ commandLine }, 'No valid protocol URL found in command line arguments');
        }
    });

    // Handle protocol URLs on macOS
    app.on('open-url', (event, url) => {
        event.preventDefault();
        protocolLog.info({ url }, 'Received URL via open-url');

        if (!url || !url.startsWith('whisper://')) {
            protocolLog.warn({ url }, 'Invalid URL format');
            return;
        }

        if (app.isReady()) {
            void handleCustomUrl(url);
        } else {
            pendingDeepLinkUrl = url;
            protocolLog.info('App not ready, storing URL for later');
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

    // Fallback: focus any available window
    const mainWindow = BrowserWindow.getAllWindows()[0];
    if (mainWindow) {
        if (!mainWindow.isDestroyed()) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
            return true;
        }
    }

    return false;
}

if (process.platform === 'win32') {
    for (const arg of process.argv) {
        if (arg && typeof arg === 'string' && arg.startsWith('whisper://')) {
            // Clean up the URL by removing problematic characters (korean characters issue...)
            const cleanUrl = arg.replace(/[\\₩]/g, '');

            if (!cleanUrl.includes(':') || cleanUrl.indexOf('://') === cleanUrl.lastIndexOf(':')) {
                protocolLog.info({ url: cleanUrl }, 'Found protocol URL in initial arguments');
                pendingDeepLinkUrl = cleanUrl;
                break;
            }
        }
    }

    protocolLog.info({ argv: process.argv }, 'Initial process.argv');
}

// Sends an event to every open window.
function broadcast<C extends 'app:update-available' | 'app:update-not-available' | 'app:update-error' | 'app:update-downloaded'>({
    channel,
    args,
}: {
    channel: C;
    args: EventArgs[C];
}) {
    BrowserWindow.getAllWindows().forEach(win => {
        if (win && !win.isDestroyed()) {
            sendEvent({ webContents: win.webContents, channel, args });
        }
    });
}

void app.whenReady().then(async () => {
    // Configure auto-updater
    void autoUpdater.checkForUpdatesAndNotify();

    // Log update events for debugging
    autoUpdater.on('checking-for-update', () => {
        updaterLog.info('Checking for update');
    });

    autoUpdater.on('update-available', (info: UpdateInfo) => {
        updaterLog.info({ info }, 'Update available');
        // Broadcast to all windows
        if (windowPool) {
            const releaseUrl = `https://github.com/ThanosKa/whisper-desktop/releases/latest`;
            broadcast({
                channel: 'app:update-available',
                args: [{ version: info.version, releaseDate: info.releaseDate, releaseName: info.releaseName, releaseUrl }],
            });
        }
    });

    autoUpdater.on('update-not-available', (info: UpdateInfo) => {
        updaterLog.info({ info }, 'Update not available');
        // Broadcast to all windows
        if (windowPool) {
            broadcast({ channel: 'app:update-not-available', args: [{ currentVersion: app.getVersion() }] });
        }
    });

    autoUpdater.on('error', err => {
        updaterLog.error({ err }, 'Auto-updater error');
        // Broadcast to all windows
        if (windowPool) {
            broadcast({ channel: 'app:update-error', args: [{ error: err.message || 'Unknown update error' }] });
        }
    });

    autoUpdater.on('download-progress', progressObj => {
        updaterLog.info({ percent: progressObj.percent }, 'Download progress');
    });

    autoUpdater.on('update-downloaded', info => {
        updaterLog.info({ info }, 'Update downloaded');
        // Broadcast to all windows
        if (windowPool) {
            broadcast({
                channel: 'app:update-downloaded',
                args: [{ version: info.version, releaseDate: info.releaseDate, releaseName: info.releaseName }],
            });
        }
    });

    // Setup native loopback audio capture for Windows
    session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
        try {
            // Try to detect which display the app is on (prefer Ask window)
            const askWin = windowPool.get('ask');
            const headerWin = windowPool.get('header');
            const refWin = askWin && !askWin.isDestroyed() && askWin.isVisible() ? askWin : headerWin;

            let targetDisplayId: number | null = null;
            if (refWin && !refWin.isDestroyed()) {
                const b = refWin.getBounds();
                const center = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
                const disp = screen.getDisplayNearestPoint(center);
                targetDisplayId = disp.id;
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
                    const streams: Streams = videoSource ? { video: videoSource, audio: 'loopback' } : { audio: 'loopback' };
                    callback(streams);
                })
                .catch(error => {
                    log.error({ err: error }, 'Failed to get desktop capturer sources');
                    callback({});
                });
        } catch (e) {
            log.error({ err: e }, 'DisplayMediaRequestHandler error');
            callback({});
        }
    });

    // Initialize core services
    try {
        await databaseInitializer.initialize();
        log.info('Database initialized');

        await authService.initialize();

        featureBridge.initialize();
        windowBridge.initialize();
        setupWebDataHandlers();

        // Initialize listen service
        listenService.initialize();

        // Start web server and create windows ONLY after all initializations are successful
        WEB_PORT = await startWebStack();
        log.info({ port: WEB_PORT }, 'Web front-end listening');

        createWindows();

        // Open dev tools for recovery toast window on app launch (dev mode only)
        if (!app.isPackaged) {
            const recoveryToastWin = windowPool.get('recoveryToast');
            if (recoveryToastWin && !recoveryToastWin.isDestroyed()) {
                recoveryToastWin.webContents.once('dom-ready', () => {
                    recoveryToastWin.webContents.openDevTools({ mode: 'detach' });
                });
            }
        }

        // Bootstrap recovery check AFTER windows are created (so header can receive notification)
        void (async () => {
            try {
                log.info('Starting recovery bootstrap');
                await listenService.bootstrapRecovery();
                log.info('Recovery bootstrap complete');
            } catch (err) {
                log.error({ err }, 'Recovery bootstrap failed');
            }
        })();
    } catch (err) {
        log.error({ err }, 'Database initialization failed - some features may not work');
        dialog.showErrorBox(
            'Application Error',
            'A critical error occurred during startup. Some features might be disabled. Please restart the application.'
        );
    }

    // initAutoUpdater should be called after auth is initialized
    void initAutoUpdater();

    // Process any pending deep link after everything is initialized
    if (pendingDeepLinkUrl) {
        protocolLog.info({ url: pendingDeepLinkUrl }, 'Processing pending URL');
        void handleCustomUrl(pendingDeepLinkUrl);
        pendingDeepLinkUrl = null;
    }
});

app.on('before-quit', async event => {
    // Prevent infinite loop by checking if shutdown is already in progress
    if (isShuttingDown) {
        shutdownLog.info('Shutdown already in progress, allowing quit');
        return;
    }

    shutdownLog.info('App is about to quit. Starting graceful shutdown');

    // Set shutdown flag to prevent infinite loop
    isShuttingDown = true;

    // Prevent immediate quit to allow graceful shutdown
    event.preventDefault();

    try {
        // 1. Stop audio capture first (immediate) - don't end session, preserve for recovery
        await listenService.stopAudioCapture();
        shutdownLog.info('Audio capture stopped');

        // NOTE: Don't end sessions on app close - preserve them for crash recovery
        // Sessions are only ended when user explicitly clicks "Done" or signs out

        // Close database connections (final cleanup)
        try {
            databaseInitializer.close();
            shutdownLog.info('Database connections closed');
        } catch (closeError) {
            shutdownLog.warn({ err: closeError }, 'Error closing database');
        }

        shutdownLog.info('Graceful shutdown completed successfully');
    } catch (error) {
        shutdownLog.error({ err: error }, 'Error during graceful shutdown');
        // Continue with shutdown even if there were errors
    } finally {
        // Actually quit the app now
        shutdownLog.info('Exiting application');
        app.exit(0); // Use app.exit() instead of app.quit() to force quit
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindows();
    }
});

// The dashboard's API (whisper_web/backend_node) asks main for data over `eventBridge`. Its payloads
// come from HTTP requests, so each is parsed here before use.
const SessionIdSchema = z.string();
const CreateSessionSchema = z.looseObject({ title: z.string().optional() }).nullish();
const UpdateSessionTitleSchema = z.object({ id: z.string(), title: z.string() });
const UpdateUserProfileSchema = z.object({ displayName: z.string() });
const FindOrCreateUserSchema = z.object({ uid: z.string(), displayName: z.string().nullish(), email: z.string().nullish() }).nullish();
const UpdatePresetSchema = z.object({
    id: z.string(),
    data: z.object({ title: z.string().optional(), prompt: z.string().optional(), append_text: z.string().nullish() }),
});
const BatchIncludeSchema = z.string().optional();

function isCurrentUsersSession({ sessionOwner, currentUid }: { sessionOwner: string | undefined; currentUid: string | null }) {
    return !!currentUid && sessionOwner === currentUid;
}

async function getSessionDetails(payload: unknown) {
    const sessionId = SessionIdSchema.parse(payload);
    const session = sessionRepository.getById(sessionId);
    if (!session) return null;

    // Ownership check: ensure the requested session belongs to the current authenticated user
    try {
        const currentUid = authService.getCurrentUserId();
        if (!isCurrentUsersSession({ sessionOwner: session.uid, currentUid })) {
            webDataLog.warn({ requestedSessionId: sessionId, sessionOwner: session.uid, currentUid }, 'Unauthorized access to session details blocked');
            return null;
        }
    } catch (e) {
        webDataLog.warn({ err: e }, 'Failed to validate session ownership');
        return null;
    }
    const [transcripts, ai_messages, summary] = await Promise.all([
        sttRepository.getAllTranscriptsBySessionId(sessionId),
        askRepository.getAllAiMessagesBySessionId(sessionId),
        summaryRepository.getSummaryBySessionId(sessionId),
    ]);

    // For active sessions (ended_at is null), fetch all insights
    const insights = session.ended_at ? null : summaryRepository.getAllInsightsBySessionId(sessionId);

    return { session, transcripts, ai_messages, summary, insights };
}

async function deleteSession(payload: unknown) {
    const sessionId = SessionIdSchema.parse(payload);
    // Ensure the session belongs to the current user before deletion
    try {
        const currentUidForDelete = authService.getCurrentUserId();
        const sessionForDelete = sessionRepository.getById(sessionId);
        if (!sessionForDelete || !isCurrentUsersSession({ sessionOwner: sessionForDelete.uid, currentUid: currentUidForDelete })) {
            webDataLog.warn(
                { requestedSessionId: sessionId, sessionOwner: sessionForDelete?.uid, currentUidForDelete },
                'Unauthorized delete-session blocked'
            );
            return { success: false, error: 'Unauthorized' };
        }
    } catch (e) {
        webDataLog.warn({ err: e }, 'Failed to validate session ownership for delete');
        return { success: false, error: 'Unauthorized' };
    }
    return sessionRepository.deleteWithRelatedData(sessionId);
}

async function createSession(payload: unknown) {
    const body = CreateSessionSchema.parse(payload);
    const id = sessionRepository.create('ask');
    if (id && body && body.title) {
        sessionRepository.updateTitle({ id, title: body.title });
    }
    return { id };
}

async function updateSessionTitle(payload: unknown) {
    const parsed = UpdateSessionTitleSchema.safeParse(payload);
    if (!parsed.success || !parsed.data.id || !parsed.data.title) {
        throw new Error('id and title are required');
    }
    const { id, title } = parsed.data;
    // Ownership check for update
    try {
        const currentUidForUpdate = authService.getCurrentUserId();
        const sessionForUpdate = sessionRepository.getById(id);
        if (!sessionForUpdate || !isCurrentUsersSession({ sessionOwner: sessionForUpdate.uid, currentUid: currentUidForUpdate })) {
            webDataLog.warn(
                { requestedSessionId: id, sessionOwner: sessionForUpdate?.uid, currentUidForUpdate },
                'Unauthorized update-session-title blocked'
            );
            return { success: false, error: 'Unauthorized' };
        }
    } catch (e) {
        webDataLog.warn({ err: e }, 'Failed to validate session ownership for update');
        return { success: false, error: 'Unauthorized' };
    }
    return sessionRepository.updateTitle({ id, title });
}

async function updatePreset(payload: unknown) {
    const { id, data } = UpdatePresetSchema.parse(payload);
    const result = presetRepository.update({ id, changes: data });
    settingsService.notifyPresetUpdate({ action: 'updated', presetId: id, title: data.title ?? null });
    return result;
}

async function getBatchData(payload: unknown) {
    const include = BatchIncludeSchema.parse(payload);
    const includes = include ? include.split(',').map(item => item.trim()) : ['profile', 'presets', 'sessions'];

    const [profile, presets, sessions] = await Promise.all([
        includes.includes('profile') ? userRepository.getById() : undefined,
        includes.includes('presets') ? presetRepository.getPresets() : undefined,
        includes.includes('sessions') ? sessionRepository.getAllByUserId() : undefined,
    ]);

    // Only the parts asked for, in the order asked: profile, presets, sessions
    return {
        ...(includes.includes('profile') ? { profile } : {}),
        ...(includes.includes('presets') ? { presets } : {}),
        ...(includes.includes('sessions') ? { sessions } : {}),
    };
}

// Each repository call below takes the current user from authService.
async function webDataResult({ channel, payload }: { channel: string; payload: unknown }): Promise<unknown> {
    switch (channel) {
        // SESSION
        case 'get-sessions':
            return sessionRepository.getAllByUserId();
        case 'get-session-details':
            return getSessionDetails(payload);
        case 'delete-session':
            return deleteSession(payload);
        case 'create-session':
            return createSession(payload);
        case 'update-session-title':
            return updateSessionTitle(payload);

        // USER
        case 'get-user-profile':
            return userRepository.getById();
        case 'update-user-profile':
            return userRepository.update(UpdateUserProfileSchema.parse(payload));
        case 'find-or-create-user':
            return userRepository.findOrCreate(FindOrCreateUserSchema.parse(payload));
        case 'delete-account':
            return userRepository.deleteById();

        // PRESET
        case 'get-presets':
            return presetRepository.getPresets();
        case 'update-preset':
            return updatePreset(payload);

        // BATCH
        case 'get-batch-data':
            return getBatchData(payload);

        default:
            throw new Error(`Unknown web data channel: ${channel}`);
    }
}

function setupWebDataHandlers() {
    eventBridge.on('web-data-request', async (channel: string, responseChannel: string, payload: unknown) => {
        try {
            const result = await webDataResult({ channel, payload });
            eventBridge.emit(responseChannel, { success: true, data: result });
        } catch (error) {
            webDataLog.error({ err: error, channel }, 'Error handling web data request');
            eventBridge.emit(responseChannel, { success: false, error: errorMessage(error) });
        }
    });
}

async function handleCustomUrl(rawUrl: string) {
    try {
        customUrlLog.info({ url: rawUrl }, 'Processing URL');

        // Validate and clean URL
        if (!rawUrl || typeof rawUrl !== 'string' || !rawUrl.startsWith('whisper://')) {
            customUrlLog.error({ url: rawUrl }, 'Invalid URL format');
            return;
        }

        // Clean up URL by removing problematic characters
        const url = rawUrl.replace(/[\\₩]/g, '');
        if (url !== rawUrl) {
            customUrlLog.info({ from: rawUrl, to: url }, 'Cleaned URL');
        }

        const urlObj = new URL(url);
        const action = urlObj.hostname;
        const params = Object.fromEntries(urlObj.searchParams);

        customUrlLog.info({ action, params }, 'Custom URL action');

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
                    customUrlLog.info({ targetUrl }, 'Navigating webview');
                    void header.webContents.loadURL(targetUrl);
                }
            }
        }
    } catch (error) {
        customUrlLog.error({ err: error }, 'Error parsing URL');
    }
}

async function handleWebappAuthCallback(params: Record<string, string>) {
    const { sessionUuid, uid, email, displayName } = params;

    authLog.info({ params }, 'Deep link callback received');

    if (!sessionUuid) {
        authLog.error('Webapp auth callback is missing session UUID');
        return;
    }

    authLog.info('Received session UUID from deep link, validating session');

    try {
        // Prepare user data from deep link parameters if available
        let userInfo: DeepLinkUser | null = null;
        if (uid && email) {
            userInfo = {
                uid: uid,
                email: email,
                displayName: displayName ? decodeURIComponent(displayName) : 'User',
            };
            authLog.info({ userInfo }, 'Using user data from deep link');
        }

        // Use authService to sign in with session and user data
        await authService.signInWithSession({ sessionUuid, userInfo });

        authLog.info({ sessionUuid }, 'Signed in with session UUID');

        // Focus the app window
        const header = windowPool.get('header');
        if (header) {
            if (header.isMinimized()) header.restore();
            header.focus();
        } else {
            authLog.error('Header window not found after auth callback');
        }
    } catch (error) {
        authLog.error({ err: error }, 'Error during session validation or sign-in');
        // The UI will not change, and the user can try again.
        const header = windowPool.get('header');
        if (header) {
            sendEvent({ webContents: header.webContents, channel: 'auth-failed', args: [{ message: errorMessage(error) }] });
        }
    }
}

function handlePersonalizeFromUrl(params: Record<string, string>) {
    customUrlLog.info({ params }, 'Personalize params');

    const header = windowPool.get('header');

    if (header) {
        if (header.isMinimized()) header.restore();
        header.focus();

        const personalizeUrl = `http://localhost:${WEB_PORT}/settings`;
        customUrlLog.info({ personalizeUrl }, 'Navigating to personalize page');
        void header.webContents.loadURL(personalizeUrl);
    } else {
        customUrlLog.error('Header window not found for personalize');
    }
}

// Express 5 passes a listen error to the callback instead of throwing it.
function listenOn({ expressApp, port }: { expressApp: Express; port: number }) {
    return new Promise<Server>((resolve, reject) => {
        const server = expressApp.listen(port, '127.0.0.1', err => (err ? reject(err) : resolve(server)));
        server.on('error', reject);
        app.once('before-quit', () => server.close());
    });
}

function getAvailablePort() {
    return new Promise<number>((resolve, reject) => {
        const server = net.createServer();
        server.listen(0, () => {
            const address = server.address();
            if (address === null || typeof address === 'string') {
                reject(new Error('The port probe has no TCP address'));
                return;
            }
            server.close(() => resolve(address.port));
        });
    });
}

async function startWebStack(): Promise<number | undefined> {
    log.info({ nodeEnv: env.NODE_ENV }, 'Starting web stack');

    const apiPort = await getAvailablePort();
    const frontendPort = await getAvailablePort();

    log.info({ apiPort, frontendPort }, 'Allocated ports');

    process.env.whisper_API_PORT = apiPort.toString();
    process.env.whisper_API_URL = `http://localhost:${apiPort}`;
    process.env.whisper_WEB_PORT = frontendPort.toString();
    process.env.whisper_WEB_URL = `http://localhost:${frontendPort}`;

    log.info({ whisper_API_URL: process.env.whisper_API_URL, whisper_WEB_URL: process.env.whisper_WEB_URL }, 'Environment variables set');

    const nodeApi = createBackendApp(eventBridge);

    const staticDir = app.isPackaged ? path.join(process.resourcesPath, 'out') : path.join(__dirname, '..', '..', 'whisper_web', 'out');

    if (!fs.existsSync(staticDir)) {
        log.error({ staticDir }, "Frontend build directory not found. Run 'pnpm run build:web' first.");
        app.quit();
        return;
    }

    const runtimeConfig = {
        API_URL: `http://localhost:${apiPort}`,
        WEB_URL: `http://localhost:${frontendPort}`,
        timestamp: Date.now(),
    };

    // Create runtime configuration file in writable temp folder
    const tempDir = app.getPath('temp');
    const configPath = path.join(tempDir, 'runtime-config.json');
    fs.writeFileSync(configPath, JSON.stringify(runtimeConfig, null, 2));
    log.info({ configPath }, 'Runtime config created in temp location');

    const frontSrv = express();

    // When frontend requests /runtime-config.json, serve the file from temp folder
    frontSrv.get('/runtime-config.json', (_req, res) => {
        res.sendFile(configPath);
    });

    frontSrv.use((req, res, next) => {
        if (req.path.indexOf('.') === -1 && req.path !== '/') {
            const htmlPath = path.join(staticDir, req.path + '.html');
            if (fs.existsSync(htmlPath)) {
                return res.sendFile(htmlPath);
            }
        }
        next();
    });

    frontSrv.use(express.static(staticDir));

    await listenOn({ expressApp: frontSrv, port: frontendPort });

    log.info({ url: `http://localhost:${frontendPort}` }, 'Frontend server started');

    const apiSrv = express();
    apiSrv.use(nodeApi);

    await listenOn({ expressApp: apiSrv, port: apiPort });

    log.info({ url: `http://localhost:${apiPort}` }, 'API server started');
    log.info({ frontend: `http://localhost:${frontendPort}`, api: `http://localhost:${apiPort}` }, 'All services ready');

    return frontendPort;
}

// Auto-update initialization
async function initAutoUpdater() {
    if (env.NODE_ENV === 'development') {
        updaterLog.info('Development environment, skipping auto-updater');
        return;
    }

    try {
        await autoUpdater.checkForUpdates();
        autoUpdater.on('update-available', (info: UpdateInfo) => {
            updaterLog.info({ info }, 'Update available, downloading');
            // Broadcast to all windows
            broadcast({
                channel: 'app:update-available',
                args: [{ version: info.version, releaseDate: info.releaseDate, releaseName: info.releaseName }],
            });
            void autoUpdater.downloadUpdate();
        });
        // Kept bug (4a-2): this listener read `(event, releaseNotes, releaseName, date, url)`, but
        // electron-updater passes only the event, so the version, date and name it sent were undefined.
        autoUpdater.on('update-downloaded', event => {
            updaterLog.info({ event }, 'Update downloaded');
            // Broadcast to all windows
            broadcast({ channel: 'app:update-downloaded', args: [{ version: undefined, releaseDate: undefined, releaseName: undefined }] });
            // Don't show dialog automatically - let UI handle it
        });
        autoUpdater.on('error', err => {
            updaterLog.error({ err }, 'Error in auto-updater');
        });
    } catch (err) {
        updaterLog.error({ err }, 'Error initializing auto-updater');
    }
}
