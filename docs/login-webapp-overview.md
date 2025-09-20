# Desktop ↔ Web Login & Preset Data Flow

This note explains how the Electron desktop app boots, how the bundled Next.js web experience is started, and how authentication data flows between the two. It also captures the goal of treating the embedded web app as an authenticated dashboard: every signed-in user starts from the seeded default presets but can create and edit their own copy without leaking data to other accounts. The flow also covers what happens when the user logs out from the Settings view.

## 1. Desktop App Startup (`npm start` at repo root)

- **Script**: `npm start` runs `npm run build:renderer && electron .` (`package.json`).
- **Renderer build**: `build.js` bundles `src/ui/app/HeaderController.js` and `src/ui/app/PickleGlassApp.js` into `public/build` via esbuild so the renderer windows have fresh assets.
- **Electron bootstrap**: `electron .` invokes `src/index.js`.
    - Loads environment (`dotenv`), handles Squirrel startup, registers the custom `pickleglass://` protocol in dev, and wires up global services.
    - Imports and initializes `databaseInitializer` (`src/features/common/services/databaseInitializer.js`) which connects the local SQLite database via `sqliteClient`, creates/updates tables, and seeds default presets tied to `sqliteClient.defaultUserId = 'default_user'` (`src/features/common/services/sqliteClient.js`).
    - Registers IPC handlers and feature bridges (`src/bridge/featureBridge.js`) so renderers can start auth, request presets, etc.
    - Calls `createWindows()` (`src/window/windowManager.js`) once the app is ready; this instantiates the main UI window and the Settings window as needed.
    - Hooks `setupWebDataHandlers()` (`src/index.js:348`) so IPC traffic from the local web backend can invoke repositories inside the main process.

## 2. Local Web Stack (`pickleglass_web`)

- **Build entry point**: `npm run build` under `pickleglass_web` performs `npm run build:backend && next build` (`pickleglass_web/package.json`).
    - `build:backend` transpiles the Express IPC bridge under `backend_node` (TypeScript → JavaScript) so the desktop app can import it.
    - `next build` compiles the Next.js frontend that renders the personalization page and other web views loaded inside the desktop app’s embedded browser.
- **Runtime**: When the desktop app boots, it spawns the express server defined in `pickleglass_web/backend_node/index.ts`.
    - Middleware `identifyUser` (`pickleglass_web/backend_node/middleware/auth.ts`) copies the `X-User-ID` header into `req.uid` (defaulting to `'default_user'` if missing).
    - Each API route (e.g., `/api/presets`, `/api/user`) forwards requests to the Electron main process via `ipcRequest` (`pickleglass_web/backend_node/ipcBridge.ts`). The payload envelope includes `{ __uid: req.uid, data }` so the main process knows which user the request is about.
    - **Preset requirement**: the Web dashboard should be usable only after authentication. When the Next.js frontend supplies a valid `X-User-ID`, responses must merge the default templates (seeded for `default_user`) with that user’s personal presets. If no user is authenticated, the route falls back to the default catalog.

## 3. Sign-In Flow (Desktop ↔ Hosted Web)

1. **User action**: In the renderer, components such as `AuthHeader` (`src/ui/app/AuthHeader.js`) call `window.api.common.startWebappAuth()` when the user taps “Open browser to login”.
2. **IPC bridge**: `featureBridge` wires `start-webapp-auth` to `authService.startWebappAuthFlow()` (`src/bridge/featureBridge.js`).
3. **Remote session**: `authService` (`src/features/common/services/authService.js`) hits `${API_BASE_URL}/api/auth/session/init` to mint a temporary session, then opens the external browser to `${API_BASE_URL}/session/<uuid>`.
4. **Callback**: After the hosted web app completes login, it deep-links back to the desktop client via `pickleglass://auth-success?...`. `src/index.js` parses the URL (`handleWebappAuthCallback`) and hands control to `authService.signInWithSession(...)`.
5. **Validation + persistence**: `authService` either trusts the returned user info or calls the remote `/api/auth/session/:uuid` + `/api/auth/user-by-session/:uuid` endpoints, then:
    - Ensures the user exists in SQLite (`userRepository.findOrCreate`),
    - Sets `currentUserId`, `currentUserMode = 'webapp'`, and caches the profile in `electron-store`,
    - Ends stale sessions (`sessionRepository.endAllActiveSessions()`),
    - Broadcasts the new user state via `window.webContents.send('user-state-changed', ...)` and syncs `localStorage.pickleglass_user` in the embedded web views.
6. **Local API headers**: The Next.js frontend reads `localStorage.pickleglass_user` and adds `X-User-ID` on every request (`pickleglass_web/utils/api.ts:getApiHeaders`). The local backend passes that UID along in the IPC envelope, but the main process ultimately scopes DB queries by calling `authService.getCurrentUserId()`.

## 4. Preset Data Rules

- **Default presets**: Seeded in SQLite on startup (`src/features/common/services/sqliteClient.js:224`). All are stored with `uid = 'default_user'` and `is_default = 1` so every account begins with the same baseline.
- **Custom presets**: Created via `presetRepository.create` (`src/features/common/repositories/preset/sqlite.repository.js`) with the signed-in user’s UID and flagged `is_default = 0`. These rows must remain private to that UID but still show up alongside the defaults in the authenticated dashboard.
- **Web app exposure**: `pickleglass_web/backend_node/routes/presets.ts` proxies to `ipcRequest(..., 'get-presets')`. The main process is responsible for scoping the query so authenticated users receive `[defaults + their presets]`, while unauthenticated requests fall back to the default catalog only.

