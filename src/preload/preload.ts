import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { readApiBaseUrlArgument } from '../shared/preloadArguments';
// Types only: the sandboxed preload cannot load zod, and main parses every payload anyway.
import type {
    EventArgs,
    EventChannel,
    InvokeArgs,
    InvokeChannel,
    InvokeResult,
    ListenButtonText,
    RecoveryAction,
    SendArgs,
    SendChannel,
} from '../shared/ipc';

// Each wrapper takes its channel's arguments and result from the IPC list, so a renamed or
// reshaped channel fails type-check here.
function invoke<C extends InvokeChannel>({ channel, args }: { channel: C; args: InvokeArgs[C] }): Promise<InvokeResult[C]> {
    return ipcRenderer.invoke(channel, ...args);
}

function send<C extends SendChannel>({ channel, args }: { channel: C; args: SendArgs[C] }): void {
    ipcRenderer.send(channel, ...args);
}

type Listener<C extends EventChannel> = (event: IpcRendererEvent, ...args: EventArgs[C]) => void;

// The window's own function is registered, so the same function removes it again.
function listen<C extends EventChannel>({ channel, listener }: { channel: C; listener: Listener<C> }): void {
    ipcRenderer.on(channel, listener);
}

function unlisten<C extends EventChannel>({ channel, listener }: { channel: C; listener: Listener<C> }): void {
    ipcRenderer.removeListener(channel, listener);
}

function unlistenAll(channel: EventChannel): void {
    ipcRenderer.removeAllListeners(channel);
}

// The update listeners get the payload without the IPC event.
function listenToPayload<C extends 'app:update-available' | 'app:update-downloaded' | 'app:update-not-available' | 'app:update-error'>({
    channel,
    callback,
}: {
    channel: C;
    callback: (...args: EventArgs[C]) => void;
}): void {
    ipcRenderer.on(channel, (_event: IpcRendererEvent, ...args: EventArgs[C]) => callback(...args));
}

// Two windows call each of these under the same name.
const adjustWindowHeight = (winName: string, height: number) => invoke({ channel: 'adjust-window-height', args: [{ winName, height }] });
const handleRecoveryAction = (action: RecoveryAction, sessionId: string) =>
    invoke({ channel: 'listen:handleRecoveryAction', args: [action, sessionId] });

