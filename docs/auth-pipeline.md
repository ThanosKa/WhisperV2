# Authentication & Identity Pipeline

This document explains how authentication works end-to-end across the desktop app (Electron), the hosted web app, and the local web stack. It includes the files involved, requests sent/received, and how the app determines “which user is who”.

## Summary

- Desktop initiates auth by creating a temporary web session, then opens the browser for sign‑in.
- The web app completes sign‑in and calls back via a custom deep link: `pickleglass://auth-success?...`.
- Electron validates the session (or consumes user info) and sets the current user in `authService`.
- The main process broadcasts user state and injects user info into renderer `localStorage`.
- The local frontend adds an `X-User-ID` header for API calls; the local backend receives it but ultimately the main process queries data using its own `authService` user state.

## Key Files

- Custom URL + Deep link handler: `src/index.js:480` (see `handleCustomUrl`, `handleWebappAuthCallback`)
- Auth service (flows, persistence, user state):
  - `src/features/common/services/authService.js:20` (`validateSession`)
  - `src/features/common/services/authService.js:211` (`startWebappAuthFlow`)
  - `src/features/common/services/authService.js:249` (`signInWithSession`)
  - `src/features/common/services/authService.js:294` (`broadcastUserState`)
- IPC bridge to start auth from UI: `src/bridge/featureBridge.js:46` (`start-webapp-auth`)
- Renderer env exposure: `src/preload.js:15` (`API_BASE_URL`)
- Frontend adds identity header: `pickleglass_web/utils/api.ts:171` (`X-User-ID`)
- Local backend reads identity header: `pickleglass_web/backend_node/middleware/auth.js:1` (`identifyUser`)
- Local backend → main process IPC: `pickleglass_web/backend_node/ipcBridge.js:1` (`ipcRequest`)
- Repositories use main `authService` identity:
  - Sessions: `src/features/common/repositories/session/index.js:1`
  - Users: `src/features/common/repositories/user/index.js:1`

## Desktop → Web Sign‑In Flow

1) Start auth from UI
- Renderer calls `window.api.common.startWebappAuth()` → `ipcMain` `start-webapp-auth` → `authService.startWebappAuthFlow()`
- File: `src/bridge/featureBridge.js:46`

2) Create temporary session on the web
- POST to remote web app: `POST ${API_BASE_URL}/api/auth/session/init`
- Headers: `Content-Type: application/json`
- Response (example):
  ```json
  { "success": true, "data": { "session_uuid": "<uuid>" } }
  ```
- File: `src/features/common/services/authService.js:215`

3) Open browser to complete sign‑in
- The app opens: `${API_BASE_URL}/session/<session_uuid>`
- File: `src/features/common/services/authService.js:235`

4) Web app calls back via deep link
- On success the browser navigates: `pickleglass://auth-success?sessionUuid=<uuid>&uid=<id>&email=<email>&displayName=<name>`
- Example from logs:
  - Action: `auth-success`
  - Params:
    ```json
    {
      "sessionUuid": "c5424da2-acff-4b1f-9f00-112fd07af39e",
      "uid": "user_32ZOTgz9LOujkBegz7APwtVsxfN",
      "email": "thakawork2@gmail.com",
      "displayName": "thanos ka"
    }
    ```
- File: `src/index.js:515` (dispatch) → `handleWebappAuthCallback`

## Session Validation + User Profile

On deep link, the main process handles auth in one of two ways:

- If deep link included user fields: `authService.signInWithSession(sessionUuid, userInfo)` uses those values.
- Otherwise it validates via the remote API:
  1) `GET ${API_BASE_URL}/api/auth/session/<session_uuid>` → `{"success":true,"data":{"status":"authenticated"}}`
  2) `GET ${API_BASE_URL}/api/auth/user-by-session/<session_uuid>` → Clerk user profile; transformed to local shape:
     - Input (Clerk-ish): `{ id|uid, displayName|fullName|firstName, email|primaryEmailAddress.emailAddress, plan, apiQuota }`
     - Output (local): `{ uid, displayName, email, plan, apiQuota }`

Files:
- `validateSession`: `src/features/common/services/authService.js:20`
- `signInWithSession`: `src/features/common/services/authService.js:249`

## Persisting + Broadcasting User State

After successful sign‑in:

- `authService.handleUserSignIn()` sets:
  - `currentUserId = user.uid`, `currentUserMode = 'webapp'`, `sessionUuid = <uuid>`
  - Persists to `electron-store` (`auth-session`) and ensures the user exists in SQLite
  - Ends any previous active sessions for data consistency
  - Initializes encryption key for the user, then updates model plan/quota state
