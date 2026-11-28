import { FAKE_ANSWER } from './fakeServer';
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
