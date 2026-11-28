// The dashboard's Express API, built by `pnpm run build:web` into whisper_web/backend_node/dist
// (CommonJS, no declarations). Main bundles that build; this states the one export main uses.
// 4b-2 replaces it with a Hono app inside main.
declare module '*/whisper_web/backend_node/dist' {
    import type { EventEmitter } from 'node:events';
    import type { Express } from 'express';

    const createBackendApp: (eventBridge: EventEmitter) => Express;
    export default createBackendApp;
}
