import { z } from 'zod';
import type askService from '../main/features/ask/askService';
import type { AskState } from '../main/features/ask/askService';
import type authService from '../main/features/common/services/authService';
import type { PermissionResult, SystemPermissions } from '../main/features/common/services/permissionService';
import type listenService from '../main/features/listen/listenService';
import type { StrandedSessionInfo } from '../main/features/listen/listenService';
import type * as settingsService from '../main/features/settings/settingsService';
import type shortcutsService from '../main/features/shortcuts/shortcutsService';
import type * as windowManager from '../main/window/windowManager';

// Every IPC channel between main and the Lit windows, by kind:
// - `invoke`: the renderer calls `ipcRenderer.invoke` and awaits the handler's result;
// - `send`: the renderer calls `ipcRenderer.send`, main runs a listener, nothing comes back;
// - `event`: main sends it with `sendEvent` (src/main/ipc/sendEvent.ts) and the renderer listens.
// `args` is the positional argument list as the preload sends it. Main parses it with this schema
// before a handler runs (src/main/ipc/typedIpc.ts); preload's `window.api` is typed from it.
// Each schema accepts what today's UI sends (tests/unit/ipc/ipcChannels.test.ts).
//
// Preload imports this file for its types only: the sandboxed preload cannot load zod.

// A handler's result is main's own value, so it is typed, never parsed.
const result = <T>() => z.custom<T>();
type Returns<F extends (...args: never[]) => unknown> = Awaited<ReturnType<F>>;
// A result on the `success` literal: the success branch carries its own fields, a failure its error.
export type Outcome<Success extends object = Record<never, never>> = ({ success: true } & Success) | { success: false; error: string };

const none = z.tuple([]);
// The header's Listen button texts (MainHeader._getListenButtonText), sent on `listen:changeSession`
export const ListenButtonTextSchema = z.enum(['Listen', 'Stop', 'Resume', 'Done']);
export type ListenButtonText = z.infer<typeof ListenButtonTextSchema>;
// What the recovery toast asks main to do with a stranded session
export const RecoveryActionSchema = z.enum(['resume', 'finalize']);
export type RecoveryAction = z.infer<typeof RecoveryActionSchema>;
const audioContent = z.object({ data: z.string(), mimeType: z.string() });
const rectangle = z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() });
const strandedSessionInfo = z.looseObject({ id: z.string(), title: z.string(), started_at: z.number().nullable() });

