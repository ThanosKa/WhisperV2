// Loaded into Electron's main process with `electron -r <this file> .`, before the app's own code.
// It stands in for the OS boundaries a test cannot rely on: where the profile lives, what macOS
// has allowed, the screen, the microphone and system audio. The app's code is not changed.
const childProcess = require('child_process');
const { app, systemPreferences } = require('electron');

const readEnv = name => {
    const value = process.env[name];
    if (!value) {
        throw new Error(`${name} must be set by the e2e fixture`);
    }
    return value;
};

app.setPath('userData', readEnv('WHISPER_E2E_USER_DATA'));

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