## 5. Logout Flow (Settings View)

1. **User click**: Inside the desktop Settings view (`src/ui/settings/SettingsView.js`), clicking “Logout” invokes `handleFirebaseLogout()`.
2. **Renderer → main**: The handler sets `isLoggingOut = true` for UI feedback and calls `window.api.settingsView.firebaseLogout()` (exposed in `src/preload.js`).
3. **IPC handler**: `featureBridge` attaches `ipcMain.handle('firebase-logout', ...)` to `authService.signOut()` (`src/bridge/featureBridge.js`).
4. **Main process cleanup**: `authService.signOut()` (`src/features/common/services/authService.js:280`):
    - Ends active recording/LLM sessions via `sessionRepository.endAllActiveSessions()`,
    - Resets `currentUser`, `currentUserId`, `currentUserMode` to unauthenticated defaults, clears cached session info, and updates model state,
    - Broadcasts the anonymous user state so renderers clear `localStorage.pickleglass_user` and UI components revert to logged-out mode.
5. **Post-logout UI**: `SettingsView` listens for future `user-state-changed` events to turn off the loading indicator and hide the user’s custom presets. The personalize link keeps working, but the embedded dashboard shows only the default catalog until the user signs back in.

## 6. What to Verify When Tightening Preset Access

- `/api/presets` (served by the Next.js runtime) should yield `[defaults + user presets]` when the request includes a valid authenticated UID, and only the defaults otherwise.
- The desktop app should still leverage full CRUD on presets via `settingsService` → `settingsRepository` because it runs in the trusted Electron main process.
- Regression tests should cover:
    - Signing in, creating a custom preset, then reloading the Next.js page: the new preset must appear for that account and remain invisible when another account signs in.
    - Logging out from SettingsView: confirm `user-state-changed` broadcasts show `isLoggedIn: false`, and `localStorage.pickleglass_user` is either cleared or contains `uid: null`.

This flow keeps identity management anchored in the Electron main process while allowing the embedded dashboard to personalize based on login state, showing each user their defaults plus their own activity.

What is working: it walks through the end-to-end flows that actually run today—desktop npm start build + bootstrap, the pickleglass_web build/runtime, how authService runs the deep-link login, how state is persisted/broadcast, how headers/IPCs move the UID, and how SettingsView triggers logout and resets state. Those sections describe the current, functioning behavior.

What still needs tightening: ensure `/api/presets` and the IPC plumbing actually scope by UID so one user never sees another user’s activity, and make sure every call path enforces authentication before exposing the dashboard.

## 7. File Map

- `build.js` — orchestrates the renderer bundle used by Electron windows (root `build.js`).
- `package.json` — desktop scripts and dependencies; `npm start` entry point (`package.json`).
- `src/index.js` — Electron main process bootstrap; registers protocols, IPC handlers, windows (`src/index.js`).
- `src/bridge/featureBridge.js` — IPC layer exposing auth/preset actions to renderers (`src/bridge/featureBridge.js`).
- `src/features/common/services/authService.js` — manages sign-in/out, session validation, state broadcast (`src/features/common/services/authService.js`).
- `src/features/common/services/sqliteClient.js` — SQLite connection, schema sync, default preset seeding (`src/features/common/services/sqliteClient.js`).
- `src/features/common/services/databaseInitializer.js` — entry for DB migrations and initialization (`src/features/common/services/databaseInitializer.js`).
- `src/features/common/repositories/preset/sqlite.repository.js` — preset CRUD scoped to current user (`src/features/common/repositories/preset/sqlite.repository.js`).
- `src/features/settings/repositories/sqlite.repository.js` — settings-layer preset access (desktop UI) (`src/features/settings/repositories/sqlite.repository.js`).
- `src/ui/app/AuthHeader.js` — renderer component that triggers login flow (`src/ui/app/AuthHeader.js`).
- `src/ui/settings/SettingsView.js` — Settings UI handling logout and personalize links (`src/ui/settings/SettingsView.js`).
- `src/preload.js` — exposes `window.api` bridges (login/logout, settings) (`src/preload.js`).
- `pickleglass_web/package.json` — Next.js + backend build scripts for the bundled web app (`pickleglass_web/package.json`).
- `pickleglass_web/backend_node/index.ts` — Express server mounting `/api` routes bridged to Electron (`pickleglass_web/backend_node/index.ts`).
- `pickleglass_web/backend_node/middleware/auth.ts` — applies `X-User-ID` header to requests (`pickleglass_web/backend_node/middleware/auth.ts`).
- `pickleglass_web/backend_node/ipcBridge.ts` — forwards backend requests to Electron main via IPC (`pickleglass_web/backend_node/ipcBridge.ts`).
- `pickleglass_web/backend_node/routes/presets.ts` — HTTP API for presets; must enforce auth and return defaults plus the requesting user’s presets (`pickleglass_web/backend_node/routes/presets.ts`).
- `pickleglass_web/utils/api.ts` — client helper adding `X-User-ID` header in web views (`pickleglass_web/utils/api.ts`).
- `pickleglass_web/app/personalize/page.tsx` — Next.js personalize UI consuming `/api/presets` (`pickleglass_web/app/personalize/page.tsx`).
