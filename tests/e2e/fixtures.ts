import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { _electron as electron, expect, test as base, type ElectronApplication, type Page } from '@playwright/test';
import { FAKE_SESSION_UUID, FAKE_USER, startFakeServer, type FakeServer } from './fakeServer';

const APP_ROOT = path.resolve(__dirname, '../..');
const MAIN_PRELOAD = path.join(__dirname, 'support', 'main-preload.js');
export const FAKE_SCREEN_JPEG = path.join(__dirname, 'support', 'fake-screen.jpg');

// The feature windows load `content.html?view=<name>`; the header loads `header.html`.
export type AppView = 'header' | 'ask' | 'listen' | 'settings' | 'plan' | 'screenshot';

type Fixtures = {
    fakeServer: FakeServer;
    userDataDir: string;
    launchApp: () => Promise<ElectronApplication>;
    electronApp: ElectronApplication;
    headerWindow: Page;
};

// Writes the `auth-session` electron-store file the way authService saves it after a login.
const seedLoggedInSession = async ({ userDataDir }: { userDataDir: string }) => {
    const store = { sessionUuid: FAKE_SESSION_UUID, userProfile: FAKE_USER };
    await fs.writeFile(path.join(userDataDir, 'auth-session.json'), JSON.stringify(store));
};

const isView = ({ page, view }: { page: Page; view: AppView }) => {
    const url = new URL(page.url());
    return view === 'header' ? url.pathname.endsWith('/header.html') : url.searchParams.get('view') === view;
};

// Finds the window that shows `view`, waiting for it if the app has not opened it yet.
export async function findWindow({ electronApp, view }: { electronApp: ElectronApplication; view: AppView }): Promise<Page> {
    const predicate = (page: Page) => isView({ page, view });
    return electronApp.windows().find(predicate) ?? (await electronApp.waitForEvent('window', { predicate }));
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
    // Launches the app on the test's profile and fake server. A test may launch it more than once
    // (Smoke 4 restarts it); every app still running at the end is closed.
    launchApp: async ({ fakeServer, userDataDir }, use) => {
        const launched: ElectronApplication[] = [];
        await use(async () => {
            const electronApp = await electron.launch({
                // Scale 1 on any display, so screenshots have the same pixels on every Mac. Chromium
                // reads this switch at start, so it goes on the command line, not in the preload.
                args: ['--force-device-scale-factor=1', '-r', MAIN_PRELOAD, APP_ROOT],
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
            return electronApp;
        });
        // The apps close before the fake server (a fixture they depend on) stops.
        for (const electronApp of launched) {
            await electronApp.close();
        }
        // The main-process preload writes every uncaught exception in main to this file.
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
