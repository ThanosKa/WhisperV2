# Presets Pipeline Documentation

## Overview

Presets in the PickleGlass application are customizable prompt templates used to personalize AI interactions, such as analysis or response generation. They allow users to define custom instructions (prompts) with titles for reuse in features like listening sessions or ask queries.

The system supports:

- **Default presets**: Pre-defined and available to all users (unauthenticated or authenticated). Users can append custom text to defaults without modifying the original prompt.
- **User presets**: Custom presets (if existing) managed by authenticated users, stored per user ID (UID). Full editing of prompt is allowed, but creation is currently disabled.

Presets are persisted in a local SQLite database. Firebase integration is dormant. The pipeline spans the Electron main process (backend in `src/`) for data management and the Next.js web app (`pickleglass_web/`) for UI rendering and API bridging.

Key concepts:

- **Prompt**: The core text template/instruction for the AI.
- **Append Text**: Additional user-specific text appended to the prompt (for defaults, stored in overrides; for customs, in the preset itself).
- **is_default**: 1 for system defaults, 0 for user-created.
- **sync_state**: Tracks sync status ('clean', 'dirty') for potential cloud operations.

## Database Schema

Presets are stored in the `prompt_presets` table and `preset_append_overrides` for default overrides, defined in `src/features/common/config/schema.js`:

```
prompt_presets: {
    columns: [
        { name: 'id', type: 'TEXT PRIMARY KEY' },           // UUID for the preset
        { name: 'uid', type: 'TEXT NOT NULL' },             // User ID (for user presets; defaults use default UID)
        { name: 'title', type: 'TEXT NOT NULL' },           // Human-readable name
        { name: 'prompt', type: 'TEXT NOT NULL' },          // The prompt template
        { name: 'is_default', type: 'INTEGER NOT NULL' },   // 1 for defaults, 0 for custom
        { name: 'created_at', type: 'INTEGER' },            // Unix timestamp
        { name: 'sync_state', type: "TEXT DEFAULT 'clean'" }, // Sync status
        { name: 'append_text', type: 'TEXT' },              // For customs; NULL for defaults
    ],
}

preset_append_overrides: {
    columns: [
        { name: 'preset_id', type: 'TEXT NOT NULL' },
        { name: 'uid', type: 'TEXT NOT NULL' },
        { name: 'append_text', type: 'TEXT' },
        { name: 'updated_at', type: 'INTEGER' },
    ],
    constraints: ['PRIMARY KEY (preset_id, uid)'],
}
```

The database is initialized on app startup via `src/features/common/services/databaseInitializer.js`, which uses `sqliteClient.js` to create tables from the schema. Defaults are inserted with `is_default=1` and a default UID.

## Backend Pipeline (Electron Main Process - `src/`)

The backend handles read and update operations on presets, authentication-aware access, and IPC communication with the frontend. Creation, deletion, and duplication are disabled.

### 1. Initialization

- **Database Setup**: On app ready (`src/index.js`), `databaseInitializer.initialize()` creates the `prompt_presets` and `preset_append_overrides` tables if they don't exist.
- **Auth Integration**: Uses `authService.getCurrentUserId()` to scope user presets and overrides.

### 2. Repository Layer

- **SQLite Repository** (`src/features/common/repositories/preset/sqlite.repository.js`):
    - `getPresets(uid)`: Returns defaults + user's presets (if authenticated) + user's append overrides for defaults. Orders by `is_default DESC, title ASC`. Joins with `preset_append_overrides` for defaults.
    - `getById(id, uid)`: Fetches a single preset with append override if applicable.
    - `findUserPresetByTitle(title, uid)`: Finds user-specific preset by title (customs only).
    - `getPresetTemplates()`: Returns default presets only.
    - `update(id, { title?, prompt?, append_text? }, uid)`: Updates fields, verifies ownership.
        - For defaults (`is_default=1`): Cannot change prompt; title updates allowed (rare); append_text uses `preset_append_overrides` table (insert/update/delete per UID). Marks 'dirty'.
        - For customs (`is_default=0`): Updates title, prompt, append_text directly in `prompt_presets`. Marks 'dirty'.
    - No create or delete functions.

