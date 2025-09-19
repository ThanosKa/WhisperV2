# Desktop ↔ Local Webapp Connection & Auth

This document maps the end-to-end flow between the Electron desktop app and the local web server (frontend + API), with special focus on authentication, route guards, and the “refresh redirects to /login” behavior.

## Big Picture

- Electron app boots two local servers on random free ports:
  - Frontend (static Next.js build): `http://localhost:<frontendPort>`
  - API (Express): `http://localhost:<apiPort>`
- Electron also serves a runtime config file at the frontend path `/runtime-config.json` so the web UI can discover `API_URL` at runtime.
- The web UI calls the local API. The API converts requests into IPC calls to Electron main using an in-memory EventEmitter bridge and forwards back the result.
- Authentication is owned by the Electron app via an external web-auth flow. After login, Electron injects the user into `localStorage` in Electron windows so the web UI knows the user. External browsers do not receive this injection.


## Components & Responsibilities

- Electron main
  - Starts frontend and API servers, creates and serves `/runtime-config.json`.
  - Hosts the IPC event bridge for API→main requests.
  - Owns the real auth state and validates sessions against the external webapp.
  - Broadcasts user state to Electron windows and injects `localStorage`.
- Local API (Express)
  - Adds `req.uid` from `X-User-ID` header or falls back to `'default_user'`.
  - Forwards requests via IPC to Electron main, including the `uid`.
- Web UI (Next.js build)
  - Detects Electron mode by fetching `/runtime-config.json`.
  - Reads `localStorage.pickleglass_user` to set `X-User-ID` on API calls.
  - `AuthGuard` blocks unauthenticated or `'default_user'` in Electron mode and redirects to `/login`.
- SQLite + Repositories
  - DB is local-first, initializes `'default_user'` and seeded presets.
  - Most repositories read/write under the request-scoped `uid`.


## Startup & Server Wiring

- Port allocation and env propagation
  - src/index.js:671
  - src/index.js:676
  - src/index.js:678

- Runtime config creation and serving under the frontend server
  - src/index.js:703
  - src/index.js:710
  - src/index.js:718

- Frontend and API server startup
  - src/index.js:734
  - src/index.js:742

- API app wiring (CORS for web url, middleware, routes)
  - pickleglass_web/backend_node/index.ts:1


## Web UI → API → Electron Main

- Web UI API client resolves `API_URL` from `/runtime-config.json` and sets `X-User-ID` from `localStorage.pickleglass_user`.
  - pickleglass_web/utils/api.ts:86
  - pickleglass_web/utils/api.ts:157

- API middleware sets `req.uid` using header or `'default_user'` fallback.
  - pickleglass_web/backend_node/middleware/auth.ts:1

- IPC bridge wraps the request with `__uid` and emits to Electron main.
  - pickleglass_web/backend_node/ipcBridge.ts:4

- Electron main receives and scopes the request to the effective uid, calls repositories, and replies.
  - src/index.js:348
  - src/index.js:528


## Desktop Authentication Flow (Source of Truth)

1) User clicks login in the desktop header (Electron window)
- UI triggers `startWebappAuth` via IPC.
  - src/ui/app/AuthHeader.js:1
  - src/bridge/featureBridge.js:45

2) Electron auth service creates a session with the remote webapp and opens the system browser to sign in
- src/features/common/services/authService.js:1

3) Deep-link callback received (`pickleglass://auth-success?sessionUuid=...&uid=...`)
- Electron main validates the session against the remote webapp, transforms the user, stores session/user (electron-store), sets current user, and broadcasts.
  - src/index.js:581
  - src/features/common/services/authService.js:250

4) Broadcast and localStorage injection into Electron windows
- Electron sends `user-state-changed` and, if logged in, writes `localStorage.pickleglass_user` inside the Electron BrowserWindow, then dispatches `userInfoChanged`.
  - src/features/common/services/authService.js:334


## Web UI Auth Logic & Guard

- Electron mode detection and auth resolution
  - Fetches `/runtime-config.json`; if present, it’s Electron mode.
  - Reads `localStorage.pickleglass_user` first; falls back to `/api/user/profile` when empty.
  - pickleglass_web/utils/auth.ts:1

- Route guard
  - Blocks unauthenticated users.
  - In Electron mode, also blocks `'default_user'` explicitly, redirecting to `/login`.
  - pickleglass_web/components/AuthGuard.tsx:1
  - Wrapped globally in ClientLayout except `/login`.
  - pickleglass_web/components/ClientLayout.tsx:1

