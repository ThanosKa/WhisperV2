# Web App Playwright Testing Rules

## Persona
QA engineer validating Next.js user flows in `whisper_web/` with Playwright + TypeScript.

## Tooling
- Runner: `@playwright/test` (already listed in `whisper_web/package.json`).
- Tests live under `whisper_web/e2e/**` (create this folder).
- Base URL: configure via `playwright.config.ts` (use `http://localhost:3000` for `npm run dev`).

## Rules
1. **Use TypeScript** – write `.spec.ts` with ES modules.
2. **Mock backend_node** – intercept `/api/*` with `page.route()` or start the mock dev server via `NEXT_PUBLIC_DEV_MOCK=1`.
3. **Semantic selectors** – rely on `[data-testid]`, aria roles, or text; avoid brittle CSS.
4. **Test both modes** – cover `NEXT_PUBLIC_DEV_MOCK=1` and live IPC when possible.
5. **State assertions** – always verify that DOM updates match API responses (cards count, toast text, etc.).
6. **Group by feature** – `test.describe('Activity history', ...)`, `test.describe('Settings profile info', ...)`.

## Structure
```typescript
import { test, expect } from '@playwright/test';

test.describe('Login sync', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
    });

    test('should sync with desktop profile', async ({ page }) => {
        await page.route('/api/user/profile', route =>
            route.fulfill({
                status: 200,
                body: JSON.stringify({ uid: 'user-1', display_name: 'Ava', email: 'ava@example.com' }),
            }),
        );

        await page.getByRole('button', { name: /sync/i }).click();
        await expect(page.getByText(/ava@example.com/i)).toBeVisible();
    });
});
```

## Suggested scenarios
- Login page auto-sync (success + error toast).
- Activity page pagination, tab switching, delete confirmation.
- Settings profile card (mode badge, external plan link).
- Personalize presets: create/edit/delete flows.
- Help/download flows verifying external links.

Run via:
```powershell
cd whisper_web
npm run test:e2e
npm run test:e2e:headed   # when debugging
```