- **Adapter** (`src/features/common/repositories/preset/index.js`):
    - Wraps the SQLite repo, injecting `authService.getCurrentUserId()` for UID.
    - Ensures operations are user-scoped. Firebase repository exists but disabled; always uses SQLite.

### 3. Service Layer

- **Settings Service** (`src/features/settings/settingsService.js`):
    - `getPresets()`: Calls adapter's `getPresets()`.
    - `getPresetTemplates()`: Calls adapter.
    - `updatePreset(id, { title?, prompt?, append_text? })`: Calls adapter, notifies windows via `windowNotificationManager`.
    - Notifications: Emits `presets-updated` to relevant windows (settings, main, listen) with action details (e.g., { action: 'updated', presetId }).
    - No create or delete methods.

### 4. IPC Handling

- **Web Data Handlers** (`src/index.js`):
    - Listens for `web-data-request` events from frontend.
    - Handles channels: `get-presets`, `update-preset`.
    - Calls adapter directly, emits response via `eventBridge`.

- **Feature Bridge** (`src/bridge/featureBridge.js`):
    - No direct preset IPC handlers for renderer; uses web-data for webapp.

### 5. Potential Sync (Dormant)

- Firebase repository (`src/features/common/repositories/preset/firebase.repository.js`) exists but is not used. Local SQLite is the single source of truth.

## Frontend Pipeline (Next.js Web App - `pickleglass_web/`)

The frontend provides UI for preset viewing and editing, communicating via API to the backend Node.js server, which bridges to Electron IPC.

### 1. API Layer (`utils/api.ts`)

- **Endpoints**:
    - `getPresets()`: GET `/api/presets` → Returns array of `PromptPreset` (id, title, prompt, append_text combined, etc.).
    - `updatePreset(id, { title?, prompt?, append_text? })`: PUT `/api/presets/${id}` → No return.
- **Dev Mock**: If `isDevMockEnabled()`, uses `devMock.ts` localStorage mocks (seeded with sample presets). Supports get/update.
- **Error Handling**: Throws on non-OK responses. Auth via `X-User-ID` header from localStorage.

### 2. Backend Node.js Routes (`backend_node/routes/presets.ts`)

