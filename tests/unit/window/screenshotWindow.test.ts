import { EventEmitter } from 'node:events';
import { BrowserWindow } from 'electron';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

// Electron cannot run under Vitest: a window here is a stand-in whose page loads when the test says so.
const fakeWindow = () => {
    let destroyed = false;
    const webContents = Object.assign(new EventEmitter(), { send: vi.fn(), openDevTools: vi.fn() });
    return {
        webContents,
        isDestroyed: () => destroyed,
        destroy: () => {
            destroyed = true;
        },
        setContentProtection: vi.fn(),
        setVisibleOnAllWorkspaces: vi.fn(),
        setWindowButtonVisibility: vi.fn(),
        loadFile: vi.fn(() => Promise.resolve()),
        getBounds: vi.fn(() => ({ x: 0, y: 0, width: 400, height: 300 })),
        setBounds: vi.fn(),
        show: vi.fn(),
        setAlwaysOnTop: vi.fn(),
        moveTop: vi.fn(),
    };
};

describe('showScreenshotWindow', () => {
    let windowManager: typeof import('../../../src/main/window/windowManager');
    let created: ReturnType<typeof fakeWindow>[];

    beforeEach(async () => {
        vi.useFakeTimers();
        vi.resetModules();
        created = [];
        // resetModules gives the code under test a fresh Electron stand-in; take the same one.
        const { BrowserWindowMock } = await import('../../setup/electronMocks');
        BrowserWindowMock.mockImplementation(function BrowserWindow() {
            const win = fakeWindow();
            created.push(win);
            return win;
        });
        windowManager = await import('../../../src/main/window/windowManager');
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    test('sends the image to a new Screenshot window once, after its page has loaded', () => {
        windowManager.windowPool.set('header', new BrowserWindow());
        created.length = 0; // keep only the windows the code under test opens

        windowManager.showScreenshotWindow({ base64Data: 'IMAGE', position: { x: 10, y: 20 } });
        const [screenshotWin] = created;
        if (!screenshotWin) throw new Error('no Screenshot window was opened');
        expect(screenshotWin.webContents.send).not.toHaveBeenCalled();

        screenshotWin.webContents.emit('did-finish-load');
        vi.advanceTimersByTime(100);

        expect(screenshotWin.webContents.send.mock.calls).toEqual([['screenshot:data', 'IMAGE']]);
        expect(screenshotWin.show).toHaveBeenCalled();
    });

    test('opens no Screenshot window when the header window is gone', () => {
        const header = new BrowserWindow();
        header.destroy();
        windowManager.windowPool.set('header', header);
        created.length = 0;

        expect(() => windowManager.showScreenshotWindow({ base64Data: 'IMAGE', position: { x: 10, y: 20 } })).not.toThrow();
        vi.advanceTimersByTime(100);

        expect(created).toEqual([]);
    });
});
