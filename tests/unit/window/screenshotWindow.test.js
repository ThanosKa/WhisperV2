const { EventEmitter } = require('node:events');
const { describe, test, expect, beforeEach, afterEach } = require('@jest/globals');

// Electron cannot run under Jest: a window here is a stand-in whose page loads when the test says so.
const fakeWindow = () => {
    let destroyed = false;
    const webContents = Object.assign(new EventEmitter(), { send: jest.fn(), openDevTools: jest.fn() });
    return {
        webContents,
        isDestroyed: () => destroyed,
        destroy: () => {
            destroyed = true;
        },
        setContentProtection: jest.fn(),
        setVisibleOnAllWorkspaces: jest.fn(),
        setWindowButtonVisibility: jest.fn(),
        loadFile: jest.fn(() => Promise.resolve()),
        getBounds: jest.fn(() => ({ x: 0, y: 0, width: 400, height: 300 })),
        setBounds: jest.fn(),
        show: jest.fn(),
        setAlwaysOnTop: jest.fn(),
        moveTop: jest.fn(),
    };
};

describe('showScreenshotWindow', () => {
    let windowManager;
    let created;

    beforeEach(() => {
        jest.useFakeTimers();
        jest.resetModules();
        const { BrowserWindow } = require('electron');
        created = [];
        BrowserWindow.mockImplementation(() => {
            const win = fakeWindow();
            created.push(win);
            return win;
        });
        windowManager = require('../../../src/main/window/windowManager');
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    test('sends the image to a new Screenshot window once, after its page has loaded', () => {
        windowManager.windowPool.set('header', fakeWindow());

        windowManager.showScreenshotWindow('IMAGE', { x: 10, y: 20 });
        const [screenshotWin] = created;
        expect(screenshotWin.webContents.send).not.toHaveBeenCalled();

        screenshotWin.webContents.emit('did-finish-load');
        jest.advanceTimersByTime(100);

        expect(screenshotWin.webContents.send.mock.calls).toEqual([['screenshot:data', 'IMAGE']]);
        expect(screenshotWin.show).toHaveBeenCalled();
    });

    test('opens no Screenshot window when the header window is gone', () => {
        const header = fakeWindow();
        header.destroy();
        windowManager.windowPool.set('header', header);

        expect(() => windowManager.showScreenshotWindow('IMAGE', { x: 10, y: 20 })).not.toThrow();
        jest.advanceTimersByTime(100);

        expect(created).toEqual([]);
    });
});
