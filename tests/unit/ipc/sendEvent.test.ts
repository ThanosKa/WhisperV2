import { describe, expect, test, vi } from 'vitest';
import { sendEvent } from '../../../src/main/ipc/sendEvent';

// A window's webContents as sendEvent uses it: only `send`.
const fakeWebContents = () => ({ send: vi.fn() });

describe('sendEvent', () => {
    test('sends the payload as the event argument the renderer listener receives', () => {
        const webContents = fakeWebContents();

        sendEvent({ webContents, channel: 'stt:quotaExceeded', args: [{ resetAt: '2026-11-29T00:00:00Z' }] });

        expect(webContents.send).toHaveBeenCalledWith('stt:quotaExceeded', { resetAt: '2026-11-29T00:00:00Z' });
    });

    test('sends no argument for an event without a payload', () => {
        const webContents = fakeWebContents();

        sendEvent({ webContents, channel: 'force-height-recalc', args: [] });

        expect(webContents.send.mock.calls).toEqual([['force-height-recalc']]);
    });
});
