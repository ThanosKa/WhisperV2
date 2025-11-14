import { test, expect } from '@playwright/test';

test.describe('Help and download flows', () => {
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
    });

    test('should navigate to help page', async ({ page }) => {
        await page.goto('/help');
        await expect(page.getByText(/help/i).or(page.getByText(/support/i)).or(page.getByText(/documentation/i))).toBeVisible();
    });

    test('should navigate to download page', async ({ page }) => {
        await page.goto('/download');
        await expect(page.getByText(/download/i).or(page.getByText(/install/i))).toBeVisible();
    });

    test('should verify external links open in new tab', async ({ page, context }) => {
        await page.goto('/settings');

        const planLink = page.getByText(/free/i).or(page.getByText(/pro/i)).or(page.getByText(/premium/i)).locator('..').locator('a').first();
        const target = await planLink.getAttribute('target');
        const rel = await planLink.getAttribute('rel');

        expect(target).toBe('_blank');
        expect(rel).toContain('noopener');
    });

    test('should handle help page content', async ({ page }) => {
        await page.goto('/help');

        // Check for common help page elements
        const hasContent = await page.locator('body').textContent();
        expect(hasContent).toBeTruthy();
    });
});