const api = {
    // Platform information for renderer processes
    platform: {
        isLinux: process.platform === 'linux',
        isMacOS: process.platform === 'darwin',
        isWindows: process.platform === 'win32',
        platform: process.platform,
    },

    // Main's parsed API_BASE_URL, passed in the window arguments (src/shared/preloadArguments.ts)
    env: {
        API_BASE_URL: readApiBaseUrlArgument(process.argv) ?? '',
    },

    // Common utilities used across multiple components
    common: {
        // User & Auth
        getCurrentUser: () => invoke({ channel: 'get-current-user', args: [] }),
        startWebappAuth: () => invoke({ channel: 'start-webapp-auth', args: [] }),
        resetAuthState: () => invoke({ channel: 'reset-auth-state', args: [] }),

        // App Control
        quitApplication: () => invoke({ channel: 'quit-application', args: [] }),
        openExternal: (url: string) => invoke({ channel: 'open-external', args: [url] }),

        // User state listener (used by multiple components)
        onUserStateChanged: (callback: Listener<'user-state-changed'>) => listen({ channel: 'user-state-changed', listener: callback }),
        removeOnUserStateChanged: (callback: Listener<'user-state-changed'>) => unlisten({ channel: 'user-state-changed', listener: callback }),
    },

    // src/renderer/app/HeaderController.js
    headerController: {
        // State Management
        sendHeaderStateChanged: (state: string) => send({ channel: 'header-state-changed', args: [state] }),
        reInitializeModelState: () => invoke({ channel: 'model:re-initialize-state', args: [] }),

        // Window Management
        resizeHeaderWindow: (dimensions: { width: number; height: number }) => invoke({ channel: 'resize-header-window', args: [dimensions] }),

        // Permissions
        checkSystemPermissions: () => invoke({ channel: 'check-system-permissions', args: [] }),

        // Listeners
        onUserStateChanged: (callback: Listener<'user-state-changed'>) => listen({ channel: 'user-state-changed', listener: callback }),
        removeOnUserStateChanged: (callback: Listener<'user-state-changed'>) => unlisten({ channel: 'user-state-changed', listener: callback }),
        onAuthFailed: (callback: Listener<'auth-failed'>) => listen({ channel: 'auth-failed', listener: callback }),
        removeOnAuthFailed: (callback: Listener<'auth-failed'>) => unlisten({ channel: 'auth-failed', listener: callback }),
        onAuthStarted: (callback: Listener<'auth-started'>) => listen({ channel: 'auth-started', listener: callback }),
        removeOnAuthStarted: (callback: Listener<'auth-started'>) => unlisten({ channel: 'auth-started', listener: callback }),
        sendAuthStarted: () => send({ channel: 'auth-started', args: [] }),

        // Force show onboarding (permission header) commands from main
        onForceShowPermission: (callback: Listener<'header:force-show-permission'>) =>
            listen({ channel: 'header:force-show-permission', listener: callback }),
        removeOnForceShowPermission: (callback: Listener<'header:force-show-permission'>) =>
            unlisten({ channel: 'header:force-show-permission', listener: callback }),
    },

    // src/renderer/app/MainHeader.js
    mainHeader: {
        // Window Management
        getHeaderPosition: () => invoke({ channel: 'get-header-position', args: [] }),
        moveHeaderTo: (x: number, y: number) => invoke({ channel: 'move-header-to', args: [x, y] }),
        sendHeaderAnimationFinished: (state: 'hidden' | 'visible') => send({ channel: 'header-animation-finished', args: [state] }),

        // Settings Window Management
        cancelHideSettingsWindow: () => send({ channel: 'cancel-hide-settings-window', args: [] }),
        showSettingsWindow: () => send({ channel: 'show-settings-window', args: [] }),
        hideSettingsWindow: () => send({ channel: 'hide-settings-window', args: [] }),

        sendListenButtonClick: (listenButtonText: ListenButtonText) => invoke({ channel: 'listen:changeSession', args: [listenButtonText] }),
        sendAskButtonClick: () => invoke({ channel: 'ask:toggleAskButton', args: [] }),
        sendToggleAllWindowsVisibility: () => invoke({ channel: 'shortcut:toggleAllWindowsVisibility', args: [] }),
        getCurrentShortcuts: () => invoke({ channel: 'settings:getCurrentShortcuts', args: [] }),

        // Listeners
        onListenChangeSessionResult: (callback: Listener<'listen:changeSessionResult'>) =>
            listen({ channel: 'listen:changeSessionResult', listener: callback }),
        removeOnListenChangeSessionResult: (callback: Listener<'listen:changeSessionResult'>) =>
            unlisten({ channel: 'listen:changeSessionResult', listener: callback }),

        // Plan tooltip window
        showPlanWindow: (visible: boolean) => send({ channel: 'window:showPlanWindow', args: [{ visible }] }),

        // Listen window visibility
        setListenWindowVisibility: (visible: boolean) => invoke({ channel: 'window:set-visibility', args: [{ name: 'listen', visible }] }),
        isListenWindowVisible: () => invoke({ channel: 'window:is-visible', args: ['listen'] }),
        onListenWindowVisibilityChanged: (callback: Listener<'listen-window-visibility'>) =>
            listen({ channel: 'listen-window-visibility', listener: callback }),
        removeOnListenWindowVisibilityChanged: (callback: Listener<'listen-window-visibility'>) =>
            unlisten({ channel: 'listen-window-visibility', listener: callback }),

        // Recovery actions
        handleRecoveryAction,
        onStrandedSessionDetected: (callback: Listener<'listen:stranded-session-detected'>) =>
            listen({ channel: 'listen:stranded-session-detected', listener: callback }),
        removeOnStrandedSessionDetected: (callback: Listener<'listen:stranded-session-detected'>) =>
            unlisten({ channel: 'listen:stranded-session-detected', listener: callback }),
        getStrandedSession: () => invoke({ channel: 'listen:getStrandedSession', args: [] }),
        showRecoveryToast: (...args: InvokeArgs['recovery-toast:show']) => invoke({ channel: 'recovery-toast:show', args }),

        // STT quota exceeded
        onSttQuotaExceeded: (callback: Listener<'stt:quotaExceeded'>) => listen({ channel: 'stt:quotaExceeded', listener: callback }),
        removeOnSttQuotaExceeded: (callback: Listener<'stt:quotaExceeded'>) => unlisten({ channel: 'stt:quotaExceeded', listener: callback }),
    },

    // src/renderer/app/RecoveryToast.js
    recoveryToast: {
        onShow: (callback: Listener<'recovery-toast:show'>) => listen({ channel: 'recovery-toast:show', listener: callback }),
        removeOnShow: () => unlistenAll('recovery-toast:show'),
        onHide: (callback: Listener<'recovery-toast:hide'>) => listen({ channel: 'recovery-toast:hide', listener: callback }),
        removeOnHide: () => unlistenAll('recovery-toast:hide'),
        handleRecoveryAction,
    },

    // Quota/usage updates broadcast from main process
    quota: {
        onUpdate: (callback: Listener<'quota:update'>) => listen({ channel: 'quota:update', listener: callback }),
        removeOnUpdate: (callback: Listener<'quota:update'>) => unlisten({ channel: 'quota:update', listener: callback }),
        removeAll: () => unlistenAll('quota:update'),
    },

    // src/renderer/app/PermissionHeader.js
    permissionHeader: {
        // Permission Management
        checkSystemPermissions: () => invoke({ channel: 'check-system-permissions', args: [] }),
        requestMicrophonePermission: () => invoke({ channel: 'request-microphone-permission', args: [] }),
        openSystemPreferences: (preference: string) => invoke({ channel: 'open-system-preferences', args: [preference] }),
    },

    // src/renderer/app/WhisperApp.js
    whisperApp: {
        // Listeners
        onClickThroughToggled: (callback: Listener<'click-through-toggled'>) => listen({ channel: 'click-through-toggled', listener: callback }),
        removeOnClickThroughToggled: (callback: Listener<'click-through-toggled'>) =>
            unlisten({ channel: 'click-through-toggled', listener: callback }),
        removeAllClickThroughListeners: () => unlistenAll('click-through-toggled'),
    },

    // src/renderer/ask/AskView.js
    askView: {
        // Window Management
        closeAskWindow: () => invoke({ channel: 'ask:closeAskWindow', args: [] }),
        adjustWindowHeight,

        // Message Handling
        sendMessage: (text: string, useScreenCapture = true, webSearchEnabled = false) =>
            invoke({ channel: 'ask:sendQuestionFromAsk', args: [text, useScreenCapture, webSearchEnabled] }),
        setUseScreenCapture: (value: boolean) => invoke({ channel: 'ask:setUseScreenCapture', args: [value] }),
        interruptStream: () => invoke({ channel: 'ask:interruptStream', args: [] }),

        // Screenshot window management
        showScreenshotWindow: (base64Data: string, position?: { x: number; y: number }) =>
            send({ channel: 'show-screenshot-window', args: [{ base64Data, position }] }),
        hideScreenshotWindow: () => send({ channel: 'hide-screenshot-window', args: [] }),

        // Listeners
        onAskStateUpdate: (callback: Listener<'ask:stateUpdate'>) => listen({ channel: 'ask:stateUpdate', listener: callback }),
        removeOnAskStateUpdate: (callback: Listener<'ask:stateUpdate'>) => unlisten({ channel: 'ask:stateUpdate', listener: callback }),

        onAskStreamError: (callback: Listener<'ask-response-stream-error'>) => listen({ channel: 'ask-response-stream-error', listener: callback }),
        removeOnAskStreamError: (callback: Listener<'ask-response-stream-error'>) =>
            unlisten({ channel: 'ask-response-stream-error', listener: callback }),

        onShowTextInput: (callback: Listener<'ask:showTextInput'>) => listen({ channel: 'ask:showTextInput', listener: callback }),
        removeOnShowTextInput: (callback: Listener<'ask:showTextInput'>) => unlisten({ channel: 'ask:showTextInput', listener: callback }),
    },

    // src/renderer/listen/ListenView.js
    listenView: {
        // Window Management
        adjustWindowHeight,
        onForceHeightRecalc: (callback: Listener<'force-height-recalc'>) => listen({ channel: 'force-height-recalc', listener: callback }),

        // Analysis Preset Management
        listAnalysisPresets: () => invoke({ channel: 'listen:listAnalysisPresets', args: [] }),
        getAnalysisPreset: () => invoke({ channel: 'listen:getAnalysisPreset', args: [] }),
        setAnalysisPreset: (payload: InvokeArgs['listen:setAnalysisPreset'][0]) => invoke({ channel: 'listen:setAnalysisPreset', args: [payload] }),

        // Listeners
        onSessionStateChanged: (callback: Listener<'session-state-changed'>) => listen({ channel: 'session-state-changed', listener: callback }),
        removeOnSessionStateChanged: (callback: Listener<'session-state-changed'>) =>
            unlisten({ channel: 'session-state-changed', listener: callback }),
        onSyncConversationHistory: (callback: Listener<'listen:sync-conversation-history'>) =>
            listen({ channel: 'listen:sync-conversation-history', listener: callback }),
        removeOnSyncConversationHistory: (callback: Listener<'listen:sync-conversation-history'>) =>
            unlisten({ channel: 'listen:sync-conversation-history', listener: callback }),
        onPresetsUpdated: (callback: Listener<'presets-updated'>) => listen({ channel: 'presets-updated', listener: callback }),
        removeOnPresetsUpdated: (callback: Listener<'presets-updated'>) => unlisten({ channel: 'presets-updated', listener: callback }),
    },

    // src/renderer/listen/stt/SttView.js
    sttView: {
        // Listeners
        onSttUpdate: (callback: Listener<'stt-update'>) => listen({ channel: 'stt-update', listener: callback }),
        removeOnSttUpdate: (callback: Listener<'stt-update'>) => unlisten({ channel: 'stt-update', listener: callback }),

        // STT quota exceeded
        onSttQuotaExceeded: (callback: Listener<'stt:quotaExceeded'>) => listen({ channel: 'stt:quotaExceeded', listener: callback }),
        removeOnSttQuotaExceeded: (callback: Listener<'stt:quotaExceeded'>) => unlisten({ channel: 'stt:quotaExceeded', listener: callback }),
    },

    // src/renderer/listen/summary/SummaryView.js
    summaryView: {
        // Message Handling
        sendQuestionFromSummary: (text: string) => invoke({ channel: 'ask:sendQuestionFromSummary', args: [text] }),

        // Listeners
        onSummaryUpdate: (callback: Listener<'summary-update'>) => listen({ channel: 'summary-update', listener: callback }),
        removeOnSummaryUpdate: (callback: Listener<'summary-update'>) => unlisten({ channel: 'summary-update', listener: callback }),
        removeAllSummaryUpdateListeners: () => unlistenAll('summary-update'),
    },

    // src/renderer/settings/SettingsView.js
    settingsView: {
        // User & Auth
        getCurrentUser: () => invoke({ channel: 'get-current-user', args: [] }),
        openPersonalizePage: () => invoke({ channel: 'open-personalize-page', args: [] }),
        startWebappAuth: () => invoke({ channel: 'start-webapp-auth', args: [] }),
        signOut: () => invoke({ channel: 'sign-out', args: [] }),

        openDbPath: () => invoke({ channel: 'settings:open-db-path', args: [] }),

        // Auto Update
        getAutoUpdate: () => invoke({ channel: 'settings:get-auto-update', args: [] }),
        setAutoUpdate: (isEnabled: boolean) => invoke({ channel: 'settings:set-auto-update', args: [isEnabled] }),
        getAppVersion: () => invoke({ channel: 'settings:get-app-version', args: [] }),
        checkForUpdates: () => invoke({ channel: 'app:check-for-updates', args: [] }),
        installUpdate: () => invoke({ channel: 'app:install-update', args: [] }),
        onUpdateAvailable: (callback: (...args: EventArgs['app:update-available']) => void) =>
            listenToPayload({ channel: 'app:update-available', callback }),
        onUpdateDownloaded: (callback: (...args: EventArgs['app:update-downloaded']) => void) =>
            listenToPayload({ channel: 'app:update-downloaded', callback }),
        onUpdateNotAvailable: (callback: (...args: EventArgs['app:update-not-available']) => void) =>
            listenToPayload({ channel: 'app:update-not-available', callback }),
        onUpdateError: (callback: (...args: EventArgs['app:update-error']) => void) => listenToPayload({ channel: 'app:update-error', callback }),
        removeUpdateListeners: () => {
            unlistenAll('app:update-available');
            unlistenAll('app:update-downloaded');
            unlistenAll('app:update-not-available');
            unlistenAll('app:update-error');
        },

        // Content Protection
        getContentProtectionStatus: () => invoke({ channel: 'get-content-protection-status', args: [] }),
        toggleContentProtection: () => invoke({ channel: 'toggle-content-protection', args: [] }),

        // Shortcuts
        getCurrentShortcuts: () => invoke({ channel: 'settings:getCurrentShortcuts', args: [] }),

        // Window Management
        moveWindowStep: (direction: InvokeArgs['move-window-step'][0]) => invoke({ channel: 'move-window-step', args: [direction] }),
        getDisplays: () => invoke({ channel: 'get-displays', args: [] }),
        moveToDisplay: (displayId: number) => invoke({ channel: 'move-to-display', args: [displayId] }),
        cancelHideSettingsWindow: () => send({ channel: 'cancel-hide-settings-window', args: [] }),
        hideSettingsWindow: () => send({ channel: 'hide-settings-window', args: [] }),

        // App Control
        quitApplication: () => invoke({ channel: 'quit-application', args: [] }),

        // Onboarding
        showPermissionOnboarding: () => invoke({ channel: 'header:force-show-permission', args: [] }),

        // Listeners
        onUserStateChanged: (callback: Listener<'user-state-changed'>) => listen({ channel: 'user-state-changed', listener: callback }),
        removeOnUserStateChanged: (callback: Listener<'user-state-changed'>) => unlisten({ channel: 'user-state-changed', listener: callback }),
        onSettingsUpdated: (callback: Listener<'settings-updated'>) => listen({ channel: 'settings-updated', listener: callback }),
        removeOnSettingsUpdated: (callback: Listener<'settings-updated'>) => unlisten({ channel: 'settings-updated', listener: callback }),
        onPresetsUpdated: (callback: Listener<'presets-updated'>) => listen({ channel: 'presets-updated', listener: callback }),
        removeOnPresetsUpdated: (callback: Listener<'presets-updated'>) => unlisten({ channel: 'presets-updated', listener: callback }),
    },

    // src/renderer/screenshot/ScreenshotView.js
    screenshotView: {
        // Screenshot window management
        cancelHideScreenshotWindow: () => send({ channel: 'cancel-hide-screenshot-window', args: [] }),
        hideScreenshotWindow: () => send({ channel: 'hide-screenshot-window', args: [] }),

        // Listeners
        onScreenshotData: (callback: Listener<'screenshot:data'>) => listen({ channel: 'screenshot:data', listener: callback }),
        removeOnScreenshotData: (callback: Listener<'screenshot:data'>) => unlisten({ channel: 'screenshot:data', listener: callback }),
    },

    // src/renderer/plan/PlanView.js
    planView: {
        // Plan window management
        cancelHidePlanWindow: () => send({ channel: 'cancel-hide-plan-window', args: [] }),
        hidePlanWindow: () => send({ channel: 'hide-plan-window', args: [] }),
    },

    // src/renderer/listen/audioCore/listenCapture.js
    listenCapture: {
        // Audio Management
        sendMicAudioContent: (data: InvokeArgs['listen:sendMicAudio'][0]) => invoke({ channel: 'listen:sendMicAudio', args: [data] }),
        sendSystemAudioContent: (data: InvokeArgs['listen:sendSystemAudio'][0]) => invoke({ channel: 'listen:sendSystemAudio', args: [data] }),
        startMacosSystemAudio: () => invoke({ channel: 'listen:startMacosSystemAudio', args: [] }),
        stopMacosSystemAudio: () => invoke({ channel: 'listen:stopMacosSystemAudio', args: [] }),

        // Session Management
        isSessionActive: () => invoke({ channel: 'listen:isSessionActive', args: [] }),

        // Listeners
        onSystemAudioData: (callback: Listener<'system-audio-data'>) => listen({ channel: 'system-audio-data', listener: callback }),
        removeOnSystemAudioData: (callback: Listener<'system-audio-data'>) => unlisten({ channel: 'system-audio-data', listener: callback }),
    },

    // src/renderer/listen/audioCore/renderer.js
    renderer: {
        // Listeners
        onChangeListenCaptureState: (callback: Listener<'change-listen-capture-state'>) =>
            listen({ channel: 'change-listen-capture-state', listener: callback }),
        removeOnChangeListenCaptureState: (callback: Listener<'change-listen-capture-state'>) =>
            unlisten({ channel: 'change-listen-capture-state', listener: callback }),
    },
};

// The shape the Lit windows get; the React UI in step 6 types `window.api` from it.
export type WhisperApi = typeof api;

contextBridge.exposeInMainWorld('api', api);
