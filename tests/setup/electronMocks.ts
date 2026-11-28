import { vi } from 'vitest';

// Electron and electron-store cannot run under Vitest. `vitest.setup.ts` swaps them for these
// stand-ins in every main-process test; a test that needs a particular window or store imports
// the same objects from here.

export type MockWindow = {
    id: number;
    webContents: {
        send: ReturnType<typeof vi.fn>;
        executeJavaScript: ReturnType<typeof vi.fn>;
        reloadIgnoringCache: ReturnType<typeof vi.fn>;
    };
    isDestroyed: ReturnType<typeof vi.fn>;
    isVisible: ReturnType<typeof vi.fn>;
    hide: ReturnType<typeof vi.fn>;
    show: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    getBounds: ReturnType<typeof vi.fn>;
    setResizable: ReturnType<typeof vi.fn>;
};

export type MockStore = {
    get: ReturnType<typeof vi.fn>;
    set: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    clear: ReturnType<typeof vi.fn>;
};

const createMockWindow = (): MockWindow => ({
    id: Math.floor(Math.random() * 10000),
    webContents: {
        send: vi.fn(),
        executeJavaScript: vi.fn(() => Promise.resolve()),
        reloadIgnoringCache: vi.fn(),
    },
    isDestroyed: vi.fn(() => false),
    isVisible: vi.fn(() => true),
    hide: vi.fn(),
    show: vi.fn(),
    close: vi.fn(),
    getBounds: vi.fn(() => ({ x: 0, y: 0, width: 800, height: 600 })),
    setResizable: vi.fn(),
});

const createMocks = () => {
    const mockWindows: MockWindow[] = [];
    const mockStoreInstances: MockStore[] = [];

    const BrowserWindowMock = Object.assign(
        vi.fn(function BrowserWindow(): object {
            const win = createMockWindow();
            mockWindows.push(win);
            return win;
        }),
        {
            getAllWindows: vi.fn((): unknown[] => mockWindows),
            fromId: vi.fn((id: number) => mockWindows.find(win => win.id === id) ?? null),
            getFocusedWindow: vi.fn(() => mockWindows[0] ?? null),
        }
    );

    const electronMock = {
        app: {
            getPath: vi.fn((name: string) => `/mock/app/path/${name}`),
            isPackaged: false,
            getName: vi.fn(() => 'Whisper'),
            on: vi.fn(),
            whenReady: vi.fn(() => Promise.resolve()),
            quit: vi.fn(),
        },
        BrowserWindow: BrowserWindowMock,
        ipcMain: {
            on: vi.fn(),
            handle: vi.fn(),
            removeHandler: vi.fn(),
            removeAllListeners: vi.fn(),
        },
        ipcRenderer: {
            on: vi.fn(),
            send: vi.fn(),
        },
        screen: {
            getAllDisplays: vi.fn(() => []),
            getDisplayNearestPoint: vi.fn(() => null),
            getPrimaryDisplay: vi.fn(() => ({ workArea: { width: 1920, height: 1080 } })),
        },
        desktopCapturer: {
            getSources: vi.fn((): Promise<unknown[]> => Promise.resolve([])),
        },
        globalShortcut: {
            register: vi.fn(),
            unregisterAll: vi.fn(),
        },
        shell: {
            openExternal: vi.fn(),
            showItemInFolder: vi.fn(),
        },
        dialog: {
            showErrorBox: vi.fn(),
            showMessageBox: vi.fn(() => Promise.resolve({})),
            showOpenDialog: vi.fn(() => Promise.resolve({})),
        },
        nativeTheme: {
            shouldUseDarkColors: false,
            on: vi.fn(),
        },
        Menu: {
            buildFromTemplate: vi.fn(() => ({ popup: vi.fn(), closePopup: vi.fn() })),
            setApplicationMenu: vi.fn(),
        },
    };

    const ElectronStoreMock = vi.fn(function ElectronStore() {
        const store = new Map<string, unknown>();
        const instance: MockStore = {
            get: vi.fn((key: string, defaultValue?: unknown) => (store.has(key) ? store.get(key) : defaultValue)),
            set: vi.fn((key: string, value: unknown) => {
                store.set(key, value);
            }),
            delete: vi.fn((key: string) => {
                store.delete(key);
            }),
            clear: vi.fn(() => {
                store.clear();
            }),
        };
        mockStoreInstances.push(instance);
        return instance;
    });

    return { mockWindows, mockStoreInstances, BrowserWindowMock, electronMock, ElectronStoreMock };
};

// Tests call `vi.resetModules()`, which would give this file a second copy of every stand-in.
// Keeping the one set on `globalThis` means the code under test, the setup file and the test
// all share it.
declare global {
    var __whisperElectronMocks: ReturnType<typeof createMocks> | undefined;
}

const mocks = (globalThis.__whisperElectronMocks ??= createMocks());

export const { mockWindows, mockStoreInstances, BrowserWindowMock, electronMock, ElectronStoreMock } = mocks;
