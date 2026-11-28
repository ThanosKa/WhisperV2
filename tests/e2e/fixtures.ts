import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { _electron as electron, expect, test as base, type ElectronApplication, type Page } from '@playwright/test';
import { APP_ROOT } from './appRoot';
import { FAKE_SESSION_UUID, FAKE_USER, startFakeServer, type FakeServer } from './fakeServer';

const MAIN_PRELOAD = path.join(__dirname, 'support', 'main-preload.js');
export const FAKE_SCREEN_JPEG = path.join(__dirname, 'support', 'fake-screen.jpg');

// Scale 1 on any display, so screenshots have the same pixels on every Mac. Chromium reads this
// switch at start, so it goes on the command line, not in the preload.
const SCALE_SWITCH = '--force-device-scale-factor=1';

// The app the suite launches. `WHISPER_E2E_APP=packaged` runs the packaged app that
// `pnpm run package:e2e` builds into dist-e2e/ for this Mac's architecture; unset (or
// `development`), the suite runs the development app from the repo: electron-vite's output in out/,
// which `pnpm run build:all` builds, started through package.json's `main`.
type AppUnderTest = { kind: 'development'; mainPath: string } | { kind: 'packaged'; executablePath: string };

const PACKAGED_APP_DIR = path.join(APP_ROOT, 'dist-e2e', process.arch === 'arm64' ? 'mac-arm64' : 'mac');

const readAppUnderTest = (): AppUnderTest => {
    const value = process.env.WHISPER_E2E_APP ?? 'development';
    if (value === 'development') {
        return { kind: 'development', mainPath: path.join(APP_ROOT, 'out', 'main', 'index.js') };
    }
    if (value === 'packaged') {
        return { kind: 'packaged', executablePath: path.join(PACKAGED_APP_DIR, 'Whisper.app', 'Contents', 'MacOS', 'Whisper') };
    }
    throw new Error(`WHISPER_E2E_APP must be "development" or "packaged", not "${value}"`);
};

const APP_UNDER_TEST = readAppUnderTest();

// The development app runs through Electron's default app, which loads the preload with `-r`. The
// packaged app has no default app; its test build loads the preload from its own entry point
// (tests/e2e/electron-builder.e2e.yml).
type LaunchOptions = Pick<NonNullable<Parameters<typeof electron.launch>[0]>, 'executablePath' | 'args'>;

async function launchOptions({ app }: { app: AppUnderTest }): Promise<LaunchOptions> {
    switch (app.kind) {
        case 'development':
            await fs.access(app.mainPath).catch(() => {
                throw new Error(`No built app at ${app.mainPath}; build it with \`pnpm run build:all\``);
            });
            return { args: [SCALE_SWITCH, '-r', MAIN_PRELOAD, APP_ROOT] };
        case 'packaged':
            await fs.access(app.executablePath).catch(() => {
                throw new Error(`No packaged app at ${app.executablePath}; build it with \`pnpm run package:e2e\``);
            });
            return { executablePath: app.executablePath, args: [SCALE_SWITCH] };
    }
}

export type AppView = 'header' | 'ask' | 'listen' | 'settings' | 'plan' | 'screenshot';

type Fixtures = {
    fakeServer: FakeServer;
    userDataDir: string;
    launchApp: () => Promise<ElectronApplication>;
    electronApp: ElectronApplication;
    headerWindow: Page;
};

export type RunningApp = Pick<Fixtures, 'electronApp' | 'headerWindow'>;

const seedLoggedInSession = async ({ userDataDir }: { userDataDir: string }) => {
    const store = { sessionUuid: FAKE_SESSION_UUID, userProfile: FAKE_USER };
    await fs.writeFile(path.join(userDataDir, 'auth-session.json'), JSON.stringify(store));
};

const isView = ({ page, view }: { page: Page; view: AppView }) => {
    const url = new URL(page.url());
    return view === 'header' ? url.pathname.endsWith('/header.html') : url.searchParams.get('view') === view;
};

export async function findWindow({ electronApp, view }: { electronApp: ElectronApplication; view: AppView }): Promise<Page> {
    const predicate = (page: Page) => isView({ page, view });
    return electronApp.windows().find(predicate) ?? (await electronApp.waitForEvent('window', { predicate }));
}

const STARTUP_VIEWS = ['listen', 'ask', 'settings', 'plan'] satisfies AppView[];

// Waits until the header and the feature windows opened with it have loaded their pages. The app
// sends a window its state over IPC when the header is used, and a page still loading misses it.
// On Electron 45 the development app's feature windows finish loading up to about 0.7 s after the
// header, so a test that clicked at once could act before a person could.
async function waitForStartupWindows({ electronApp }: { electronApp: ElectronApplication }) {
    await expect
        .poll(
            () =>
                electronApp.evaluate(({ BrowserWindow }, views) => {
                    const loaded = BrowserWindow.getAllWindows()
                        .filter(win => !win.webContents.isLoading() && win.webContents.getURL() !== '')
                        .map(win => new URL(win.webContents.getURL()).searchParams.get('view'));
                    return views.every(view => loaded.includes(view));
                }, STARTUP_VIEWS),
            { message: 'the startup windows finished loading', timeout: 20_000 }
        )
        .toBe(true);
}

export const test = base.extend<Fixtures>({
    fakeServer: async ({}, use) => {
        const fakeServer = await startFakeServer();
        await use(fakeServer);
        await fakeServer.close();
        expect(fakeServer.unknownRequests, 'requests the fake server does not know').toEqual([]);
    },
    userDataDir: async ({}, use) => {
        const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'whisper-e2e-'));
        await seedLoggedInSession({ userDataDir: dir });
        await use(dir);
        await fs.rm(dir, { recursive: true, force: true });
    },
    launchApp: async ({ fakeServer, userDataDir }, use) => {
        const launched: ElectronApplication[] = [];
        await use(async () => {
            const electronApp = await electron.launch({
                ...(await launchOptions({ app: APP_UNDER_TEST })),
                env: {
                    ...process.env,
                    WHISPER_E2E_USER_DATA: userDataDir,
                    WHISPER_E2E_FAKE_SCREEN: FAKE_SCREEN_JPEG,
                    API_BASE_URL: fakeServer.url,
                    STT_RELAY_URL: fakeServer.wsUrl,
                    whisper_API_URL: fakeServer.url,
                    whisper_WEB_URL: fakeServer.url,
                },
            });
            launched.push(electronApp);
            await waitForStartupWindows({ electronApp });
            return electronApp;
        });
        for (const electronApp of launched) {
            await electronApp.close();
        }
        const mainErrors = await fs.readFile(path.join(userDataDir, 'e2e-main-errors.log'), 'utf8').catch(() => '');
        expect(mainErrors, 'uncaught exceptions in the main process').toBe('');
    },
    electronApp: async ({ launchApp }, use) => {
        await use(await launchApp());
    },
    headerWindow: async ({ electronApp }, use) => {
        await use(await findWindow({ electronApp, view: 'header' }));
    },
});

export { expect } from '@playwright/test';
