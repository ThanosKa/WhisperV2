import { describe, expect, test } from 'vitest';
import { ipcChannels } from '../../../src/shared/ipc';

// The arguments each Lit window sends today, copied from its call sites in src/renderer/.
// Every channel's schema must accept them, or the feature breaks only on the path that sends it.
const invokeCallsFromTheUi: [string, unknown[]][] = [
    ['settings:get-auto-update', []],
    ['settings:set-auto-update', [false]],
    ['settings:get-app-version', []],
    ['settings:open-db-path', []],
    ['settings:getCurrentShortcuts', []],
    ['shortcut:toggleAllWindowsVisibility', []],
    ['check-system-permissions', []],
    ['request-microphone-permission', []],
    ['open-system-preferences', ['screen-recording']],
    ['get-current-user', []],
    ['start-webapp-auth', []],
    ['reset-auth-state', []],
    ['sign-out', []],
    ['quit-application', []],
    ['app:check-for-updates', []],
    ['app:install-update', []],
    ['ask:sendQuestionFromAsk', ['What did they decide?', true, false]],
    ['ask:sendQuestionFromSummary', ['Who owns the launch?']],
    ['ask:toggleAskButton', []],
    ['ask:setUseScreenCapture', [true]],
    ['ask:closeAskWindow', []],
    ['ask:interruptStream', []],
    ['listen:sendMicAudio', [{ data: 'AAAA', mimeType: 'audio/pcm;rate=16000' }]],
    ['listen:sendSystemAudio', [{ data: 'BBBB', mimeType: 'audio/pcm;rate=16000' }]],
    ['listen:startMacosSystemAudio', []],
    ['listen:stopMacosSystemAudio', []],
    ['listen:isSessionActive', []],
    ['listen:changeSession', ['Listen']],
    ['listen:changeSession', ['Done']],
    ['listen:listAnalysisPresets', []],
    ['listen:getAnalysisPreset', []],
    ['listen:setAnalysisPreset', [{ presetId: 'meetings' }]],
    ['listen:setAnalysisPreset', [{ presetId: null }]],
    ['listen:handleRecoveryAction', ['resume', 'session-1']],
    ['listen:handleRecoveryAction', ['finalize', 'session-1']],
    ['listen:getStrandedSession', []],
    ['model:re-initialize-state', []],
    ['toggle-content-protection', []],
    ['resize-header-window', [{ width: 600, height: 50 }]],
    ['get-content-protection-status', []],
    [
        'recovery-toast:show',
        [
            { id: 'session-1', title: 'Untitled Session', started_at: 1764300000 },
            { x: 100, y: 20, width: 600, height: 50 },
        ],
    ],
    ['open-personalize-page', []],
    ['move-window-step', ['left']],
    ['move-window-step', ['right']],
    ['open-external', ['https://example.com/source']],
    ['get-header-position', []],
    ['move-header-to', [412, 8]],
    ['adjust-window-height', [{ winName: 'ask', height: 420 }]],
    ['window:set-visibility', [{ name: 'listen', visible: false }]],
    ['window:is-visible', ['listen']],
    ['get-displays', []],
    ['move-to-display', [2]],
    ['header:force-show-permission', []],
];

const sendCallsFromTheUi: [string, unknown[]][] = [
    ['show-settings-window', []],
    ['hide-settings-window', []],
    ['cancel-hide-settings-window', []],
    ['show-screenshot-window', [{ base64Data: 'iVBORw0KGgo=', position: { x: 300, y: 64 } }]],
    ['hide-screenshot-window', []],
    ['cancel-hide-screenshot-window', []],
    ['window:showPlanWindow', [{ visible: true }]],
    ['hide-plan-window', []],
    ['cancel-hide-plan-window', []],
    ['header-state-changed', ['main']],
    ['header-animation-finished', ['hidden']],
    ['auth-started', []],
];

const parsesInvoke = ([channel, args]: [string, unknown[]]) => {
    const spec = Object.entries(ipcChannels.invoke).find(([name]) => name === channel)?.[1];
    return spec?.args.safeParse(args).success;
};

const parsesSend = ([channel, args]: [string, unknown[]]) => {
    const spec = Object.entries(ipcChannels.send).find(([name]) => name === channel)?.[1];
    return spec?.args.safeParse(args).success;
};

describe('the IPC list', () => {
    test.each(invokeCallsFromTheUi)('accepts what the UI invokes on %s', (channel, args) => {
        expect(parsesInvoke([channel, args])).toBe(true);
    });

    test.each(sendCallsFromTheUi)('accepts what the UI sends on %s', (channel, args) => {
        expect(parsesSend([channel, args])).toBe(true);
    });

    test('names exactly the invoke and send channels the UI uses', () => {
        expect(Object.keys(ipcChannels.invoke).sort()).toEqual([...new Set(invokeCallsFromTheUi.map(([name]) => name))].sort());
        expect(Object.keys(ipcChannels.send).sort()).toEqual(sendCallsFromTheUi.map(([name]) => name).sort());
    });

    test('the Ask defaults stay optional, as the preload fills them', () => {
        expect(parsesInvoke(['ask:sendQuestionFromAsk', ['What did they decide?']])).toBe(true);
    });

    test.each<[string, unknown[]]>([
        ['move-header-to', ['412', 8]],
        ['adjust-window-height', [{ winName: 'ask' }]],
        ['listen:sendMicAudio', [{ data: new Uint8Array(4), mimeType: 'audio/pcm;rate=16000' }]],
        ['open-external', [undefined]],
        ['get-current-user', ['extra']],
    ])('rejects a malformed payload on %s', (channel, args) => {
        expect(parsesInvoke([channel, args])).toBe(false);
    });

    test('rejects a malformed payload on a send channel', () => {
        expect(parsesSend(['window:showPlanWindow', [{ visible: 'yes' }]])).toBe(false);
    });
});
