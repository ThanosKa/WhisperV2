// src/preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    // Platform information for renderer processes
    platform: {
        isLinux: process.platform === 'linux',
        isMacOS: process.platform === 'darwin',
        isWindows: process.platform === 'win32',
        platform: process.platform,
    },

    // Environment variables exposed to renderer
    env: {
        API_BASE_URL: process.env.API_BASE_URL || 'https://www.app-whisper.com',
    },

    // Common utilities used across multiple components
    common: {
        // User & Auth
        getCurrentUser: () => ipcRenderer.invoke('get-current-user'),
        startWebappAuth: () => ipcRenderer.invoke('start-webapp-auth'),
        // firebaseLogout: () => ipcRenderer.invoke('firebase-logout'),  // Removed: Firebase deprecated

        // App Control
        quitApplication: () => ipcRenderer.invoke('quit-application'),
        openExternal: url => ipcRenderer.invoke('open-external', url),

        // User state listener (used by multiple components)
        onUserStateChanged: callback => ipcRenderer.on('user-state-changed', callback),
        removeOnUserStateChanged: callback => ipcRenderer.removeListener('user-state-changed', callback),
    },

    // UI Component specific namespaces

    // src/ui/app/HeaderController.js
    headerController: {
        // State Management
        sendHeaderStateChanged: state => ipcRenderer.send('header-state-changed', state),
        reInitializeModelState: () => ipcRenderer.invoke('model:re-initialize-state'),

        // Window Management
        resizeHeaderWindow: dimensions => ipcRenderer.invoke('resize-header-window', dimensions),

        // Permissions
        checkSystemPermissions: () => ipcRenderer.invoke('check-system-permissions'),
        checkPermissionsCompleted: () => ipcRenderer.invoke('check-permissions-completed'),

        // Listeners
        onUserStateChanged: callback => ipcRenderer.on('user-state-changed', callback),
        removeOnUserStateChanged: callback => ipcRenderer.removeListener('user-state-changed', callback),
        onAuthFailed: callback => ipcRenderer.on('auth-failed', callback),
        removeOnAuthFailed: callback => ipcRenderer.removeListener('auth-failed', callback),
        // Removed ApiKey header force-show in SaaS mode

        // Force show onboarding (permission header) commands from main
        onForceShowPermission: callback => ipcRenderer.on('header:force-show-permission', callback),
        removeOnForceShowPermission: callback => ipcRenderer.removeListener('header:force-show-permission', callback),
    },

    // src/ui/app/MainHeader.js
    mainHeader: {
        // Window Management
        getHeaderPosition: () => ipcRenderer.invoke('get-header-position'),
        moveHeaderTo: (x, y) => ipcRenderer.invoke('move-header-to', x, y),
        sendHeaderAnimationFinished: state => ipcRenderer.send('header-animation-finished', state),

        // Settings Window Management
        cancelHideSettingsWindow: () => ipcRenderer.send('cancel-hide-settings-window'),
        showSettingsWindow: () => ipcRenderer.send('show-settings-window'),
        hideSettingsWindow: () => ipcRenderer.send('hide-settings-window'),

        // Generic invoke (for dynamic channel names)
        // invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
        sendListenButtonClick: listenButtonText => ipcRenderer.invoke('listen:changeSession', listenButtonText),
        sendAskButtonClick: () => ipcRenderer.invoke('ask:toggleAskButton'),
        sendToggleAllWindowsVisibility: () => ipcRenderer.invoke('shortcut:toggleAllWindowsVisibility'),
        getCurrentShortcuts: () => ipcRenderer.invoke('settings:getCurrentShortcuts'),

        // Listeners
        onListenChangeSessionResult: callback => ipcRenderer.on('listen:changeSessionResult', callback),
        removeOnListenChangeSessionResult: callback => ipcRenderer.removeListener('listen:changeSessionResult', callback),

        // Plan tooltip window
        showPlanWindow: visible => ipcRenderer.send('window:showPlanWindow', { visible }),

        // Listen window visibility
        setListenWindowVisibility: visible => ipcRenderer.invoke('window:set-visibility', { name: 'listen', visible }),
        isListenWindowVisible: () => ipcRenderer.invoke('window:is-visible', 'listen'),
    },

    // Quota/usage updates broadcast from main process
    quota: {
        onUpdate: callback => ipcRenderer.on('quota:update', callback),
        removeOnUpdate: callback => ipcRenderer.removeListener('quota:update', callback),
        removeAll: () => ipcRenderer.removeAllListeners('quota:update'),
    },

    // src/ui/app/PermissionHeader.js
    permissionHeader: {
        // Permission Management
        checkSystemPermissions: () => ipcRenderer.invoke('check-system-permissions'),
        requestMicrophonePermission: () => ipcRenderer.invoke('request-microphone-permission'),
        openSystemPreferences: preference => ipcRenderer.invoke('open-system-preferences', preference),
        markKeychainCompleted: () => ipcRenderer.invoke('mark-keychain-completed'),
        checkKeychainCompleted: uid => ipcRenderer.invoke('check-keychain-completed', uid),
        initializeEncryptionKey: () => ipcRenderer.invoke('initialize-encryption-key'), // New for keychain
    },

    // src/ui/app/PickleGlassApp.js
    pickleGlassApp: {
        // Listeners
        onClickThroughToggled: callback => ipcRenderer.on('click-through-toggled', callback),
        removeOnClickThroughToggled: callback => ipcRenderer.removeListener('click-through-toggled', callback),
        removeAllClickThroughListeners: () => ipcRenderer.removeAllListeners('click-through-toggled'),
    },

    // src/ui/ask/AskView.js
    askView: {
        // Window Management
        closeAskWindow: () => ipcRenderer.invoke('ask:closeAskWindow'),
        adjustWindowHeight: (winName, height) => ipcRenderer.invoke('adjust-window-height', { winName, height }),

        // Message Handling
        sendMessage: text => ipcRenderer.invoke('ask:sendQuestionFromAsk', text),
        interruptStream: () => ipcRenderer.invoke('ask:interruptStream'),

        // Listeners
        onAskStateUpdate: callback => ipcRenderer.on('ask:stateUpdate', callback),
        removeOnAskStateUpdate: callback => ipcRenderer.removeListener('ask:stateUpdate', callback),

        onAskStreamError: callback => ipcRenderer.on('ask-response-stream-error', callback),
        removeOnAskStreamError: callback => ipcRenderer.removeListener('ask-response-stream-error', callback),

        // Listeners
        onShowTextInput: callback => ipcRenderer.on('ask:showTextInput', callback),
        removeOnShowTextInput: callback => ipcRenderer.removeListener('ask:showTextInput', callback),
    },

    // src/ui/listen/ListenView.js
    listenView: {
        // Window Management
        adjustWindowHeight: (winName, height) => ipcRenderer.invoke('adjust-window-height', { winName, height }),

        // Analysis Preset Management (Phase 1)
        listAnalysisPresets: () => ipcRenderer.invoke('listen:listAnalysisPresets'),
        getAnalysisPreset: () => ipcRenderer.invoke('listen:getAnalysisPreset'),
        setAnalysisPreset: payload => ipcRenderer.invoke('listen:setAnalysisPreset', payload),

        // Listeners
        onSessionStateChanged: callback => ipcRenderer.on('session-state-changed', callback),
        removeOnSessionStateChanged: callback => ipcRenderer.removeListener('session-state-changed', callback),
        onSyncConversationHistory: callback => ipcRenderer.on('listen:sync-conversation-history', callback),
        removeOnSyncConversationHistory: callback => ipcRenderer.removeListener('listen:sync-conversation-history', callback),
        onPresetsUpdated: callback => ipcRenderer.on('presets-updated', callback),
        removeOnPresetsUpdated: callback => ipcRenderer.removeListener('presets-updated', callback),
    },

    // src/ui/listen/stt/SttView.js
    sttView: {
        // Listeners
        onSttUpdate: callback => ipcRenderer.on('stt-update', callback),
        removeOnSttUpdate: callback => ipcRenderer.removeListener('stt-update', callback),
    },

    // src/ui/listen/summary/SummaryView.js
    summaryView: {
        // Message Handling
        sendQuestionFromSummary: text => ipcRenderer.invoke('ask:sendQuestionFromSummary', text),

        // Listeners
        onSummaryUpdate: callback => ipcRenderer.on('summary-update', callback),
        removeOnSummaryUpdate: callback => ipcRenderer.removeListener('summary-update', callback),
        removeAllSummaryUpdateListeners: () => ipcRenderer.removeAllListeners('summary-update'),
    },

    // src/ui/settings/SettingsView.js
    settingsView: {
        // User & Auth
        getCurrentUser: () => ipcRenderer.invoke('get-current-user'),
        openPersonalizePage: () => ipcRenderer.invoke('open-personalize-page'),
        // firebaseLogout: () => ipcRenderer.invoke('firebase-logout'),  // Removed: Firebase deprecated
        startWebappAuth: () => ipcRenderer.invoke('start-webapp-auth'),
        signOut: () => ipcRenderer.invoke('sign-out'), // New: For logout without webapp redirect

        // Model & Provider Management
        // Removed provider-model APIs (server-only)

        // Settings Management
        getPresets: () => ipcRenderer.invoke('settings:getPresets'),

        // New method for opening DB path
        openDbPath: () => ipcRenderer.invoke('settings:open-db-path'),

        // Auto Update
        getAutoUpdate: () => ipcRenderer.invoke('settings:get-auto-update'),
        setAutoUpdate: isEnabled => ipcRenderer.invoke('settings:set-auto-update', isEnabled),

        // Content Protection
        getContentProtectionStatus: () => ipcRenderer.invoke('get-content-protection-status'),
        toggleContentProtection: () => ipcRenderer.invoke('toggle-content-protection'),

        // Shortcuts
        getCurrentShortcuts: () => ipcRenderer.invoke('settings:getCurrentShortcuts'),
        openShortcutSettingsWindow: () => ipcRenderer.invoke('open-shortcut-settings-window'),

        // Window Management
        moveWindowStep: direction => ipcRenderer.invoke('move-window-step', direction),
        getDisplays: () => ipcRenderer.invoke('get-displays'),
        moveToDisplay: displayId => ipcRenderer.invoke('move-to-display', displayId),
        cancelHideSettingsWindow: () => ipcRenderer.send('cancel-hide-settings-window'),
        hideSettingsWindow: () => ipcRenderer.send('hide-settings-window'),

        // App Control
        quitApplication: () => ipcRenderer.invoke('quit-application'),

        // Onboarding
        showPermissionOnboarding: () => ipcRenderer.invoke('header:force-show-permission'),

        // Listeners
        onUserStateChanged: callback => ipcRenderer.on('user-state-changed', callback),
        removeOnUserStateChanged: callback => ipcRenderer.removeListener('user-state-changed', callback),
        onSettingsUpdated: callback => ipcRenderer.on('settings-updated', callback),
        removeOnSettingsUpdated: callback => ipcRenderer.removeListener('settings-updated', callback),
        onPresetsUpdated: callback => ipcRenderer.on('presets-updated', callback),
        removeOnPresetsUpdated: callback => ipcRenderer.removeListener('presets-updated', callback),
    },

    // src/ui/app/content.html inline scripts
    content: {
        // Listeners
        onSettingsWindowHideAnimation: callback => ipcRenderer.on('settings-window-hide-animation', callback),
        removeOnSettingsWindowHideAnimation: callback => ipcRenderer.removeListener('settings-window-hide-animation', callback),
    },

    // src/ui/listen/audioCore/listenCapture.js
    listenCapture: {
        // Audio Management
        sendMicAudioContent: data => ipcRenderer.invoke('listen:sendMicAudio', data),
        sendSystemAudioContent: data => ipcRenderer.invoke('listen:sendSystemAudio', data),
        startMacosSystemAudio: () => ipcRenderer.invoke('listen:startMacosSystemAudio'),
        stopMacosSystemAudio: () => ipcRenderer.invoke('listen:stopMacosSystemAudio'),

        // Session Management
        isSessionActive: () => ipcRenderer.invoke('listen:isSessionActive'),

        // Listeners
        onSystemAudioData: callback => ipcRenderer.on('system-audio-data', callback),
        removeOnSystemAudioData: callback => ipcRenderer.removeListener('system-audio-data', callback),
    },

    // src/ui/listen/audioCore/renderer.js
    renderer: {
        // Listeners
        onChangeListenCaptureState: callback => ipcRenderer.on('change-listen-capture-state', callback),
        removeOnChangeListenCaptureState: callback => ipcRenderer.removeListener('change-listen-capture-state', callback),
    },
});
