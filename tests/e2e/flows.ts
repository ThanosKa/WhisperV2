import type { Page } from '@playwright/test';
import { FAKE_ANSWER, FAKE_TRANSCRIPT } from './fakeServer';
import { expect, findWindow, type RunningApp } from './fixtures';

export const QUESTION = 'What does the fake server say?';

export const listenButton = ({ headerWindow }: { headerWindow: Page }) => headerWindow.locator('main-header .listen-button').first();

export async function askAQuestion({ electronApp, headerWindow }: RunningApp): Promise<Page> {
    await headerWindow.locator('main-header .ask-action').click();
    const askWindow = await findWindow({ electronApp, view: 'ask' });
    const input = askWindow.locator('#textInput');
    await input.fill(QUESTION);
    await input.press('Enter');
    await expect(askWindow.locator('.msg-assistant .msg-content')).toHaveText(FAKE_ANSWER);
    return askWindow;
}

// The fake relay sends the transcript once microphone audio arrives, so seeing it also shows that
// the fake microphone reached the relay.
export async function listenUntilTranscript({ electronApp, headerWindow }: RunningApp): Promise<Page> {
    await listenButton({ headerWindow }).click();
    await expect(listenButton({ headerWindow })).toHaveClass(/active/);
    const listenWindow = await findWindow({ electronApp, view: 'listen' });
    await listenWindow.getByRole('button', { name: 'Show Transcript' }).click();
    await expect(listenWindow.locator('.stt-message')).toHaveText([FAKE_TRANSCRIPT]);
    return listenWindow;
}
