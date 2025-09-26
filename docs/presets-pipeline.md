# Presets Pipeline Documentation

## Overview

Presets in the PickleGlass application are customizable prompt templates used to personalize AI interactions, such as analysis or response generation. They allow users to define custom instructions (prompts) with titles for reuse in features like listening sessions or ask queries.

The system supports:

- **Default presets**: Pre-defined and available to all users (unauthenticated or authenticated).
- **User presets**: Custom presets created and managed by authenticated users, stored per user ID (UID).

Presets are persisted in a local SQLite database and can be synced (via `sync_state` field, though Firebase integration appears dormant). The pipeline spans the Electron main process (backend in `src/`) for data management and the Next.js web app (`pickleglass_web/`) for UI rendering and API bridging.

Key concepts:

- **Prompt**: The core text template/instruction for the AI.
- **is_default**: 1 for system defaults, 0 for user-created.
- **sync_state**: Tracks sync status ('clean', 'dirty') for potential cloud operations.

## Database Schema

Presets are stored in the `prompt_presets` table, defined in `src/features/common/config/schema.js`:

```
prompt_presets: {
    columns: [
        { name: 'id', type: 'TEXT PRIMARY KEY' },           // UUID for the preset
        { name: 'uid', type: 'TEXT NOT NULL' },             // User ID (for user presets)
        { name: 'title', type: 'TEXT NOT NULL' },           // Human-readable name
        { name: 'prompt', type: 'TEXT NOT NULL' },          // The prompt template
        { name: 'is_default', type: 'INTEGER NOT NULL' },   // 1 for defaults, 0 for custom
        { name: 'created_at', type: 'INTEGER' },            // Unix timestamp
        { name: 'sync_state', type: "TEXT DEFAULT 'clean'" }, // Sync status
    ],
}
```

The database is initialized on app startup via `src/features/common/services/databaseInitializer.js`, which uses `sqliteClient.js` to create tables from the schema.

## Backend Pipeline (Electron Main Process - `src/`)

The backend handles CRUD operations on presets, authentication-aware access, and IPC communication with the frontend.

### 1. Initialization

- **Database Setup**: On app ready (`src/index.js`), `databaseInitializer.initialize()` creates the `prompt_presets` table if it doesn't exist.
- **Auth Integration**: Uses `authService.getCurrentUserId()` to scope user presets.

### 2. Repository Layer

- **SQLite Repository** (`src/features/common/repositories/preset/sqlite.repository.js`):
    - `getPresets(uid)`: Returns defaults + user's presets (if authenticated). Orders by `is_default DESC, title ASC`.
    - `getById(id)`: Fetches a single preset.
    - `findUserPresetByTitle(title, uid)`: Finds user-specific preset by title.
    - `getPresetTemplates()`: Returns template data (possibly for UI guidance).
    - `create({ uid, title, prompt })`: Inserts new preset with UUID, sets `is_default=0`, `sync_state='dirty'`.
    - `update(id, { title, prompt }, uid)`: Updates title/prompt, verifies ownership.
    - `delete(id, uid)`: Deletes user preset, verifies ownership.

- **Adapter** (`src/features/common/repositories/preset/index.js`):
    - Wraps the SQLite repo, injecting `authService.getCurrentUserId()` for UID.
    - Ensures operations are user-scoped.

### 3. Service Layer

- **Settings Service** (`src/features/settings/settingsService.js`):
    - `getPresets()`: Calls adapter's `getPresets()`.
    - `getPresetTemplates()`: Calls adapter.
    - `createPreset(title, prompt)`: Calls adapter, notifies windows via `windowNotificationManager`.
    - `updatePreset(id, title, prompt)`: Calls adapter, notifies.
    - `deletePreset(id)`: Calls adapter, notifies.
    - Notifications: Emits `presets-updated` to relevant windows (settings, main, listen) with action details.

### 4. IPC Handling

- **Web Data Handlers** (`src/index.js`):
    - Listens for `web-data-request` events from frontend.
    - Handles channels: `get-presets`, `create-preset`, `update-preset`, `delete-preset`.
    - Calls adapter directly, emits response via `eventBridge`.

- **Feature Bridge** (`src/bridge/featureBridge.js`):
    - `ipcMain.handle('settings:getPresets')`: For renderer processes.
    - Integrates with other services (e.g., `listen:setAnalysisPreset` uses presets for analysis).

### 5. Potential Sync (Dormant)

- Firebase repository (`src/features/common/repositories/preset/firebase.repository.js`) exists but is not actively used in the current flow.

## Frontend Pipeline (Next.js Web App - `pickleglass_web/`)

The frontend provides UI for preset management and communicates via API to the backend Node.js server, which bridges to Electron IPC.

### 1. API Layer (`utils/api.ts`)

- **Endpoints**:
    - `getPresets()`: GET `/api/presets` → Returns array of `PromptPreset` (id, title, prompt, etc.).
    - `createPreset({ title, prompt })`: POST `/api/presets` → Returns `{ id }`.
    - `updatePreset(id, { title, prompt })`: PUT `/api/presets/${id}`.
    - `deletePreset(id)`: DELETE `/api/presets/${id}`.
- **Dev Mock**: If `isDevMockEnabled()`, uses `devMock.ts` localStorage mocks (seeded with sample presets).
- **Error Handling**: Throws on non-OK responses.

