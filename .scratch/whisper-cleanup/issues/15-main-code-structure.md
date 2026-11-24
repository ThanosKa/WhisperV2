# Code structure for main and preload

Status: resolved
Type: grilling
Blocked by: 07

## Question

For step 4a of [Order of the work](07-work-order.md) (main + preload to TypeScript): which modules to deepen and where the seams go (services, `windowManager`, the IPC bridges and the shared typed channel contract, repositories over `sqliteClient`, `authService`), how the folders under `src/` are laid out, and how the two default domains (`app-whisper.com` and `www.app-whisper.com`) collapse to one config value. Breaking the 2 import cycles is already decided. Facts: [Electron app inventory](02-electron-inventory.md). Use the `codebase-design` skill.

## Answer

Resolved 2026-11-24 with the owner, using the `codebase-design` skill. Facts: [Electron app inventory](02-electron-inventory.md) and a read of `src/` on 2026-11-24.

**What the code does today (the two import cycles come from here):**
- Services (`askService`, `listenService`, `sttService`, `summaryService`) find windows themselves (`windowPool.get('listen').webContents.send(...)`) and send them messages: that is the 7-module cycle around `windowManager`.
- Each repository has an `index.js` layer that always picks SQLite (the only option since Firebase left) and asks `authService` for the user id: that is the `authService` ↔ user repository cycle.
- Every service is a module-level singleton that `require`s the others, so a test cannot hand it a fake DB or fake windows.
- `internalBridge` is a global `EventEmitter` with string event names, used for window show/hide/move requests.
- The Express backend of the dashboard runs inside main and asks main for data through string `web-data-request` messages.
- `app-whisper.com` answers every request with a 308 to `www.app-whisper.com`.

**Folders** (electron-vite layout): `src/main/`, `src/preload/`, `src/renderer/`, `src/shared/`. Inside `src/main/`, one folder per feature (`ask`, `listen`, `settings`, `shortcuts`, ...) as today.

**Domain:** one `API_BASE_URL` value, default `https://www.app-whisper.com`, env override for local WhisperAPP. Read and validated once in main; preload receives it from main; no other file hard-codes the domain.

**Structure (the seams):**
1. **Dependencies passed in.** Each service is made by a factory, for example `createAskService({ db, llm, windows, currentUser })`, in one startup file (the composition root). No service imports another service or reaches for a global.
2. **Only `windowManager` touches `BrowserWindow`.** Services get a small `windows` dependency (send to a window, show, hide, move). Tests pass a recorder in its place. This breaks the 7-module cycle.
3. **Repositories:** the `index.js` pass-through layer is deleted. One repository per table group over a typed `better-sqlite3` DB; the service passes the user id. Tests use the real DB in memory. This breaks the second cycle.
4. **`auth`:** `authService` shrinks to a small module with four jobs: who is signed in, sign-in from the browser link, sign-out, and a notice when the user changes. Others receive the current user; they do not import `auth`.
5. **IPC contract:** one list in `src/shared/ipc.ts` with each channel's payload and result type and a zod schema; main parses payloads with it. Each feature registers its own channels (`src/main/ask/ipc.ts`, ...); `featureBridge` and `windowBridge` are deleted. Preload exposes typed functions from the same list.
6. **`internalBridge` deleted:** services call the injected `windows` dependency instead.
7. **`index.js` (903 lines) split:** the composition root plus `deepLinks`, `autoUpdate` and `webStack` (local server for the dashboard).
8. **Dashboard backend:** the Express app receives the typed repositories directly; the `web-data-request` string messages go.
9. **Network calls to WhisperAPP only from main.** Today 5 UI views `fetch` WhisperAPP themselves; in the React UI they ask main over IPC.

Nothing here changes what the user sees.

**Order inside step 4a** (amends [Order of the work](07-work-order.md)): one change at a time, so a break points at one cause.
- **4a-1, TypeScript only:** today's structure in strict TS with typed IPC channels. The cycles may stay for now (electron-vite bundles them fine while the imports are used only inside functions). Checked with the smoke tests.
- **4a-2, new structure:** points 1-8 above, one at a time, smoke tests after each. The Vitest service tests ([Which tests to delete](09-which-tests-to-delete.md)) are written here, since they need the new shape. Point 9 happens in step 6 with the React UI.
- **End:** when points 1-8 are done. Making the code easy for agents to work in is then covered by the new `CLAUDE.md` files in step 8; further refactoring is a new effort, not this map.
