import { describe, expect, test, vi } from 'vitest';
import { startSingleInstance } from '../../../src/main/singleInstance';

// What startSingleInstance needs from Electron's `app`, recording the order of the calls.
const fakeApp = ({ gotLock, calls }: { gotLock: boolean; calls: string[] }) => ({
    setName: vi.fn((name: string) => {
        calls.push(`setName ${name}`);
    }),
    requestSingleInstanceLock: vi.fn(() => {
        calls.push('requestSingleInstanceLock');
        return gotLock;
    }),
    quit: vi.fn(() => {
        calls.push('quit');
    }),
});

describe('startSingleInstance', () => {
    test('a second instance quits without loading the app', async () => {
        const calls: string[] = [];
        const loadApp = vi.fn(() => Promise.resolve());
        const exit = vi.fn((code: number) => {
            calls.push(`exit ${code}`);
        });

        await startSingleInstance({ app: fakeApp({ gotLock: false, calls }), exit, loadApp });

        expect(loadApp).not.toHaveBeenCalled();
        expect(calls).toEqual(['setName Whisper', 'requestSingleInstanceLock', 'quit', 'exit 0']);
    });

    test('the first instance names the app, takes the lock, then loads the app', async () => {
        const calls: string[] = [];
        const loadApp = vi.fn(() => {
            calls.push('loadApp');
            return Promise.resolve();
        });

        await startSingleInstance({ app: fakeApp({ gotLock: true, calls }), exit: vi.fn(), loadApp });

        expect(calls).toEqual(['setName Whisper', 'requestSingleInstanceLock', 'loadApp']);
    });
});
