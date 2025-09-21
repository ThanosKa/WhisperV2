# Desktop ↔ Web Login & Dashboard Flow (Post-fix Architecture)

This document explains the current, fixed architecture for how the Electron desktop app boots, how the bundled Next.js dashboard runs, and how authentication is enforced. The key outcome is a reliable single-user dashboard per desktop app instance: switching accounts updates all windows and data is scoped to the active user only.

## 1. Desktop Boot Sequence

- `npm start` runs `npm run build:renderer && electron .`, producing fresh renderer bundles and launching `src/index.js`.
- During startup, the main process
    - Loads environment variables, handles Squirrel specifics, and registers the `pickleglass://` protocol.
    - Initializes the SQLite database through `databaseInitializer`, seeding default presets against `sqliteClient.defaultUserId = 'default_user'`.
    - Wires IPC bridges (`featureBridge`, `windowBridge`) and invokes `setupWebDataHandlers()` so the local web backend can call into repositories.
    - Creates Electron windows via `createWindows()`, which host the embedded web dashboard and settings UI.

## 2. Local Web Stack Runtime

- When the desktop app boots, it also launches an Express server defined in `pickleglass_web/backend_node/index.ts` plus a static Next.js bundle.
- Incoming API requests run through `identifyUser` middleware, which inspects the `X-User-ID` header populated by the web frontend and stores it on `req.uid` (defaulting to `'default_user'`).
- `ipcRequest` in `pickleglass_web/backend_node/ipcBridge.ts` forwards every request to the Electron event bridge by emitting `req.bridge!.emit('web-data-request', channel, responseChannel, payload)`. The Electron main process remains the single source of truth for the current user; per-request UID is not forwarded.

## 3. Authentication Lifecycle

- Renderer components invoke `window.api.common.startWebappAuth()` to begin login. `featureBridge` hands this to `authService.startWebappAuthFlow()`.
- `authService` talks to the remote API (session init and validation) and opens the browser-based Clerk flow. On success the hosted web app deep-links back to `pickleglass://auth-success`, which `src/index.js` handles via `handleWebappAuthCallback`.
- `authService.signInWithSession(...)` persists the user in SQLite (`userRepository.findOrCreate`), records `currentUserId`, saves session data in `electron-store`, ends any active sessions, and becomes the global source of truth for the logged-in user.
- After every login or logout, `BrowserWindow.getAllWindows()` is iterated. Each webview receives JavaScript that writes/removes `localStorage.pickleglass_user`, and then windows are gently reloaded (`reloadIgnoringCache`) to ensure the dashboard fetches data for the active user.

## 4. Request Handling Inside Electron Main

- `setupWebDataHandlers()` listens for `web-data-request` events. Each channel delegates to a repository implementation that depends on `authService.getCurrentUserId()`.
- Repository calls run under the globally active `authService.currentUserId` (single-user semantics). There is no request-scoped override for the user id that initiated the API call.
- Relevant examples (post-fix):
    - `sessionRepository.getAllByUserId()` queries SQLite for the active user.
    - `userRepository.getById()` uses the active user.
    - `presetRepository.getPresets()` (web dashboard): returns defaults + active user’s presets; unauthenticated returns defaults only.
    - `settingsRepository.getPresets()` (SettingsView): returns defaults + active user’s presets.
    - Ownership checks are enforced in `get-session-details`, `update-session-title`, and `delete-session` to block cross-user access.

## 5. Web Frontend Behaviour

- In Electron mode, the Next.js client treats the server as authoritative for identity: it fetches `/api/user/profile` on load to set/overwrite `localStorage.pickleglass_user`. This keeps headers aligned with the Electron active user across tabs.
- `/activity` re-fetches when the active user changes so stale data is cleared on account switch.

## 6. Security & Data Scoping Guarantees

- Single-user per desktop app instance: all requests are scoped to `authService.currentUserId`.
- Presets: web dashboard and SettingsView show defaults + active user’s presets; unauthenticated shows defaults only.
- Sessions: list and details are restricted to the active user; updates/deletes enforce ownership.
- Windows reload on login/logout to eliminate stale identity.

This design delivers a consistent, launch-ready single-user dashboard experience. Users can switch accounts, and the app updates all windows and data to the new user without cross-account leakage.
