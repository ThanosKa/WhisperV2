import type { Page } from '@playwright/test';
import { queryDatabase } from './database';
import { FAKE_TRANSCRIPT, type FakeServer } from './fakeServer';
import { expect, findWindow, test, type RunningApp } from './fixtures';
import { askAQuestion, listenButton, listenUntilTranscript, QUESTION } from './flows';

// Stop, then Done, then wait until the Listen window has finished hiding and the summary request
// that Done sends in the background has arrived. Closing the app during the 250 ms fade-out makes
// the app throw in main (see ticket 02's comments), so the test waits, as a user would.
async function finishListening({
    electronApp,
    headerWindow,
    listenWindow,
    fakeServer,
}: RunningApp & {
    listenWindow: Page;
    fakeServer: FakeServer;
}) {
    await listenButton({ headerWindow }).click();
    await expect(listenButton({ headerWindow })).toHaveClass(/paused/);
    await headerWindow.locator('main-header .listen-button.done').click();
    await expect(listenButton({ headerWindow })).not.toHaveClass(/paused|active/);
    const listenBrowserWindow = await electronApp.browserWindow(listenWindow);
    await expect.poll(() => listenBrowserWindow.evaluate(win => win.isVisible())).toBe(false);
    await expect.poll(() => fakeServer.llmRequests.some(({ route }) => route === 'chat')).toBe(true);
}

test('the app opens on the main header', async ({ headerWindow }) => {
    await expect(headerWindow.locator('main-header')).toBeVisible();
    await expect(headerWindow.locator('auth-header')).toHaveCount(0);
    await expect(headerWindow.locator('permission-setup')).toHaveCount(0);
});

test('Ask streams the answer to a typed question', async ({ electronApp, headerWindow, fakeServer }) => {
    await askAQuestion({ electronApp, headerWindow });

    expect(fakeServer.llmRequests.map(({ route }) => route)).toEqual(['stream']);
    expect(JSON.stringify(fakeServer.llmRequests[0]?.body)).toContain(QUESTION);
});

test('Listen shows the transcript and saves the session', async ({ electronApp, headerWindow, fakeServer, userDataDir }) => {
    const listenWindow = await listenUntilTranscript({ electronApp, headerWindow });
    await finishListening({ electronApp, headerWindow, listenWindow, fakeServer });
    await electronApp.close();

    const sessions = await queryDatabase({
        userDataDir,
        sql: "SELECT session_type, ended_at IS NOT NULL AS ended FROM sessions WHERE session_type = 'listen'",
    });
    expect(sessions).toEqual([{ session_type: 'listen', ended: 1 }]);
    const transcripts = await queryDatabase({ userDataDir, sql: 'SELECT speaker, text FROM transcripts' });
    expect(transcripts).toEqual([{ speaker: 'Me', text: FAKE_TRANSCRIPT }]);
});

// The analysis preset is the one setting the user changes that the app stores (in the
// `whisper-settings` store); the Settings window has none. See ticket 02's comments.
test('the analysis preset chosen in Listen is still chosen after a restart', async ({ launchApp, fakeServer }) => {
    const firstRun = await launchApp();
    const firstHeader = await findWindow({ electronApp: firstRun, view: 'header' });
    const firstListen = await listenUntilTranscript({ electronApp: firstRun, headerWindow: firstHeader });
    const firstPreset = firstListen.locator('.preset-select');
    await expect(firstPreset).toHaveValue('meetings');
    await firstPreset.selectOption('recruiting');
    await finishListening({ electronApp: firstRun, headerWindow: firstHeader, listenWindow: firstListen, fakeServer });
    await firstRun.close();

    const secondRun = await launchApp();
    const secondHeader = await findWindow({ electronApp: secondRun, view: 'header' });
    const secondPreset = (await listenUntilTranscript({ electronApp: secondRun, headerWindow: secondHeader })).locator('.preset-select');
    await expect(secondPreset).toHaveValue('recruiting');
});
