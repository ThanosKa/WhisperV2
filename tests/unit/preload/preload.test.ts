import { beforeAll, describe, expect, test, vi } from 'vitest';
import { electronMock } from '../../setup/electronMocks';

// The preload's `window.api`, as the Lit windows get it through contextBridge.
let api: Record<string, Record<string, unknown>>;

beforeAll(async () => {
    process.argv.push('--whisper-api-base-url=https://www.app-whisper.com');
    await import('../../../src/preload/preload');
    const [name, exposed] = electronMock.contextBridge.exposeInMainWorld.mock.calls[0] ?? [];
    expect(name).toBe('api');
    api = exposed;
});

const method = ({ namespace, name }: { namespace: string; name: string }) => {
    const fn = api[namespace]?.[name];
    if (typeof fn !== 'function') throw new Error(`window.api.${namespace}.${name} is not a function`);
    return (...args: unknown[]): unknown => fn(...args);
};

// Today's `window.api`, without the methods whose channel had no handler or no sender.
const expectedShape = {
    platform: ['isLinux', 'isMacOS', 'isWindows', 'platform'],
    env: ['API_BASE_URL'],
    common: [
        'getCurrentUser',
        'startWebappAuth',
        'resetAuthState',
        'quitApplication',
        'openExternal',
        'onUserStateChanged',
        'removeOnUserStateChanged',
    ],
    headerController: [
        'sendHeaderStateChanged',
        'reInitializeModelState',
        'resizeHeaderWindow',
        'checkSystemPermissions',
        'onUserStateChanged',
        'removeOnUserStateChanged',
        'onAuthFailed',
        'removeOnAuthFailed',
        'onAuthStarted',
        'removeOnAuthStarted',
        'sendAuthStarted',
        'onForceShowPermission',
        'removeOnForceShowPermission',
    ],
    mainHeader: [
        'getHeaderPosition',
        'moveHeaderTo',
        'sendHeaderAnimationFinished',
        'cancelHideSettingsWindow',
        'showSettingsWindow',
        'hideSettingsWindow',
        'sendListenButtonClick',
        'sendAskButtonClick',
        'sendToggleAllWindowsVisibility',
        'getCurrentShortcuts',
        'onListenChangeSessionResult',
        'removeOnListenChangeSessionResult',
        'showPlanWindow',
        'setListenWindowVisibility',
        'isListenWindowVisible',
        'onListenWindowVisibilityChanged',
        'removeOnListenWindowVisibilityChanged',
        'handleRecoveryAction',
        'onStrandedSessionDetected',
        'removeOnStrandedSessionDetected',
        'getStrandedSession',
        'showRecoveryToast',
        'onSttQuotaExceeded',
        'removeOnSttQuotaExceeded',
    ],
    recoveryToast: ['onShow', 'removeOnShow', 'onHide', 'removeOnHide', 'handleRecoveryAction'],
    quota: ['onUpdate', 'removeOnUpdate', 'removeAll'],
    permissionHeader: ['checkSystemPermissions', 'requestMicrophonePermission', 'openSystemPreferences'],
    whisperApp: ['onClickThroughToggled', 'removeOnClickThroughToggled', 'removeAllClickThroughListeners'],
    askView: [
        'closeAskWindow',
        'adjustWindowHeight',
        'sendMessage',
        'setUseScreenCapture',
        'interruptStream',
        'showScreenshotWindow',
        'hideScreenshotWindow',
        'onAskStateUpdate',
        'removeOnAskStateUpdate',
        'onAskStreamError',
        'removeOnAskStreamError',
        'onShowTextInput',
        'removeOnShowTextInput',
    ],
    listenView: [
        'adjustWindowHeight',
        'onForceHeightRecalc',
        'listAnalysisPresets',
        'getAnalysisPreset',
        'setAnalysisPreset',
        'onSessionStateChanged',
        'removeOnSessionStateChanged',
        'onSyncConversationHistory',
        'removeOnSyncConversationHistory',
        'onPresetsUpdated',
        'removeOnPresetsUpdated',
    ],
    sttView: ['onSttUpdate', 'removeOnSttUpdate', 'onSttQuotaExceeded', 'removeOnSttQuotaExceeded'],
    summaryView: ['sendQuestionFromSummary', 'onSummaryUpdate', 'removeOnSummaryUpdate', 'removeAllSummaryUpdateListeners'],
    settingsView: [
        'getCurrentUser',
        'openPersonalizePage',
        'startWebappAuth',
        'signOut',
        'openDbPath',
        'getAutoUpdate',
        'setAutoUpdate',
        'getAppVersion',
        'checkForUpdates',
        'installUpdate',
        'onUpdateAvailable',
        'onUpdateDownloaded',
        'onUpdateNotAvailable',
        'onUpdateError',
        'removeUpdateListeners',
        'getContentProtectionStatus',
        'toggleContentProtection',
        'getCurrentShortcuts',
        'moveWindowStep',
        'getDisplays',
        'moveToDisplay',
        'cancelHideSettingsWindow',
        'hideSettingsWindow',
        'quitApplication',
        'showPermissionOnboarding',
        'onUserStateChanged',
        'removeOnUserStateChanged',
        'onSettingsUpdated',
        'removeOnSettingsUpdated',
        'onPresetsUpdated',
        'removeOnPresetsUpdated',
    ],
    screenshotView: ['cancelHideScreenshotWindow', 'hideScreenshotWindow', 'onScreenshotData', 'removeOnScreenshotData'],
    planView: ['cancelHidePlanWindow', 'hidePlanWindow'],
    listenCapture: [
        'sendMicAudioContent',
        'sendSystemAudioContent',
        'startMacosSystemAudio',
        'stopMacosSystemAudio',
        'isSessionActive',
        'onSystemAudioData',
        'removeOnSystemAudioData',
    ],
    renderer: ['onChangeListenCaptureState', 'removeOnChangeListenCaptureState'],
};

