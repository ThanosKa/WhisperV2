import { test, expect } from '@playwright/test';

test.describe('Login sync', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/login');
    });

    test('should sync with desktop profile', async ({ page }) => {
        await page.route('/api/user/profile', route =>
            route.fulfill({
                status: 200,
                body: JSON.stringify({ uid: 'user-1', display_name: 'Ava', email: 'ava@example.com' }),
            })
        );

        // Mock runtime-config to simulate Electron mode
        await page.route('/runtime-config.json', route =>
            route.fulfill({
                status: 200,
                body: JSON.stringify({ API_URL: 'http://localhost:9001' }),
            })
        );

        await page.waitForSelector('button:has-text("Sync with Desktop App")', { timeout: 5000 });
        await page.getByRole('button', { name: /sync with desktop app/i }).click();

        await expect(page.getByText(/sync complete/i)).toBeVisible({ timeout: 5000 });
    });

    test('should show error on sync failure', async ({ page }) => {
        await page.route('/api/user/profile', route =>
            route.fulfill({
                status: 500,
                body: JSON.stringify({ error: 'Failed to fetch user' }),
            })
        );

        await page.route('/runtime-config.json', route =>
            route.fulfill({
                status: 200,
                body: JSON.stringify({ API_URL: 'http://localhost:9001' }),
            })
        );

        await page.waitForSelector('button:has-text("Sync with Desktop App")', { timeout: 5000 });
        await page.getByRole('button', { name: /sync with desktop app/i }).click();

        await expect(page.getByText(/desktop app user not found/i)).toBeVisible({ timeout: 5000 });
        await expect(page.getByRole('button', { name: /retry sync/i })).toBeVisible();
    });

    test('should show web mode when runtime-config not available', async ({ page }) => {
        await page.route('/runtime-config.json', route => route.abort());

        await expect(page.getByText(/sign in with your account/i)).toBeVisible();
        await expect(page.getByRole('button', { name: /sign in with account/i })).toBeVisible();
    });
});

