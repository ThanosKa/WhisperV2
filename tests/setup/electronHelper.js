const { _electron: electron } = require('playwright');
const path = require('path');

/**
 * Launch the Electron app for E2E tests.
 * @returns {Promise<{ electronApp: import('playwright').ElectronApplication, window: import('playwright').Page }>}
 */
async function launchElectronApp() {
    const electronApp = await electron.launch({
        args: [path.join(__dirname, '../../src/index.js')],
        env: {
            ...process.env,
            NODE_ENV: 'test',
            WHISPER_TEST_MODE: 'true',
        },
    });

    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    return { electronApp, window };
}

/**
 * Close the Electron application gracefully.
 * @param {import('playwright').ElectronApplication} electronApp
 */
async function closeElectronApp(electronApp) {
    if (electronApp) {
        await electronApp.close();
    }
}

module.exports = {
    launchElectronApp,
    closeElectronApp,
};
