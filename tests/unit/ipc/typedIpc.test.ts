import { describe, expect, test, vi } from 'vitest';
import { electronMock } from '../../setup/electronMocks';
import { handle, on } from '../../../src/main/ipc/typedIpc';

const fakeEvent = {};

// The listener main gave ipcMain for a channel, called as Electron would.
const registered = ({ method, channel }: { method: 'handle' | 'on'; channel: string }) => {
    const call = electronMock.ipcMain[method].mock.calls.find(([name]) => name === channel);
    const listener: unknown = call?.[1];
    if (typeof listener !== 'function') throw new Error(`nothing registered on ${channel}`);
    return (...args: unknown[]): unknown => listener(fakeEvent, ...args);
};

describe('handle', () => {
    test('runs the handler with the parsed arguments', async () => {
        const handler = vi.fn();
        handle({ channel: 'move-header-to', handler });

        await registered({ method: 'handle', channel: 'move-header-to' })(412, 8);

        expect(handler).toHaveBeenCalledWith(412, 8);
    });

    test('resolves with what the handler returns', async () => {
        handle({ channel: 'settings:get-app-version', handler: () => '1.7.0' });

        await expect(registered({ method: 'handle', channel: 'settings:get-app-version' })()).resolves.toBe('1.7.0');
    });

    test('rejects a payload the schema refuses, naming the channel, without running the handler', async () => {
        const handler = vi.fn();
        handle({ channel: 'adjust-window-height', handler });

        await expect(registered({ method: 'handle', channel: 'adjust-window-height' })({ winName: 'ask' })).rejects.toThrow(
            /adjust-window-height/
        );
        expect(handler).not.toHaveBeenCalled();
    });
});

describe('on', () => {
    test('runs the listener with the parsed arguments', () => {
        const listener = vi.fn();
        on({ channel: 'window:showPlanWindow', listener });

        registered({ method: 'on', channel: 'window:showPlanWindow' })({ visible: true });

        expect(listener).toHaveBeenCalledWith({ visible: true });
    });

    test('drops a payload the schema refuses', () => {
        const listener = vi.fn();
        on({ channel: 'window:showPlanWindow', listener });

        registered({ method: 'on', channel: 'window:showPlanWindow' })({ visible: 'yes' });

        expect(listener).not.toHaveBeenCalled();
    });
});
