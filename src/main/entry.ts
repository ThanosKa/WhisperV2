import { app } from 'electron';
import { startSingleInstance } from './singleInstance';

// Main's entry (built as out/main/index.js). It loads only Electron until the single-instance lock
// is taken; the app itself (./index) loads after, so a second instance quits before any of it runs.
void startSingleInstance({
    app,
    exit: code => process.exit(code),
    loadApp: () => import('./index'),
}).catch((error: unknown) => {
    // A failing ./index (a bad `.env`, say) stays an uncaught exception, as when it was the entry.
    process.nextTick(() => {
        throw error;
    });
});
