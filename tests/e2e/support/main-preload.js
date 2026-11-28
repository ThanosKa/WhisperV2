// Loaded into Electron's main process before the app's own code: with `electron -r <this file> .`
// for the development app, and by tests/e2e/support/packaged-main.js for the packaged app.
// It stands in for the OS boundaries a test cannot rely on: where the profile lives, what macOS
// has allowed, the screen, the microphone, system audio and the update server. The app's code is
// not changed.
const childProcess = require('child_process');
const { app, systemPreferences } = require('electron');

const readEnv = name => {
    const value = process.env[name];
    if (!value) {
        throw new Error(`${name} must be set by the e2e fixture`);
    }
    return value;
};

const userDataDir = readEnv('WHISPER_E2E_USER_DATA');
app.setPath('userData', userDataDir);

// Uncaught exceptions in main: Electron's default is a modal "A JavaScript error occurred in the
// main process" box, which stays on the screen and blocks the app from quitting. Write each one to
// a file in the throwaway profile instead; the fixture fails the test on any line in it.
const fs = require('fs');
const path = require('path');
const mainErrorsFile = path.join(userDataDir, 'e2e-main-errors.log');
process.on('uncaughtException', error => {
    fs.appendFileSync(mainErrorsFile, `${error && error.stack ? error.stack : String(error)}\n---\n`);
});

// macOS permission check: answer for the microphone and the screen without asking the OS.
const realGetMediaAccessStatus = systemPreferences.getMediaAccessStatus.bind(systemPreferences);
systemPreferences.getMediaAccessStatus = mediaType =>
    mediaType === 'microphone' || mediaType === 'screen' ? 'granted' : realGetMediaAccessStatus(mediaType);

// Microphone: Chromium's fake capture device (a steady tone), allowed without a prompt.
app.commandLine.appendSwitch('use-fake-device-for-media-stream');
app.commandLine.appendSwitch('use-fake-ui-for-media-stream');

// Screen: Ask runs `screencapture -x -t jpg <file>`. Copy a fixed image to <file> instead,
// so a test never reads the real screen and the Screenshot window always shows the same picture.
const fakeScreenJpeg = readEnv('WHISPER_E2E_FAKE_SCREEN');
const realExecFile = childProcess.execFile;
childProcess.execFile = function execFile(file, args, ...rest) {
    if (file === 'screencapture' && Array.isArray(args)) {
        const target = args[args.length - 1];
        return realExecFile.call(this, '/bin/cp', [fakeScreenJpeg, target], ...rest);
    }
    return realExecFile.call(this, file, args, ...rest);
};

// System audio: Listen kills every `SystemAudioDump` on the Mac (`pkill -f`), then spawns the
// bundled binary, which records the Mac's audio. Neither may run in a test: the kill could hit the
// owner's real Whisper. The stand-ins are real, harmless processes: `true` for the kill, and a
// silent process for SystemAudioDump that sends no audio and exits when the app exits.
const SILENT_UNTIL_PARENT_EXITS = 'while kill -0 $PPID 2>/dev/null; do sleep 1; done';
const realSpawn = childProcess.spawn;
childProcess.spawn = function spawn(command, args, ...rest) {
    if (command === 'pkill' && Array.isArray(args) && args.includes('SystemAudioDump')) {
        return realSpawn.call(this, '/usr/bin/true', [], ...rest);
    }
    if (typeof command === 'string' && command.endsWith('/SystemAudioDump')) {
        return realSpawn.call(this, '/bin/sh', ['-c', SILENT_UNTIL_PARENT_EXITS], ...rest);
    }
    return realSpawn.call(this, command, args, ...rest);
};

// Updates: a packaged app asks GitHub for a newer release at start, and would download it. A test
// must not reach GitHub, so the check finds nothing. The development app never checks:
// electron-updater skips an app that is not packaged.
if (app.isPackaged) {
    const { autoUpdater } = require('electron-updater');
    autoUpdater.checkForUpdates = async () => null;
    autoUpdater.checkForUpdatesAndNotify = async () => null;
}

// Displays: show the app one display, so the Settings window does not list the monitors that
// happen to be plugged in, and its screenshot is the same on any Mac.
app.whenReady().then(() => {
    const { screen } = require('electron');
    screen.getAllDisplays = () => [screen.getPrimaryDisplay()];
});
