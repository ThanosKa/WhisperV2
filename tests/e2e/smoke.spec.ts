import { expect, test } from './fixtures';

test('the app opens on the main header', async ({ headerWindow }) => {
    await expect(headerWindow.locator('main-header')).toBeVisible();
    await expect(headerWindow.locator('auth-header')).toHaveCount(0);
    await expect(headerWindow.locator('permission-setup')).toHaveCount(0);
});
