import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { _electron as electron, expect, test as base, type ElectronApplication, type Page } from '@playwright/test';
import { FAKE_SESSION_UUID, FAKE_USER, startFakeServer, type FakeServer } from './fakeServer';

const APP_ROOT = path.resolve(__dirname, '../..');
const MAIN_PRELOAD = path.join(__dirname, 'support', 'main-preload.js');

type Fixtures = {
    fakeServer: FakeServer;
    userDataDir: string;
    electronApp: ElectronApplication;
    headerWindow: Page;
};

// Writes the `auth-session` electron-store file the way authService saves it after a login.
const seedLoggedInSession = async ({ userDataDir }: { userDataDir: string }) => {
    const store = { sessionUuid: FAKE_SESSION_UUID, userProfile: FAKE_USER };
    await fs.writeFile(path.join(userDataDir, 'auth-session.json'), JSON.stringify(store));
};

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
    electronApp: async ({ fakeServer, userDataDir }, use) => {
        const electronApp = await electron.launch({
            args: ['-r', MAIN_PRELOAD, APP_ROOT],
            env: {
                ...process.env,
                WHISPER_E2E_USER_DATA: userDataDir,
                API_BASE_URL: fakeServer.url,
                STT_RELAY_URL: fakeServer.wsUrl,
                whisper_API_URL: fakeServer.url,
                whisper_WEB_URL: fakeServer.url,
            },
        });
        await use(electronApp);
        await electronApp.close();
    },
    headerWindow: async ({ electronApp }, use) => {
        const isHeader = (page: Page) => page.url().endsWith('/header.html');
        const headerWindow =
            electronApp.windows().find(isHeader) ?? (await electronApp.waitForEvent('window', { predicate: isHeader }));
        await use(headerWindow);
    },
});

export { expect } from '@playwright/test';
