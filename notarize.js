const { notarize } = require('@electron/notarize');
require('dotenv').config();

module.exports = async function notarizeApp(context) {
    if (context.electronPlatformName !== 'darwin') {
        return;
    }

    const { appOutDir } = context;
    const appName = context.packager.appInfo.productFilename;
    const appPath = `${appOutDir}/${appName}.app`;

    // Debug logging
    console.log('=== Notarization Debug ===');
    console.log('APPLE_ID:', process.env.APPLE_ID ? 'SET' : 'NOT SET');
    console.log('APPLE_APP_SPECIFIC_PASSWORD:', process.env.APPLE_APP_SPECIFIC_PASSWORD ? 'SET' : 'NOT SET');
    console.log('APPLE_TEAM_ID:', process.env.APPLE_TEAM_ID || 'NOT SET');
    console.log('Current working directory:', process.cwd());
    console.log('========================');

    if (!process.env.APPLE_ID || !process.env.APPLE_APP_SPECIFIC_PASSWORD || !process.env.APPLE_TEAM_ID) {
        console.log('Skipping notarization: APPLE_ID / APPLE_APP_SPECIFIC_PASSWORD / APPLE_TEAM_ID not set.');
        return;
    }

    await notarize({
        appBundleId: 'com.whisper.app',
        appPath,
        appleId: process.env.APPLE_ID,
        appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
        teamId: process.env.APPLE_TEAM_ID,
    });

    console.log(`Successfully notarized ${appName}`);
};
