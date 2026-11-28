import type { Page } from '@playwright/test';
import { FAKE_USER } from './fakeServer';
import { expect, findWindow, test, type RunningApp } from './fixtures';
import { askAQuestion, listenUntilTranscript } from './flows';

// One screenshot per window in its normal state, compared with an exact match: `threshold: 0`
// (Playwright's default lets each pixel's colour differ by 0.2). Playwright's default
// `animations: 'disabled'` stops CSS animations, and the launch fixes the scale at 1.

// The look that does not depend on the moment or the Mac:
// - no hover: the windows are on the real screen, so the Mac's own mouse pointer may rest on one
//   and show its hover-only buttons. With pointer events off, nothing can be hovered.
// - text that changes by itself is hidden: the date and time on Ask's screenshot label, Listen's
//   timer, and the app version. Hidden rather than masked, because their width changes too.
const STABLE_LOOK = `
    * { pointer-events: none !important; }
    .screenshot-indicator,
    .bar-left-text-content,
    .version-info { visibility: hidden !important; }
`;

// The windows are Lit components, so the stylesheet goes into every shadow root as well as the
// document. (Playwright's `style` option did not reach these shadow roots.)
async function applyStableLook({ page }: { page: Page }) {
    await page.evaluate(css => {
        const addTo = (root: Document | ShadowRoot) => {
            const style = document.createElement('style');
            style.textContent = css;
            (root instanceof Document ? root.head : root).append(style);
            for (const element of root.querySelectorAll('*')) {
                if (element.shadowRoot) addTo(element.shadowRoot);
            }
        };
        addTo(document);
    }, STABLE_LOOK);
}

// In the development app each window has DevTools open, and DevTools draws a size label over a
// window for 2 seconds after it resizes. Wait until the window size has been still for longer.
const SIZE_LABEL_MS = 2500;

async function waitForStillWindow({ page }: { page: Page }) {
    const size = () => page.evaluate(() => `${window.innerWidth}x${window.innerHeight}`);
    let last = await size();
    let stillSince = Date.now();
    while (Date.now() - stillSince < SIZE_LABEL_MS) {
        await page.waitForTimeout(250);
        const current = await size();
        if (current !== last) {
            last = current;
            stillSince = Date.now();
        }
    }
}

async function expectWindowScreenshot({ page, name }: { page: Page; name: string }) {
    await applyStableLook({ page });
    await waitForStillWindow({ page });
    await expect(page).toHaveScreenshot(name, { threshold: 0 });
}

async function askWithScreenshot(app: RunningApp) {
    const askWindow = await askAQuestion(app);
    await expect(askWindow.locator('.screenshot-indicator')).toHaveCount(1);
    return askWindow;
}

test('header window', async ({ headerWindow }) => {
    await expect(headerWindow.locator('main-header .left-label')).toHaveText('Upgrade to Pro');
    await expectWindowScreenshot({ page: headerWindow, name: 'header.png' });
});

test('Ask window', async ({ electronApp, headerWindow }) => {
    const askWindow = await askWithScreenshot({ electronApp, headerWindow });
    await expectWindowScreenshot({ page: askWindow, name: 'ask.png' });
});

test('Screenshot window', async ({ electronApp, headerWindow }) => {
    const askWindow = await askWithScreenshot({ electronApp, headerWindow });
    await askWindow.locator('.screenshot-indicator').hover();
    const screenshotWindow = await findWindow({ electronApp, view: 'screenshot' });
    await expect(screenshotWindow.locator('.screenshot-image')).toBeVisible();
    await expectWindowScreenshot({ page: screenshotWindow, name: 'screenshot.png' });
});

test('Listen window', async ({ electronApp, headerWindow }) => {
    const listenWindow = await listenUntilTranscript({ electronApp, headerWindow });
    await expectWindowScreenshot({ page: listenWindow, name: 'listen.png' });
});

test('Settings window', async ({ electronApp, headerWindow }) => {
    await headerWindow.locator('main-header .settings-button').hover();
    const settingsWindow = await findWindow({ electronApp, view: 'settings' });
    await expect(settingsWindow.locator('.account-info')).toHaveText(`Account: ${FAKE_USER.email}`);
    await expectWindowScreenshot({ page: settingsWindow, name: 'settings.png' });
});

test('Plan window', async ({ electronApp, headerWindow }) => {
    await headerWindow.locator('main-header .left-label').hover();
    const planWindow = await findWindow({ electronApp, view: 'plan' });
    await expect(planWindow.locator('.plan-primary-text')).toHaveText(`You have ${FAKE_USER.apiQuota.remaining} responses left.`);
    await expectWindowScreenshot({ page: planWindow, name: 'plan.png' });
});
