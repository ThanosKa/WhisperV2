import { queryDatabase } from './database';
import { FAKE_ANSWER, FAKE_TRANSCRIPT } from './fakeServer';
import { expect, findWindow, test } from './fixtures';

test('the app opens on the main header', async ({ headerWindow }) => {
    await expect(headerWindow.locator('main-header')).toBeVisible();
    await expect(headerWindow.locator('auth-header')).toHaveCount(0);
    await expect(headerWindow.locator('permission-setup')).toHaveCount(0);
});

test('Ask streams the answer to a typed question', async ({ electronApp, headerWindow, fakeServer }) => {
    await headerWindow.locator('main-header .ask-action').click();
    const askWindow = await findWindow({ electronApp, view: 'ask' });

    const question = 'What does the fake server say?';
    const input = askWindow.locator('#textInput');
    await input.fill(question);
    await input.press('Enter');

    await expect(askWindow.locator('.msg-assistant .msg-content')).toHaveText(FAKE_ANSWER);
    expect(fakeServer.llmRequests.map(({ route }) => route)).toEqual(['stream']);
    expect(JSON.stringify(fakeServer.llmRequests[0]?.body)).toContain(question);
});

test('Listen shows the transcript and saves the session', async ({ electronApp, headerWindow, fakeServer, userDataDir }) => {
    const listenButton = headerWindow.locator('main-header .listen-button').first();
    await listenButton.click();
    await expect(listenButton).toHaveClass(/active/);

    // The fake relay sends its transcript once microphone audio arrives, so this also shows
    // that the fake microphone reached the relay.
    const listenWindow = await findWindow({ electronApp, view: 'listen' });
    await listenWindow.getByRole('button', { name: 'Show Transcript' }).click();
    await expect(listenWindow.locator('.stt-message')).toHaveText([FAKE_TRANSCRIPT]);

    await listenButton.click();
    await expect(listenButton).toHaveClass(/paused/);
    await headerWindow.locator('main-header .listen-button.done').click();
    await expect(listenButton).not.toHaveClass(/paused|active/);

    // Done asks the LLM for a summary in the background; let it finish before closing the app.
    await expect.poll(() => fakeServer.llmRequests.map(({ route }) => route)).toEqual(['chat']);
    await electronApp.close();

    const sessions = await queryDatabase({
        userDataDir,
        sql: "SELECT session_type, ended_at IS NOT NULL AS ended FROM sessions WHERE session_type = 'listen'",
    });
    expect(sessions).toEqual([{ session_type: 'listen', ended: 1 }]);
    const transcripts = await queryDatabase({ userDataDir, sql: 'SELECT speaker, text FROM transcripts' });
    expect(transcripts).toEqual([{ speaker: 'Me', text: FAKE_TRANSCRIPT }]);
});
