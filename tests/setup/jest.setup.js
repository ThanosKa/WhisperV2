const windows = [];

jest.mock('electron', () => {
    const createMockWindow = () => ({
        id: Math.floor(Math.random() * 10000),
        webContents: {
            send: jest.fn(),
            executeJavaScript: jest.fn(() => Promise.resolve()),
            reloadIgnoringCache: jest.fn(),
        },
        isDestroyed: jest.fn(() => false),
        isVisible: jest.fn(() => true),
        hide: jest.fn(),
        show: jest.fn(),
        close: jest.fn(),
        getBounds: jest.fn(() => ({ x: 0, y: 0, width: 800, height: 600 })),
        setResizable: jest.fn(),
    });

    const BrowserWindow = jest.fn(() => {
        const win = createMockWindow();
        windows.push(win);
        return win;
    });

    BrowserWindow.getAllWindows = jest.fn(() => windows);
    BrowserWindow.fromId = jest.fn(id => windows.find(win => win.id === id) || null);
    BrowserWindow.getFocusedWindow = jest.fn(() => windows[0] || null);
    BrowserWindow.__reset = () => {
        windows.splice(0, windows.length);
    };

    return {
        app: {
            getPath: jest.fn(name => `/mock/app/path/${name}`),
            isPackaged: false,
            getName: jest.fn(() => 'Whisper'),
            on: jest.fn(),
            whenReady: jest.fn(() => Promise.resolve()),
            quit: jest.fn(),
        },
        BrowserWindow,
        ipcMain: {
            on: jest.fn(),
            handle: jest.fn(),
            removeHandler: jest.fn(),
            removeAllListeners: jest.fn(),
        },
        ipcRenderer: {
            on: jest.fn(),
            send: jest.fn(),
        },
        screen: {
            getAllDisplays: jest.fn(() => []),
            getDisplayNearestPoint: jest.fn(() => null),
            getPrimaryDisplay: jest.fn(() => ({ workArea: { width: 1920, height: 1080 } })),
        },
        desktopCapturer: {
            getSources: jest.fn(() => Promise.resolve([])),
        },
        globalShortcut: {
            register: jest.fn(),
            unregisterAll: jest.fn(),
        },
        shell: {
            openExternal: jest.fn(),
            showItemInFolder: jest.fn(),
        },
        dialog: {
            showErrorBox: jest.fn(),
            showMessageBox: jest.fn(() => Promise.resolve({})),
            showOpenDialog: jest.fn(() => Promise.resolve({})),
        },
        nativeTheme: {
            shouldUseDarkColors: false,
            on: jest.fn(),
        },
        Menu: {
            buildFromTemplate: jest.fn(() => ({ popup: jest.fn(), closePopup: jest.fn() })),
            setApplicationMenu: jest.fn(),
        },
    };
});

jest.mock('electron-store', () => {
    const instances = [];

    const ElectronStore = jest.fn().mockImplementation(() => {
        const store = new Map();
        const instance = {
            get: jest.fn((key, defaultValue) => (store.has(key) ? store.get(key) : defaultValue)),
            set: jest.fn((key, value) => {
                store.set(key, value);
            }),
            delete: jest.fn(key => {
                store.delete(key);
            }),
            clear: jest.fn(() => {
                store.clear();
            }),
        };
        instances.push(instance);
        return instance;
    });

    ElectronStore.__instances = instances;
    ElectronStore.__resetInstances = () => {
        instances.length = 0;
    };

    return ElectronStore;
});

beforeEach(() => {
    const { BrowserWindow } = require('electron');
    BrowserWindow.__reset();
    const Store = require('electron-store');
    Store.__resetInstances();
});

const originalConsole = global.console;
global.console = {
    ...originalConsole,
    log: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
};
