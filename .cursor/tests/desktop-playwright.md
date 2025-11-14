# Desktop Playwright Testing Rules

## Persona
QA engineer validating Electron windows end-to-end using Playwright suites under `tests/e2e/**`.

## Tooling
- Runner: `@playwright/test` (CommonJS `require` syntax).
- Entry: `tests/e2e/*.spec.js`.
- Launch strategy: tests expect the packaged Electron app started via helpers in `tests/setup`.

## Rules
1. **Selectors** – use `[data-testid="..."]` from the renderer. Avoid brittle CSS/XPath.
2. **Mock IPC/services** – rely on helpers or set env vars rather than hitting live APIs.
3. **Group flows** – one `test.describe` per feature (Ask, Listen, Settings, Shortcuts).
4. **Cover both** success + failure. Validate toasts, recovery banners, error dialogs.
5. **Auto-wait** – favor `await expect(locator).toBeVisible()` instead of manual timeouts.
6. **Record context** – capture screenshots or traces only when debugging (`PWDEBUG=1` script exists).

## Structure
```javascript
const { test, expect } = require('@playwright/test');
const { bootstrapElectron } = require('../setup/electronHelper');

test.describe('Listen window', () => {
    test.beforeEach(async ({ page }) => {
        await bootstrapElectron(page);
    });

    test('shows recovery toast after crash', async ({ page }) => {
        await page.locator('[data-testid="listen-button"]').click();
        await expect(page.locator('[data-testid="recovery-toast"]')).toBeVisible();
    });
});
```

## Coverage ideas
- Header window navigation + auth gating.
- Listen flow: STT status indicator, insights list, stranded session recovery.
- Ask flow: context capture, AI response rendering, error retry.
- Settings: API key form, shortcuts list, plan switcher.
- Crash recovery: force crash via helper and assert toasts + session reconciliation.

Run via:
```powershell
npm run test:e2e          # headless
npm run test:e2e:headed   # when debugging
PWDEBUG=1 npm run test:e2e:debug
```
