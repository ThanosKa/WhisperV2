import type { App } from 'electron';

// Takes the single-instance lock before the app's modules load, so a second instance quits
// without building the services, opening the stores or parsing `.env`. The app name comes first:
// the lock lives in the userData folder, which the name picks.
export function startSingleInstance({
    app,
    exit,
    loadApp,
}: {
    app: Pick<App, 'setName' | 'requestSingleInstanceLock' | 'quit'>;
    exit: (code: number) => void;
    loadApp: () => Promise<unknown>;
}): Promise<unknown> {
    // Consistent app name so protocol prompts say "Open Whisper" even in dev
    app.setName('Whisper');

    if (!app.requestSingleInstanceLock()) {
        app.quit();
        exit(0);
        return Promise.resolve();
    }

    return loadApp();
}
