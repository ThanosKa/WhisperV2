const { notarize } = require('@electron/notarize');
require('dotenv').config();

module.exports = async function notarizeApp(context) {
    if (context.electronPlatformName !== 'darwin') {
        return;
    }

    const { appOutDir } = context;
    const appName = context.packager.appInfo.productFilename;

    // Debug: Log full context
    console.log('=== Notarization Debug ===');
    console.log('appOutDir:', appOutDir);
    console.log('appName:', appName);
    console.log('Platform:', context.electronPlatformName);
    console.log('========================');

    // For universal builds, afterSign runs multiple times - only notarize the final universal app
    if (!appOutDir.includes('universal') || appOutDir.includes('temp')) {
        console.log('Skipping notarization - not the final universal build');
        return;
    }

    const appPath = `${appOutDir}/${appName}.app`;

    console.log('Final appPath:', appPath);
    console.log('APPLE_ID:', process.env.APPLE_ID ? 'SET' : 'NOT SET');
    console.log('APPLE_APP_SPECIFIC_PASSWORD:', process.env.APPLE_APP_SPECIFIC_PASSWORD ? 'SET' : 'NOT SET');
    console.log('APPLE_TEAM_ID:', process.env.APPLE_TEAM_ID || 'NOT SET');

    // Check if app exists
    const fs = require('fs');
    if (!fs.existsSync(appPath)) {
        console.log('App does not exist yet, waiting...');
        // Wait a bit for the universal build to complete
        await new Promise(resolve => setTimeout(resolve, 5000));
    }

    console.log('appPath exists:', fs.existsSync(appPath));
    if (fs.existsSync(appPath)) {
        console.log('appPath is directory:', fs.statSync(appPath).isDirectory());
    }

    if (!process.env.APPLE_ID || !process.env.APPLE_APP_SPECIFIC_PASSWORD || !process.env.APPLE_TEAM_ID) {
        console.log('Skipping notarization: APPLE_ID / APPLE_APP_SPECIFIC_PASSWORD / APPLE_TEAM_ID not set.');
        return;
    }

    if (!fs.existsSync(appPath)) {
        throw new Error(`App not found at ${appPath}`);
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