- Home route
  - In Electron mode: if `user.uid !== 'default_user'`, go to `/personalize`; otherwise to `/login`.
  - pickleglass_web/app/page.tsx:1


## Why “refreshing /personalize redirects to /login” in a browser

- The desktop injects `localStorage.pickleglass_user` only in Electron BrowserWindows.
- When you open `http://localhost:<frontendPort>/personalize` in your system browser and refresh:
  - There is no `localStorage.pickleglass_user` in that browser. No `X-User-ID` header is sent.
  - The API middleware sets `req.uid = 'default_user'`.
  - The `AuthGuard` sees `'default_user'` in Electron mode and redirects to `/login`.
- This is expected with the current design unless the `/login` page performs a sync to write `localStorage` in that external browser.


## External Browser vs Electron Window

- Electron window
  - Receives localStorage injection from the desktop after login.
  - Pages won’t redirect (user is present) and API calls carry `X-User-ID`.

- External browser window
  - No injection; you must “sync” from `/login` to fetch `/api/user/profile` and write `localStorage.pickleglass_user`.
  - Opening personalize in an external browser is triggered here:
    - src/window/windowManager.js:427


## Default User & DB Seeding Notes

- SQLite seeds `'default_user'` and default prompt presets.
  - src/features/common/services/sqliteClient.js:1

- Some repos ignore uid for default presets; user-specific ops still rely on request-scoped uid.
  - src/features/settings/repositories/sqlite.repository.js:1


## Key Endpoints & Flows (examples)

- GET `/runtime-config.json` → Returns `{ API_URL, WEB_URL }` (served by desktop frontend server)
- GET `/api/user/profile` → API → IPC → Electron → DB (requires `X-User-ID` header for real user; falls back to `'default_user'`)
- GET `/api/presets` → API → IPC → Electron → reads presets (defaults and user)


## Troubleshooting & Logs

- Seeing `[AuthService] getCurrentUserId() ... default_user`
  - Current code returns `null` for unauthenticated in Electron. If logs show `'default_user'`, it’s likely from request-scoped overrides via IPC or an older build.
- Requests landing as `'default_user'`
  - Check the external browser’s `localStorage.pickleglass_user` and confirm `X-User-ID` header is being set by the web UI.
- Guard redirects unexpectedly
  - In Electron mode, `'default_user'` is blocked by design; perform the login flow in the Electron header or sync on `/login` in the external browser.


## Simplification Options (design choices)

- Make the API return 401 when unauthenticated instead of silently using `'default_user'`.
- Avoid opening external browsers for in-app pages; load personalize/settings inside the Electron window so localStorage injection applies.
- If external browser is required, ensure `/login` always performs a desktop sync step to write `localStorage.pickleglass_user`.
- Consider issuing a local signed cookie from the API so external browser refreshes carry auth without relying on localStorage.


## Source File Reference (quick map)

- Desktop main & servers
  - src/index.js:348, 528, 656–760, 700–740
  - src/window/windowManager.js:427
  - src/bridge/featureBridge.js:45

- Auth service (desktop)
  - src/features/common/services/authService.js:1, 250, 334

- API server (local)
  - pickleglass_web/backend_node/index.ts:1
  - pickleglass_web/backend_node/middleware/auth.ts:1
  - pickleglass_web/backend_node/ipcBridge.ts:4
  - pickleglass_web/backend_node/routes/user.ts:1
  - pickleglass_web/backend_node/routes/presets.ts:1
  - pickleglass_web/backend_node/routes/conversations.ts:1
  - pickleglass_web/backend_node/routes/auth.ts:1

- Web UI (frontend build)
  - pickleglass_web/utils/api.ts:86, 157
  - pickleglass_web/utils/auth.ts:1
  - pickleglass_web/components/AuthGuard.tsx:1
  - pickleglass_web/components/ClientLayout.tsx:1
  - pickleglass_web/app/page.tsx:1
  - pickleglass_web/app/personalize/page.tsx:1

- SQLite & defaults
  - src/features/common/services/sqliteClient.js:1
  - src/features/common/services/databaseInitializer.js:106
  - src/features/settings/repositories/sqlite.repository.js:1


---

Notes

- Do not remove SystemAudioDump integration (src/features/listen/stt/sttService.js) — still required for macOS loopback.
- Model selection and API-key UIs may be simplified since the server owns provider configuration; validate current UX needs before pruning.