- Express router for `/api/presets`.
- **GET /**: `ipcRequest(req, 'get-presets')` → Forwards to Electron main.
- **PUT /:id**: `ipcRequest(req, 'update-preset', { id: params.id, data: req.body })`.
- No POST or DELETE.
- Uses `ipcBridge.ts` for async IPC to main process.
- Auth middleware (`middleware/auth.ts`) identifies user via cookies/sessions, but relies on IPC for UID.

### 3. UI Components

- **Personalize Page** (`app/personalize/page.tsx`):
    - Fetches presets on load via `getPresets()`.
    - Displays searchable list of presets (defaults + customs).
    - Select preset: Shows original prompt (gray) + editable area (white) for append/full edit.
    - For defaults: Edits append to `append_text` (overrides table).
    - For customs: Edits full `prompt`.
    - Save: Updates via API; shows toast.
    - Reset: Clears append_text (defaults) or prompt (customs) with confirm dialog.
    - Character limit: 2000 total (warning).
    - No create, duplicate, delete; those buttons/modals removed.
    - Auto-selects first preset.
    - Handles loading, saving states, toasts.

- No **Preset Name Modal** (deleted: `components/ui/preset-name-modal.tsx`).

### 4. App Setup (`backend_node/index.ts`)

- Creates Express app with CORS for web URL.
- Mounts `/api/presets` route.
- Injects `eventBridge` for IPC.

### 5. Dev Mock (`utils/devMock.ts`)

- Simulates presets in localStorage if `?dev=1` or env flag.
- Seeds 3 sample presets (Brainstorm, Summarize, Code Review).
- Supports get/set for presets (used in API mocks).

## User Capabilities

Users interact with presets through the **Personalize** page (`/personalize`), accessible via settings or deep link (`pickleglass://personalize`).

### Unauthenticated Users

- View and use default presets only (no appends).
- No editing.

### Authenticated Users

- **View**: List defaults + custom presets (if any), searchable by title/prompt.
- **Create**: Disabled; no UI or backend support.
- **Edit**:
    - Defaults: Append custom text (per-user overrides); cannot modify original prompt or title.
    - Customs (if existing): Full edit of title and prompt.
- **Duplicate**: Disabled.
- **Delete**: Disabled for all presets.
- **Reset**: Clear user appends (defaults) or content (customs).
- **Select for Use**: Presets integrate with features:
    - **Listen/Analysis**: Uses selected preset for summary generation in `summaryService.js`.
    - **Ask**: References presets in queries via `askService.js`.
- **Search/Filter**: By title or prompt content.
- **Templates**: Defaults serve as templates; no separate `getPresetTemplates()` usage in UI.

### Backend Operations (User Perspective)

- All changes persist locally in SQLite (updates only).
- Auth required for editing (via webapp auth flow).
- Changes notify open windows (refresh lists in settings/listen views).
- Dev mode: Mocks enable UI testing; disabled ops not present.

### Edge Cases

- **Character Limit**: Prompts/append capped at 2000 chars (UI warning/enforce).
- **Ownership**: Backend verifies UID for updates (only user's customs/overrides).
- **Dirty State**: Updated presets/overrides marked 'dirty' for future sync.
- **No Presets**: Falls back to first/default.
- **Disabled Operations**: Create/Duplicate/Delete removed; no errors as not exposed.
- **Defaults Protection**: Prompt immutable; only appends allowed.
- **Customs**: If exist (legacy), full editable; no new creation.
- **Errors**: Toasts for failures (e.g., DB errors, IPC issues).

## Files Interacted With

### Backend (`src/`)

- `features/common/config/schema.js`: DB table definitions (prompt_presets, preset_append_overrides).
- `features/common/services/sqliteClient.js`: DB connection/pooling.
- `features/common/services/databaseInitializer.js`: Table creation on startup.
- `features/common/repositories/preset/sqlite.repository.js`: Core read/update SQL (joins for appends).
- `features/common/repositories/preset/index.js`: Auth-aware adapter (SQLite only).
- `features/common/services/authService.js`: UID injection.
- `features/settings/settingsService.js`: Business logic, notifications (update only).
- `index.js`: IPC web data handlers (get/update), app initialization.
- `bridge/featureBridge.js`: Renderer IPC (no presets).
- `features/settings/repositories/index.js`: Settings repo (related, but presets separate).
- `features/listen/summary/summaryService.js`: Uses presets for analysis.
- `features/ask/askService.js`: Uses presets for queries.

### Frontend (`pickleglass_web/`)

- `backend_node/index.ts`: Express app setup.
- `backend_node/routes/presets.ts`: API routes (GET, PUT) with IPC forwarding.
- `backend_node/ipcBridge.ts`: IPC communication to main.
- `backend_node/middleware/auth.ts`: User identification.
- `utils/api.ts`: Frontend API wrappers (get/update, with mocks).
- `utils/devMock.ts`: LocalStorage simulation for dev.
- `app/personalize/page.tsx`: Main UI for viewing/editing (select, append/edit, save/reset).
- `components/ui/*`: Shared UI (Button, Input, ConfirmDialog, Toast).

### Integration Points

- **Notifications**: `windowNotificationManager` broadcasts `presets-updated` on changes.
- **Deep Links**: `pickleglass://personalize` navigates to page.
- **Dev Mode**: Toggle via URL/env for mock data.
- **Usages**:
    - Summary generation: Loads preset by ID, appends to analysis prompt.
    - Ask queries: Optionally uses selected preset in user prompts.

## Future Enhancements

- Re-enable custom preset creation as full user presets.
- Activate Firebase sync for cloud backups/multi-device.
- Preset sharing between users.
- Prompt validation/quality checks.
- Deeper integration with ask feature (dedicated presets).

This documentation covers the end-to-end presets pipeline as of the current codebase state.