const invoke = {
    // Settings and app
    'settings:get-auto-update': { args: none, result: result<Returns<typeof settingsService.getAutoUpdateSetting>>() },
    'settings:set-auto-update': { args: z.tuple([z.boolean()]), result: result<Returns<typeof settingsService.setAutoUpdateSetting>>() },
    'settings:get-app-version': { args: none, result: result<string>() },
    'settings:open-db-path': { args: none, result: result<Outcome>() },
    'settings:getCurrentShortcuts': { args: none, result: result<Returns<typeof shortcutsService.loadKeybinds>>() },
    'shortcut:toggleAllWindowsVisibility': { args: none, result: result<Returns<typeof shortcutsService.toggleAllWindowsVisibility>>() },
    'quit-application': { args: none, result: result<void>() },
    'app:check-for-updates': { args: none, result: result<Outcome>() },
    'app:install-update': { args: none, result: result<Outcome>() },
    'model:re-initialize-state': { args: none, result: result<{ success: true }>() },

    // Permissions
    'check-system-permissions': { args: none, result: result<SystemPermissions>() },
    'request-microphone-permission': { args: none, result: result<PermissionResult>() },
    'open-system-preferences': { args: z.tuple([z.string()]), result: result<PermissionResult>() },

    // User and auth
    'get-current-user': { args: none, result: result<ReturnType<typeof authService.getCurrentUser>>() },
    'start-webapp-auth': { args: none, result: result<Returns<typeof authService.startWebappAuthFlow>>() },
    'reset-auth-state': { args: none, result: result<{ success: true }>() },
    'sign-out': { args: none, result: result<{ success: true }>() },

    // Ask: the question, then `useScreenCapture` and `webSearchEnabled`, which the preload defaults
    'ask:sendQuestionFromAsk': {
        args: z.tuple([z.string(), z.boolean().optional(), z.boolean().optional()]),
        result: result<Returns<typeof askService.sendMessageManual>>(),
    },
    'ask:sendQuestionFromSummary': { args: z.tuple([z.string()]), result: result<Returns<typeof askService.sendMessage>>() },
    'ask:toggleAskButton': { args: none, result: result<Returns<typeof askService.toggleAskButton>>() },
    'ask:setUseScreenCapture': { args: z.tuple([z.boolean()]), result: result<void>() },
    'ask:closeAskWindow': { args: none, result: result<Returns<typeof askService.closeAskWindow>>() },
    'ask:interruptStream': { args: none, result: result<void>() },

    // Listen
    'listen:sendMicAudio': { args: z.tuple([audioContent]), result: result<Returns<typeof listenService.handleSendMicAudioContent>>() },
    'listen:sendSystemAudio': {
        args: z.tuple([audioContent]),
        result: result<Returns<typeof listenService.sttService.sendSystemAudioContent>>(),
    },
    'listen:startMacosSystemAudio': { args: none, result: result<Returns<typeof listenService.handleStartMacosAudio>>() },
    'listen:stopMacosSystemAudio': { args: none, result: result<Returns<typeof listenService.handleStopMacosAudio>>() },
    'listen:isSessionActive': { args: none, result: result<boolean>() },
    'listen:changeSession': { args: z.tuple([ListenButtonTextSchema]), result: result<Outcome>() },
    'listen:listAnalysisPresets': { args: none, result: result<Returns<typeof settingsService.getPresets>>() },
    'listen:getAnalysisPreset': { args: none, result: result<{ presetId: string | null }>() },
    'listen:setAnalysisPreset': { args: z.tuple([z.object({ presetId: z.string().nullable() })]), result: result<Outcome>() },
    // The action, then the session id
    'listen:handleRecoveryAction': {
        args: z.tuple([RecoveryActionSchema, z.string()]),
        result: result<Returns<typeof listenService.handleRecoveryAction>>(),
    },
    'listen:getStrandedSession': { args: none, result: result<StrandedSessionInfo | null>() },

    // Windows
    'toggle-content-protection': { args: none, result: result<boolean>() },
    'get-content-protection-status': { args: none, result: result<boolean>() },
    'resize-header-window': { args: z.tuple([z.object({ width: z.number(), height: z.number() })]), result: result<void>() },
    'get-header-position': { args: none, result: result<Returns<typeof windowManager.getHeaderPosition>>() },
    'move-header-to': { args: z.tuple([z.number(), z.number()]), result: result<void>() },
    'move-window-step': { args: z.tuple([z.enum(['left', 'right', 'up', 'down'])]), result: result<void>() },
    'adjust-window-height': { args: z.tuple([z.object({ winName: z.string(), height: z.number() })]), result: result<void>() },
    'window:set-visibility': {
        args: z.tuple([z.object({ name: z.string(), visible: z.boolean() })]),
        result: result<ReturnType<typeof windowManager.setWindowVisibility>>(),
    },
    'window:is-visible': { args: z.tuple([z.string()]), result: result<boolean>() },
    'get-displays': { args: none, result: result<ReturnType<typeof windowManager.listDisplays>>() },
    'move-to-display': { args: z.tuple([z.number()]), result: result<ReturnType<typeof windowManager.moveToDisplay>>() },
    'header:force-show-permission': { args: none, result: result<ReturnType<typeof windowManager.forceShowPermissionOnboarding>>() },
    // The stranded session the header got from main, passed on to the toast as it is, and the header's bounds
    'recovery-toast:show': { args: z.tuple([strandedSessionInfo, rectangle.optional()]), result: result<{ success: true }>() },
    'open-personalize-page': { args: none, result: result<void>() },
    'open-external': { args: z.tuple([z.string()]), result: result<void>() },
};

const send = {
    'show-settings-window': { args: none },
    'hide-settings-window': { args: none },
    'cancel-hide-settings-window': { args: none },
    'show-screenshot-window': {
        args: z.tuple([z.object({ base64Data: z.string(), position: z.object({ x: z.number(), y: z.number() }).optional() })]),
    },
    'hide-screenshot-window': { args: none },
    'cancel-hide-screenshot-window': { args: none },
    'window:showPlanWindow': { args: z.tuple([z.object({ visible: z.boolean() })]) },
    'hide-plan-window': { args: none },
    'cancel-hide-plan-window': { args: none },
    'header-state-changed': { args: z.tuple([z.string()]) },
    'header-animation-finished': { args: z.tuple([z.enum(['hidden', 'visible'])]) },
    'auth-started': { args: none },
};

const updateInfo = z.object({
    version: z.string(),
    releaseDate: z.string(),
    releaseName: z.string().nullable().optional(),
});

