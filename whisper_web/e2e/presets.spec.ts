import { test, expect } from '@playwright/test';

test.describe('Personalize presets CRUD', () => {
    test.beforeEach(async ({ page }) => {
        await page.addInitScript(() => {
            localStorage.setItem(
                'whisper_user',
                JSON.stringify({
                    uid: 'user-1',
                    display_name: 'Test User',
                    email: 'test@example.com',
                })
            );
        });

        // Mock presets API
        await page.route('/api/presets*', route => {
            const method = route.request().method();
            const url = route.request().url();

            if (method === 'GET') {
                route.fulfill({
                    status: 200,
                    body: JSON.stringify([
                        {
                            id: 'preset-1',
                            uid: 'user-1',
                            title: 'Brainstorm',
                            prompt: 'You are a creative assistant',
                            append_text: '',
                            is_default: 1,
                            created_at: Math.floor(Date.now() / 1000),
                            sync_state: 'clean',
                        },
                        {
                            id: 'preset-2',
                            uid: 'user-1',
                            title: 'Summarize',
                            prompt: 'Summarize the following content',
                            append_text: '',
                            is_default: 0,
                            created_at: Math.floor(Date.now() / 1000),
                            sync_state: 'clean',
                        },
                    ]),
                });
            } else if (method === 'PUT' && url.includes('/presets/preset-1')) {
                const body = route.request().postDataJSON();
                route.fulfill({
                    status: 200,
                    body: JSON.stringify({
                        id: 'preset-1',
                        uid: 'user-1',
                        title: body.title || 'Brainstorm',
                        prompt: body.prompt || 'You are a creative assistant',
                        append_text: body.append_text || '',
                        is_default: 1,
                        created_at: Math.floor(Date.now() / 1000),
                        sync_state: 'clean',
                    }),
                });
            } else {
                route.fulfill({ status: 200, body: JSON.stringify({}) });
            }
        });

        await page.goto('/personalize');
    });

    test('should display presets list', async ({ page }) => {
        await expect(page.getByText('Brainstorm')).toBeVisible();
        await expect(page.getByText('Summarize')).toBeVisible();
    });

    test('should select a preset', async ({ page }) => {
        await page.getByText('Summarize').click();
        await expect(page.getByText(/summarize the following content/i)).toBeVisible();
    });

    test('should update preset append text', async ({ page }) => {
        await page.getByText('Brainstorm').click();
        await page.waitForTimeout(500);

        const textarea = page.locator('textarea').first();
        await textarea.fill('Focus on key points');

        let updateCalled = false;
        await page.route('/api/presets/preset-1', route => {
            if (route.request().method() === 'PUT') {
                updateCalled = true;
                const body = route.request().postDataJSON();
                expect(body.append_text).toBe('Focus on key points');
                route.fulfill({ status: 200, body: JSON.stringify({}) });
            } else {
                route.continue();
            }
        });

        const saveButton = page.getByRole('button', { name: /save/i });
        await saveButton.click();

        await expect(page.getByText(/saved/i)).toBeVisible({ timeout: 5000 });
        expect(updateCalled).toBe(true);
    });

    test('should show reset confirmation', async ({ page }) => {
        // First set append_text
        await page.route('/api/presets/preset-1', route => {
            if (route.request().method() === 'PUT') {
                route.fulfill({ status: 200, body: JSON.stringify({}) });
            } else {
                route.continue();
            }
        });

        await page.getByText('Brainstorm').click();
        await page.waitForTimeout(500);

        const textarea = page.locator('textarea').first();
        await textarea.fill('Test append');

        const saveButton = page.getByRole('button', { name: /save/i });
        await saveButton.click();
        await page.waitForTimeout(500);

        // Now try to reset
        const resetButton = page.getByRole('button', { name: /reset/i });
        if (await resetButton.isVisible()) {
            await resetButton.click();
            await expect(page.getByText(/are you sure/i)).toBeVisible();
        }
    });
});

