// Loaded into Electron's main process with `electron -r <this file> .`, before the app's own code.
// It stands in for the two OS boundaries a test cannot rely on: where the profile lives and
// what macOS has allowed. The app's code is not changed.
const { app } = require('electron');

const userDataDir = process.env.WHISPER_E2E_USER_DATA;
if (!userDataDir) {
    throw new Error('WHISPER_E2E_USER_DATA must be set by the e2e fixture');
}
app.setPath('userData', userDataDir);

// macOS permission check: answer for the microphone and the screen without asking the OS.
const { systemPreferences } = require('electron');
const realGetMediaAccessStatus = systemPreferences.getMediaAccessStatus.bind(systemPreferences);
systemPreferences.getMediaAccessStatus = mediaType =>
    mediaType === 'microphone' || mediaType === 'screen' ? 'granted' : realGetMediaAccessStatus(mediaType);