const event = {
    // Auth and header
    'user-state-changed': { args: z.tuple([result<ReturnType<typeof authService.getCurrentUser>>()]) },
    'auth-failed': { args: z.tuple([z.object({ message: z.string() })]) },
    'auth-started': { args: none },
    'header:force-show-permission': { args: none },
    'click-through-toggled': { args: z.tuple([z.boolean()]) },

    // Listen
    // A failure may carry the status to show and an error code, or neither (listenService.handleListenRequest)
    'listen:changeSessionResult': {
        args: z.tuple([
            z.union([
                z.object({ success: z.literal(true), nextStatus: z.string() }),
                z.object({ success: z.literal(false), nextStatus: z.string().optional(), error: z.string().optional() }),
            ]),
        ]),
    },
    'listen-window-visibility': { args: z.tuple([z.boolean()]) },
    'listen:stranded-session-detected': { args: z.tuple([strandedSessionInfo]) },
    'stt:quotaExceeded': { args: z.tuple([z.object({ resetAt: z.string().nullable() })]) },
    'session-state-changed': { args: z.tuple([z.object({ isActive: z.boolean(), mode: z.string() })]) },
    // The summary's history lines in a live session; the transcript rows when a stranded session resumes
    'listen:sync-conversation-history': {
        args: z.tuple([z.union([z.array(z.string()), z.array(z.object({ speaker: z.string().nullable(), text: z.string().nullable() }))])]),
    },
    // A live utterance, or a stored transcript row (no timestamp) when a stranded session resumes
    'stt-update': {
        args: z.tuple([
            z.union([
                z.object({ speaker: z.string(), text: z.string(), isPartial: z.boolean(), isFinal: z.boolean(), timestamp: z.number() }),
                z.object({ speaker: z.string().nullable(), text: z.string().nullable(), isPartial: z.literal(false), isFinal: z.literal(true) }),
            ]),
        ]),
    },
    'summary-update': { args: z.tuple([z.looseObject({ presetId: z.string().nullable() })]) },
    'force-height-recalc': { args: none },
    'change-listen-capture-state': { args: z.tuple([z.object({ status: z.enum(['start', 'stop']) })]) },
    'system-audio-data': { args: z.tuple([z.object({ data: z.string() })]) },
    'presets-updated': { args: z.tuple([z.object({ action: z.string(), presetId: z.string(), title: z.string().optional() })]) },
    'settings-updated': { args: z.tuple([z.record(z.string(), z.unknown())]) },

    // Ask, quota and screenshot
    'ask:stateUpdate': { args: z.tuple([result<AskState>()]) },
    'ask-response-stream-error': { args: z.tuple([z.object({ error: z.string() })]) },
    // Nothing in main sends it; AskView still listens, until step 6 rewrites the UI
    'ask:showTextInput': { args: none },
    'quota:update': {
        args: z.tuple([z.object({ limit: z.number().optional(), used: z.number().optional(), remaining: z.number().optional() })]),
    },
    'screenshot:data': { args: z.tuple([z.string()]) },

    // Recovery toast
    'recovery-toast:show': { args: z.tuple([strandedSessionInfo]) },
    // Nothing in main sends it; RecoveryToast still listens, until step 6 rewrites the UI
    'recovery-toast:hide': { args: none },

    // Updates
    'app:update-available': { args: z.tuple([updateInfo.extend({ releaseUrl: z.string().optional() })]) },
    // All three are undefined in the second sender (index.ts initAutoUpdater), a kept bug for 4a-2
    'app:update-downloaded': {
        args: z.tuple([z.object({ version: z.string().optional(), releaseDate: z.string().optional(), releaseName: z.string().nullish() })]),
    },
    'app:update-not-available': { args: z.tuple([z.object({ currentVersion: z.string() })]) },
    'app:update-error': { args: z.tuple([z.object({ error: z.string() })]) },
};

export const ipcChannels = { invoke, send, event };

export type InvokeChannel = keyof typeof invoke;
export type SendChannel = keyof typeof send;
export type EventChannel = keyof typeof event;

// What the sender passes, and what a handler receives once main has parsed it
export type InvokeArgs = { [C in InvokeChannel]: z.input<(typeof invoke)[C]['args']> };
export type InvokeParsedArgs = { [C in InvokeChannel]: z.output<(typeof invoke)[C]['args']> };
export type InvokeResult = { [C in InvokeChannel]: z.output<(typeof invoke)[C]['result']> };
export type SendArgs = { [C in SendChannel]: z.input<(typeof send)[C]['args']> };
export type SendParsedArgs = { [C in SendChannel]: z.output<(typeof send)[C]['args']> };
export type EventArgs = { [C in EventChannel]: z.output<(typeof event)[C]['args']> };

// The same schemas, typed per channel, so code generic over a channel `C` keeps the link between
// the channel and its arguments (indexing `invoke` with a generic `C` widens to every channel's schema).
export const invokeArgSchemas: { [C in InvokeChannel]: { args: z.ZodType<InvokeParsedArgs[C], InvokeArgs[C]> } } = invoke;
export const sendArgSchemas: { [C in SendChannel]: { args: z.ZodType<SendParsedArgs[C], SendArgs[C]> } } = send;
