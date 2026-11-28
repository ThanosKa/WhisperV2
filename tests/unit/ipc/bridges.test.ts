import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { electronMock } from '../../setup/electronMocks';
import { ipcChannels } from '../../../src/shared/ipc';

type Bridges = {
    featureBridge: { initialize(): void };
    windowBridge: { initialize(): void };
    internalBridge: import('node:events').EventEmitter;
};

let m: Bridges;

beforeAll(async () => {
    m = {
        featureBridge: (await import('../../../src/main/bridge/featureBridge')).default,
        windowBridge: (await import('../../../src/main/bridge/windowBridge')).default,
        internalBridge: (await import('../../../src/main/bridge/internalBridge')).default,
    };
});

afterEach(() => {
    m.internalBridge.removeAllListeners();
});

const initialize = () => {
    m.featureBridge.initialize();
    m.windowBridge.initialize();
};

const channelsRegisteredWith = (method: 'handle' | 'on') => electronMock.ipcMain[method].mock.calls.map(([channel]) => channel);

// Calls what the bridge registered for a channel, as Electron would on a renderer's message.
const fromRenderer = ({ method, channel, args }: { method: 'handle' | 'on'; channel: string; args: unknown[] }) => {
    const listener: unknown = electronMock.ipcMain[method].mock.calls.find(([name]) => name === channel)?.[1];
    if (typeof listener !== 'function') throw new Error(`nothing registered on ${channel}`);
    return listener({}, ...args);
};

const nextEmit = (name: string) => new Promise(resolve => m.internalBridge.once(name, resolve));

describe('the bridges', () => {
    test('register a handler for every invoke channel in the list, and nothing else', () => {
        initialize();

        expect(channelsRegisteredWith('handle').sort()).toEqual(Object.keys(ipcChannels.invoke).sort());
    });

    test('register a listener for every send channel in the list, and nothing else', () => {
        initialize();

        expect(channelsRegisteredWith('on').sort()).toEqual(Object.keys(ipcChannels.send).sort());
    });

    test('pass the window height the Ask view asks for on to the window layout', async () => {
        initialize();
        const emitted = nextEmit('window:adjustWindowHeight');

        await fromRenderer({ method: 'handle', channel: 'adjust-window-height', args: [{ winName: 'ask', height: 420 }] });

        await expect(emitted).resolves.toEqual({ winName: 'ask', targetHeight: 420 });
    });

    test('pass a header drag on as the new position', async () => {
        initialize();
        const emitted = nextEmit('window:moveHeaderTo');

        await fromRenderer({ method: 'handle', channel: 'move-header-to', args: [412, 8] });

        await expect(emitted).resolves.toEqual({ newX: 412, newY: 8 });
    });

    test('pass the plan tooltip hover on', async () => {
        initialize();
        const emitted = nextEmit('window:showPlanWindow');

        fromRenderer({ method: 'on', channel: 'window:showPlanWindow', args: [{ visible: true }] });

        await expect(emitted).resolves.toEqual({ visible: true });
    });

    test('reject a malformed payload before it reaches the window layout', async () => {
        initialize();
        let emitted = false;
        m.internalBridge.on('window:adjustWindowHeight', () => (emitted = true));

        await expect(
            fromRenderer({ method: 'handle', channel: 'adjust-window-height', args: [{ winName: 'ask', height: 'tall' }] })
        ).rejects.toThrow(/adjust-window-height/);
        expect(emitted).toBe(false);
    });
});
