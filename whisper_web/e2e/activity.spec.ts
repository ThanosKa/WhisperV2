import { test, expect } from '@playwright/test';

test.describe('Activity history', () => {
    test.beforeEach(async ({ page }) => {
        // Set up mock user in localStorage
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

        // Mock API endpoints
        await page.route('/api/conversations/meetings*', route => {
            const url = new URL(route.request().url());
            const offset = parseInt(url.searchParams.get('offset') || '0');
            const limit = parseInt(url.searchParams.get('limit') || '10');

            const meetings = Array.from({ length: 15 }, (_, i) => ({
                id: `meeting-${i + 1}`,
                uid: 'user-1',
                title: `Team Sync #${i + 1}`,
                session_type: 'listen',
                started_at: Math.floor(Date.now() / 1000) - (i + 1) * 3600,
                ended_at: Math.floor(Date.now() / 1000) - (i + 1) * 3600 + 1800,
                sync_state: 'clean',
                updated_at: Math.floor(Date.now() / 1000) - (i + 1) * 3600 + 1800,
            }));

            const items = meetings.slice(offset, offset + limit);
            const nextOffset = offset + items.length < meetings.length ? offset + items.length : null;

            route.fulfill({
                status: 200,
                body: JSON.stringify({ items, nextOffset, total: meetings.length }),
            });
        });

        await page.route('/api/conversations/questions*', route => {
            const url = new URL(route.request().url());
            const offset = parseInt(url.searchParams.get('offset') || '0');
            const limit = parseInt(url.searchParams.get('limit') || '10');

            const questions = Array.from({ length: 5 }, (_, i) => ({
                id: `question-${i + 1}`,
                uid: 'user-1',
                title: `Question #${i + 1}`,
                session_type: 'ask',
                started_at: Math.floor(Date.now() / 1000) - (i + 1) * 3600,
                sync_state: 'clean',
                updated_at: Math.floor(Date.now() / 1000) - (i + 1) * 3600,
            }));

            const items = questions.slice(offset, offset + limit);
            const nextOffset = offset + items.length < questions.length ? offset + items.length : null;

            route.fulfill({
                status: 200,
                body: JSON.stringify({ items, nextOffset, total: questions.length }),
            });
        });

        await page.route('/api/conversations/stats', route =>
            route.fulfill({
                status: 200,
                body: JSON.stringify({ totalMeetingSeconds: 3600, totalQuestions: 5 }),
            })
        );

        await page.goto('/activity');
    });

    test('should display activity page with stats', async ({ page }) => {
        await expect(page.getByText(/total time in meetings/i)).toBeVisible();
        await expect(page.getByText(/whisper uses/i)).toBeVisible();
    });

    test('should switch between meetings and questions tabs', async ({ page }) => {
        await expect(page.getByText(/team sync/i).first()).toBeVisible();

        await page.getByRole('button', { name: /questions/i }).click();
        await expect(page.getByText(/question #1/i)).toBeVisible();
        await expect(page.getByText(/team sync/i).first()).not.toBeVisible();

        await page.getByRole('button', { name: /meetings/i }).click();
        await expect(page.getByText(/team sync/i).first()).toBeVisible();
    });

    test('should load more meetings on scroll', async ({ page }) => {
        await expect(page.getByText(/team sync #1/i)).toBeVisible();

        // Scroll to bottom to trigger pagination
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(1000);

        // Should load more items
        await expect(page.getByText(/team sync #10/i)).toBeVisible({ timeout: 5000 });
    });

    test('should show delete confirmation dialog', async ({ page }) => {
        const deleteButtons = page.getByRole('button', { name: /delete/i });
        const firstDeleteButton = deleteButtons.first();
        await firstDeleteButton.click();

        await expect(page.getByText(/are you sure you want to delete/i)).toBeVisible();
        await expect(page.getByRole('button', { name: /cancel/i })).toBeVisible();
    });

    test('should delete session on confirmation', async ({ page }) => {
        let deleteCalled = false;
        await page.route('/api/conversations/meeting-1', route => {
            if (route.request().method() === 'DELETE') {
                deleteCalled = true;
                route.fulfill({ status: 200, body: JSON.stringify({}) });
            } else {
                route.continue();
            }
        });

        const deleteButtons = page.getByRole('button', { name: /delete/i });
        const firstDeleteButton = deleteButtons.first();
        await firstDeleteButton.click();

        await page.getByRole('button', { name: /delete/i }).filter({ hasText: /^delete$/i }).click();

        await expect(page.getByText(/are you sure/i)).not.toBeVisible({ timeout: 5000 });
        expect(deleteCalled).toBe(true);
    });

    test('should show empty state when no meetings', async ({ page }) => {
        await page.route('/api/conversations/meetings*', route =>
            route.fulfill({
                status: 200,
                body: JSON.stringify({ items: [], nextOffset: null, total: 0 }),
            })
        );

        await page.reload();
        await expect(page.getByText(/no meetings yet/i)).toBeVisible();
    });
});

