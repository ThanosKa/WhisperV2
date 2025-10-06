# Dev Mock Mode (UI without Electron/IPC)

This enables working on the Next.js UI with `npm run dev` (no Electron, no IPC, no local API). Auth is faked and API calls are served from local mock data so you can iterate on visuals and flows quickly.

## TL;DR

- Add/keep `NEXT_PUBLIC_DEV_MOCK=1` in `pickleglass_web/.env.local`.
- Run: `cd pickleglass_web && npm run dev` → open `http://localhost:3000`.
- You are auto “logged in” as a mock user and see fake sessions/presets.
- No Electron/IPC required; all data is local and persistent in `localStorage`.

## Toggles

- Env: `NEXT_PUBLIC_DEV_MOCK=1` (default in `.env.local`).
- URL: `/?dev=1` to enable, `/?dev=0` to disable (stored in `localStorage.dev_mock`).
- LocalStorage: set `localStorage.dev_mock = '1'` (or `'0'`).

## What Changed (by file)

- `pickleglass_web/utils/devMock.ts` (new)
    - `isDevMockEnabled()` — reads env/URL/localStorage to decide dev mode.
    - Seeds mock user, presets, sessions, and per-session details to `localStorage`.
    - Helpers to get/set presets, sessions, and session details.
    - Keys used:
        - `dev_mock_presets`, `dev_mock_sessions`, `dev_mock_session_details_<id>`, `dev_mock_api_key`, `dev_mock_init`.

- `pickleglass_web/utils/auth.ts`
    - If dev mode is enabled, short-circuits auth:
        - Sets mock user in `localStorage.whisper_user`.
        - Returns authenticated state immediately (no redirects, no network).

- `pickleglass_web/utils/api.ts`
    - If dev mode is enabled:
        - Never calls network. `apiCall()` throws to guard accidental fetches.
        - All data methods return local mock data (sessions, presets, stats, details, CRUD, search, API key status/save, batch).
        - Emits `window` events like `sessionUpdated` and `presetUpdated` for UI refreshes.
        - Skips trying to read `/runtime-config.json`.

- `pickleglass_web/components/AuthGuard.tsx`
    - In dev mode, bypasses checks and renders children immediately.

- `pickleglass_web/app/page.tsx`
    - In dev mode, redirects directly to `/personalize` for a quick landing.

- `pickleglass_web/app/login/page.tsx`
    - In dev mode, does not attempt Electron sync or fetch `/runtime-config.json`.

- `pickleglass_web/.env.local` (new)
    - `NEXT_PUBLIC_DEV_MOCK=1` to enable mock mode by default during `npm run dev`.

## How It Works

- Mock user: `{ uid: 'dev_user', display_name: 'Dev User', email: 'dev@example.com' }`.
- Mock data is deterministic and persisted in `localStorage` so page reloads keep state.
- Presets CRUD and Sessions CRUD update the local stores and trigger UI refresh events.

## Disable / Re-enable

- Disable for a session:
    - Visit `http://localhost:3000/?dev=0`, or
    - Remove `NEXT_PUBLIC_DEV_MOCK` from `.env.local` and restart `npm run dev`.
- Re-enable later:
    - Visit `/?dev=1`, or
    - Restore `NEXT_PUBLIC_DEV_MOCK=1` and restart.

## Notes

- Production/Electron flows are untouched. Dev mode is opt‑in and only affects Next dev builds.
- If you ever see a transient Next.js HMR error like “reading 'call'”, do a hard refresh or restart dev (`rm -rf .next && npm run dev`).

## Typical Dev Loop

1. `cd pickleglass_web`
2. Ensure `.env.local` has `NEXT_PUBLIC_DEV_MOCK=1`
3. `npm run dev`
4. Edit UI, refresh browser — you’ll see changes immediately with fake data.
