import { test, expect } from '@playwright/test';

test.describe('Settings profile info', () => {
    test.beforeEach(async ({ page }) => {
        await page.addInitScript(() => {
            localStorage.setItem(
                'whisper_user',
                JSON.stringify({
                    uid: 'user-1',
                    display_name: 'John Doe',
                    email: 'john@example.com',
                })
            );
        });

        await page.goto('/settings');
    });

    test('should render profile card with user info', async ({ page }) => {
        await expect(page.getByText('John Doe')).toBeVisible();
        await expect(page.getByText('john@example.com')).toBeVisible();
    });

    test('should display avatar initials', async ({ page }) => {
        const avatar = page.locator('[class*="AvatarFallback"]');
        await expect(avatar).toContainText('JD');
    });

    test('should show plan link', async ({ page }) => {
        const planLink = page.getByText(/free/i).or(page.getByText(/pro/i)).or(page.getByText(/premium/i));
        await expect(planLink).toBeVisible();
        const link = planLink.locator('..').locator('a').first();
        await expect(link).toHaveAttribute('href', 'https://www.app-whisper.com/pricing');
    });

    test('should display mode badge for webapp', async ({ page }) => {
        await expect(page.getByText(/cloud authenticated/i).or(page.getByText(/local mode/i))).toBeVisible();
    });

    test('should show all profile details', async ({ page }) => {
        await expect(page.getByText(/display name/i)).toBeVisible();
        await expect(page.getByText(/primary email/i)).toBeVisible();
        await expect(page.getByText(/account id/i)).toBeVisible();
        await expect(page.getByText(/current plan/i)).toBeVisible();
        await expect(page.getByText(/sign-in method/i)).toBeVisible();
        await expect(page.getByText(/data storage/i)).toBeVisible();
    });
});