- `authService.broadcastUserState()`:
  - Sends `'user-state-changed'` to all windows with:
    ```json
    { "uid": "...", "email": "...", "displayName": "...", "plan": "...", "mode": "webapp", "isLoggedIn": true, "sessionUuid": "..." }
    ```
  - Injects renderer `localStorage.pickleglass_user = { uid, display_name, email }` and fires `window.dispatchEvent(new Event('userInfoChanged'))`.

Files:
- `src/features/common/services/authService.js:134` (handleUserSignIn)
- `src/features/common/services/authService.js:294` (broadcastUserState)

## Local Frontend → Local Backend Identity

- Frontend attaches identity header on every API call:
  - Header: `X-User-ID: <uid>`
  - Where it comes from: `localStorage.pickleglass_user.uid`
  - File: `pickleglass_web/utils/api.ts:171` (`getApiHeaders`)

- Local backend middleware records the identity:
  - `identifyUser` reads `X-User-ID` and sets `req.uid` (default `default_user` if missing)
  - File: `pickleglass_web/backend_node/middleware/auth.js:1`

- For all local API routes, the backend forwards requests to the main process via IPC:
  - `ipcRequest(req, channel, payload)` emits `web-data-request` and awaits a `responseChannel`
  - File: `pickleglass_web/backend_node/ipcBridge.js:1`

- The main process repositories do not trust the header; they query using the current user from `authService`:
  - Sessions: `src/features/common/repositories/session/index.js:1` (injects `authService.getCurrentUserId()`)
  - Users: `src/features/common/repositories/user/index.js:1`

This means “who the user is” is ultimately governed by the Electron main process `authService` state, not by the HTTP header.

## Renderer Usage Examples

- Read current user state: `window.api.common.getCurrentUser()`
- React to updates: subscribe to `'user-state-changed'` in renderer
- Fetch remote plan/quota to show in UI (uses remote API_BASE_URL):
  - `src/ui/app/MainHeader.js:308`
  - `src/ui/plan/PlanView.js:74`

## Requests Sent + Responses Received

Remote (hosted web app):
- POST `/api/auth/session/init` → `{ success, data: { session_uuid } }`
- GET `/api/auth/session/:session_uuid` → `{ success, data: { status } }`
- GET `/api/auth/user-by-session/:session_uuid` → `{ success, data: <user_profile> }`

Local (frontend → backend on localhost):
- All `/api/**` calls include header: `X-User-ID: <uid>`
- Middleware sets `req.uid` but IPC handlers use `authService.getCurrentUserId()` in the main process for DB operations.

## Deep Link Formats

- Success: `pickleglass://auth-success?sessionUuid=<uuid>&uid=<id>&email=<email>&displayName=<name>`
- Also accepted alias: `pickleglass://login?...` (handled the same way)
- Handler switch: `src/index.js:515` → `handleWebappAuthCallback`

## Sign‑Out

- Renderer calls `window.api.common.firebaseLogout()` → main clears user state, ends active sessions, removes `pickleglass_user` from renderer storage
- Files:
  - `src/bridge/featureBridge.js:47` → `authService.signOut()`
  - `src/features/common/services/authService.js:280` (`signOut`)

## Configuration

- Remote web app base URL: `process.env.API_BASE_URL` exposed to renderer via `preload.js`
- In development (if unset): defaults to `http://localhost:3000` for session/init and `https://www.app-whisper.com` for some UI fetches

## Security Considerations

- Deep link trust: `handleWebappAuthCallback` passes `userInfo` from the deep link to `signInWithSession`. If `userInfo` is provided, `signInWithSession` does not necessarily validate the session with the server.
  - Recommendation: Always validate `sessionUuid` with the web app, then fetch the authoritative profile and ensure the UID matches before finalizing sign‑in.
- Local API header: `X-User-ID` can be spoofed by other software on localhost; however, the main process ignores this for DB authorization and uses its own `authService` state instead. Keep it this way unless you introduce remote/local separation.
- CORS is limited to the local frontend origin; avoid broadening allowed origins.

## Troubleshooting

- Look for logs:
  - `[Protocol]`, `[Custom URL]` in `src/index.js`
  - `[AuthService]` in `src/features/common/services/authService.js`
  - `[API]` in local backend routes under `pickleglass_web/backend_node`
- Verify persistence: `electron-store` name `auth-session` stores `sessionUuid` and `userProfile`.
- Programmatic checks:
  - `authService.isAuthenticated()` returns true when mode is `webapp` and a user is set
  - `authService.getCurrentUser()` includes `{ uid, email, displayName, plan, isLoggedIn, sessionUuid }`

---

This pipeline ensures identity flows from the hosted sign‑in to the Electron main process and then down to the local UI and API stack, with the main process as the single source of truth for “who the user is”.

