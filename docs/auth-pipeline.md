# Authentication Pipeline (Updated 2025)

## Overview

Single-user auth per app instance. Desktop owns state via authService; webapp syncs via localStorage injection and API fetches. Flow: UI trigger → remote session init → browser sign-in → deep link callback → validate & persist → broadcast to windows. Data scoped to authService.currentUserId in repos (ignores API headers). Dev mock bypasses for UI testing.

## Desktop Auth Flow

1. **UI Trigger**: Renderer calls `window.api.common.startWebappAuth()` → IPC `start-webapp-auth` → authService.startWebappAuthFlow() (src/bridge/featureBridge.js:46, src/features/common/services/authService.js:211).

2. **Session Init**: POST `${API_BASE_URL}/api/auth/session/init` → { success, data: { session_uuid } } (authService.js:215).

3. **Browser Sign-In**: Opens `${API_BASE_URL}/session/<uuid>` for Clerk flow (authService.js:235).

4. **Deep Link Callback**: Browser navigates `whisper://auth-success?sessionUuid=<uuid>&uid=<id>&email=<email>&displayName=<name>` (or alias ://login). Handled in src/index.js:515 → handleWebappAuthCallback → signInWithSession(sessionUuid, userInfo) (index.js:572-645)..

5. **Validation**: If no userInfo in link, GET `/api/auth/session/<uuid>` (status: authenticated), then GET `/api/auth/user-by-session/<uuid>` → transform Clerk profile to { uid, displayName, email, plan, apiQuota } (authService.js:20 validateSession).

6. **Persist & Set State**: handleUserSignIn(userProfile, sessionUuid): Set currentUserId = uid, currentUserMode = 'webapp', sessionUuid; Persist to electron-store ('auth-session'); Sync to SQLite via userRepository.findOrCreate; End prior sessions; Init encryption key; Update model/plan/quota (authService.js:119-165).

7. **Broadcast**: broadcastUserState(): Emit 'user-state-changed' to all windows with { uid, email, displayName, plan, mode: 'webapp', isLoggedIn: true, sessionUuid }; Inject localStorage.whisper_user = { uid, display_name, email }; Dispatch 'userInfoChanged' event (authService.js:294).

## Webapp Integration

- **useAuth Hook** (webapp/utils/auth.ts:1-162): Detects Electron via /runtime-config.json. In Electron: Fetch /api/user/profile to set/overwrite localStorage.whisper_user (server-authoritative). Dev mock: Fake user, skip checks. Web mode: Use localStorage or fetch profile.

- **AuthGuard** (components/AuthGuard.tsx:8-68): Wraps routes (via ClientLayout.tsx). Blocks !user || !uid; In Electron, also blocks 'default_user' → redirect /login. Loading spinner during checks.

- **Home Redirect** (app/page.tsx:1-71): In Electron + authenticated (non-default_user) → /personalize; Else /login. Dev mock → /personalize.

- **Login Page** (app/login/page.tsx:9-165): Sync button fetches /api/user/profile, sets localStorage if in Electron.

## Local API & Data Scoping

- **Frontend Headers**: api.ts:178-200 sets X-User-ID from localStorage.whisper_user.uid on all /api calls.

- **Backend Middleware**: backend_node/middleware/auth.ts:3-13: identifyUser sets req.uid = X-User-ID or 'default_user'.

- **IPC Bridge**: backend_node/ipcBridge.ts:4-35: ipcRequest emits 'web-data-request' with payload + \_\_uid = req.uid.

- **Electron Handling**: src/index.js:348,528 setupWebDataHandlers listens, calls repos with authService.getCurrentUserId() (ignores \_\_uid). E.g., preset repo (src/features/common/repositories/preset/index.js:1-36): uid = authService.getCurrentUserId(); Queries defaults + user presets (sqlite.repository.js:1-97 joins on uid).

- **Repos Examples**:
    - Sessions/User: Scope to currentUserId (repositories/session/index.js, user/index.js).
    - Defaults: Fallback to 'default_user' for unauth (e.g., presets show defaults only).

## Sign-Out

- UI calls window.api.common.firebaseLogout() → IPC firebase-logout → authService.signOut(): Clear currentUser/sessionUuid/mode; Delete electron-store 'auth-session'; End active sessions; Broadcast 'user-state-changed' { isLoggedIn: false }; Remove localStorage.whisper_user; Reload windows (bridge/featureBridge.js:47, authService.js:280).

## Key Code Snippets

**Deep Link Handler** (src/index.js:572-645):

```js
async function handleWebappAuthCallback(params) {
    const { sessionUuid, uid, email, displayName } = params;
    const userInfo = { uid, email, displayName: displayName || '' };
    try {
        await authService.signInWithSession(sessionUuid, userInfo);
        // Broadcast and inject
    } catch (error) {
        /* log */
    }
}
```

**Repo Scoping** (preset/index.js:11-36):

```js
getPresets: () => {
  const uid = authService.getCurrentUserId();
  return getBaseRepository().getPresets(uid);  // Ignores API __uid
},
```

**useAuth Electron Sync** (utils/auth.ts:57-75):

```js
if (isElectronMode) {
    const apiUser = await getUserProfile(); // /api/user/profile
    if (apiUser && apiUser.uid) {
        setUserInfo(profile, true); // Overwrite localStorage
    }
}
```

## Troubleshooting

- **Logs**: [AuthService] in authService.js; [API] in backend_node routes; Check electron-store 'auth-session'.
- **Default User Redirects**: In Electron, AuthGuard blocks 'default_user' → Ensure login flow or /login sync.
- **Stale localStorage**: Windows reload on broadcast; Fetch /api/user/profile in useAuth overwrites.
- **Deep Link Fails**: Validate sessionUuid always; Mismatch uid from link vs API → sign-in fails.
- **Unauth Data**: Repos fallback to defaults; No cross-user access (ownership checks in session ops).
- **Dev**: NEXT_PUBLIC_DEV_MOCK=1 bypasses; Fake user in localStorage.

For solo dev: Auth is robust, single-source (authService). Test: Login → Check broadcast/logs → API calls scoped correctly (e.g., presets). Edge: External browser needs /login sync.