describe('window.api', () => {
    test('has the same namespaces and methods as before the typed list', () => {
        const shape = Object.fromEntries(Object.entries(api).map(([namespace, members]) => [namespace, Object.keys(members)]));
        expect(shape).toEqual(expectedShape);
    });

    test('carries platform and the API base URL main passed in', () => {
        expect(api.platform).toMatchObject({ platform: process.platform, isMacOS: process.platform === 'darwin' });
        expect(api.env).toEqual({ API_BASE_URL: 'https://www.app-whisper.com' });
    });

    test.each<[string, string, unknown[], string, unknown[]]>([
        ['askView', 'sendMessage', ['What did they decide?'], 'ask:sendQuestionFromAsk', ['What did they decide?', true, false]],
        ['askView', 'sendMessage', ['Search it', false, true], 'ask:sendQuestionFromAsk', ['Search it', false, true]],
        ['askView', 'adjustWindowHeight', ['ask', 420], 'adjust-window-height', [{ winName: 'ask', height: 420 }]],
        ['listenView', 'adjustWindowHeight', ['listen', 300], 'adjust-window-height', [{ winName: 'listen', height: 300 }]],
        ['mainHeader', 'moveHeaderTo', [412, 8], 'move-header-to', [412, 8]],
        ['mainHeader', 'setListenWindowVisibility', [false], 'window:set-visibility', [{ name: 'listen', visible: false }]],
        ['mainHeader', 'isListenWindowVisible', [], 'window:is-visible', ['listen']],
        ['recoveryToast', 'handleRecoveryAction', ['resume', 'session-1'], 'listen:handleRecoveryAction', ['resume', 'session-1']],
        ['mainHeader', 'handleRecoveryAction', ['finalize', 'session-1'], 'listen:handleRecoveryAction', ['finalize', 'session-1']],
        ['listenView', 'setAnalysisPreset', [{ presetId: 'meetings' }], 'listen:setAnalysisPreset', [{ presetId: 'meetings' }]],
        ['settingsView', 'moveWindowStep', ['left'], 'move-window-step', ['left']],
        ['common', 'openExternal', ['https://example.com'], 'open-external', ['https://example.com']],
    ])('%s.%s invokes its channel with the same arguments as before', (namespace, name, args, channel, sent) => {
        electronMock.ipcRenderer.invoke.mockReturnValue(Promise.resolve('answer'));

        expect(method({ namespace, name })(...args)).toBeInstanceOf(Promise);
        expect(electronMock.ipcRenderer.invoke).toHaveBeenCalledWith(channel, ...sent);
    });

    test('an invoke resolves with what main answered', async () => {
        electronMock.ipcRenderer.invoke.mockReturnValue(Promise.resolve('1.7.0'));

        await expect(method({ namespace: 'settingsView', name: 'getAppVersion' })()).resolves.toBe('1.7.0');
    });

    test.each<[string, string, unknown[], string, unknown[]]>([
        ['mainHeader', 'showPlanWindow', [true], 'window:showPlanWindow', [{ visible: true }]],
        ['askView', 'showScreenshotWindow', ['iVBOR', { x: 1, y: 2 }], 'show-screenshot-window', [{ base64Data: 'iVBOR', position: { x: 1, y: 2 } }]],
        ['headerController', 'sendHeaderStateChanged', ['main'], 'header-state-changed', ['main']],
        ['headerController', 'sendAuthStarted', [], 'auth-started', []],
    ])('%s.%s sends its channel with the same arguments as before', (namespace, name, args, channel, sent) => {
        method({ namespace, name })(...args);

        expect(electronMock.ipcRenderer.send).toHaveBeenCalledWith(channel, ...sent);
    });

    test('a listener is added and removed with the same function the window passed', () => {
        const listener = vi.fn();
        method({ namespace: 'common', name: 'onUserStateChanged' })(listener);
        method({ namespace: 'common', name: 'removeOnUserStateChanged' })(listener);

        expect(electronMock.ipcRenderer.on).toHaveBeenCalledWith('user-state-changed', listener);
        expect(electronMock.ipcRenderer.removeListener).toHaveBeenCalledWith('user-state-changed', listener);
    });

    test('an update listener gets the update info without the IPC event', () => {
        const listener = vi.fn();
        method({ namespace: 'settingsView', name: 'onUpdateAvailable' })(listener);
        const registered: unknown = electronMock.ipcRenderer.on.mock.calls.find(([channel]) => channel === 'app:update-available')?.[1];
        if (typeof registered !== 'function') throw new Error('no app:update-available listener');

        registered({}, { version: '1.8.0', releaseDate: '2026-12-01' });

        expect(listener).toHaveBeenCalledWith({ version: '1.8.0', releaseDate: '2026-12-01' });
    });

    test('removeUpdateListeners clears the four update channels', () => {
        method({ namespace: 'settingsView', name: 'removeUpdateListeners' })();

        for (const channel of ['app:update-available', 'app:update-downloaded', 'app:update-not-available', 'app:update-error']) {
            expect(electronMock.ipcRenderer.removeAllListeners).toHaveBeenCalledWith(channel);
        }
    });
});