### 2. Backend Node.js Routes (`backend_node/routes/presets.ts`)

- Express router for `/api/presets`.
- **GET /**: `ipcRequest(req, 'get-presets')` → Forwards to Electron main.
- **POST /**: `ipcRequest(req, 'create-preset', req.body)`.
- **PUT /:id**: `ipcRequest(req, 'update-preset', { id: params.id, data: req.body })`.
- **DELETE /:id**: `ipcRequest(req, 'delete-preset', params.id)`.
- Uses `ipcBridge.ts` for async IPC to main process.
- Auth middleware (`middleware/auth.ts`) identifies user via cookies/sessions.

### 3. UI Components

- **Personalize Page** (`app/personalize/page.tsx`):
    - Fetches presets on load via `getPresets()`.
    - Displays list with search/filter (by title/prompt).
    - Select/edit presets in textarea (max 2000 chars).
    - Create/Duplicate: Modal for title, then edit prompt.
    - Save/Update/Delete with confirm dialogs for unsaved changes.
    - Handles loading, saving states, toasts for feedback.
    - Auto-selects 'Personal' preset or first available.

- **Preset Name Modal** (`components/ui/preset-name-modal.tsx`):
    - UI for entering preset title during create/duplicate.

### 4. App Setup (`backend_node/index.ts`)

- Creates Express app with CORS for web URL.
- Mounts `/api/presets` route.
- Injects `eventBridge` for IPC.

### 5. Dev Mock (`utils/devMock.ts`)

- Simulates presets in localStorage if `?dev=1` or env flag.
- Seeds 3 sample presets (Brainstorm, Summarize, Code Review).
- Supports get/set for presets (used in API mocks).

## User Capabilities

Users interact with presets primarily through the **Personalize** page (`/personalize`), accessible via settings or deep link (`pickleglass://personalize`).

### Unauthenticated Users

- View and use default presets only.
- No create/edit/delete.

### Authenticated Users

- **View**: List defaults + custom presets, searchable.
- **Create**: Disabled; only edit existing custom presets.
- **Edit**: Only custom presets (is_default=0); defaults are read-only—view but cannot modify. Backend protects defaults from updates.
- **Duplicate**: Disabled.
- **Delete**: Disabled for all presets.
- **Select for Use**: Presets integrate with features:
    - **Listen/Analysis**: Set via `listen:setAnalysisPreset` for summary generation.
    - **Ask**: Can reference presets in prompts.
- **Search/Filter**: By title or prompt content.
- **Templates**: Access `getPresetTemplates()` for UI guidance (e.g., prompt examples).

### Backend Operations (User Perspective)

- All changes persist locally in SQLite (only updates allowed).
- Auth required for any actions (via webapp auth flow).
- Changes notify open windows (e.g., refresh lists in settings/listen views)—but limited to updates.
- Dev mode: Mocks enable UI testing without Electron (disabled ops show errors).

### Edge Cases

- **Character Limit**: Prompts capped at 2000 chars (UI warning).
- **Ownership**: Backend verifies UID for edit (only customs).
- **Dirty State**: Updated presets marked 'dirty' for future sync.
- **No Presets**: Falls back to first/default or empty state.
- **Disabled Operations**: Create/Duplicate/Delete disabled system-wide; backend throws "disabled" errors. Defaults protected from all changes to preserve system integrity.
- **Errors**: Toasts for failures (e.g., DB errors, network/IPC issues, disabled ops).

## Files Interacted With

### Backend (`src/`)

- `features/common/config/schema.js`: DB table definition.
- `features/common/services/sqliteClient.js`: DB connection/pooling.
- `features/common/services/databaseInitializer.js`: Table creation on startup.
- `features/common/repositories/preset/sqlite.repository.js`: Core CRUD SQL.
- `features/common/repositories/preset/index.js`: Auth-aware adapter.
- `features/common/services/authService.js`: UID injection.
- `features/settings/settingsService.js`: Business logic, notifications.
- `index.js`: IPC web data handlers, app initialization.
- `bridge/featureBridge.js`: Renderer IPC handlers.
- `features/settings/repositories/index.js`: Settings repo (related).

### Frontend (`pickleglass_web/`)

- `backend_node/index.ts`: Express app setup.
- `backend_node/routes/presets.ts`: API routes with IPC forwarding.
- `backend_node/ipcBridge.ts`: IPC communication to main.
- `backend_node/middleware/auth.ts`: User identification.
- `utils/api.ts`: Frontend API wrappers (with mocks).
- `utils/devMock.ts`: LocalStorage simulation for dev.
- `app/personalize/page.tsx`: Main UI for management.
- `components/ui/preset-name-modal.tsx`: Title input modal.
- `components/ui/*`: Shared UI (Button, Input, Dialogs, Toast).

### Integration Points

- **Notifications**: `windowNotificationManager` in `settingsService.js` broadcasts `presets-updated`.
- **Deep Links**: `pickleglass://personalize` navigates to page.
- **Dev Mode**: Toggle via URL/env for mock data.

## Future Enhancements

- Activate Firebase sync for cloud backups/multi-device.
- Preset sharing between users.
- Validation for prompt quality/length.
- Integration with more features (e.g., ask presets).

This documentation covers the end-to-end presets pipeline as of the current codebase state.
