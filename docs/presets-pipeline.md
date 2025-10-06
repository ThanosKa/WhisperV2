# Presets Pipeline

## Overview

Presets are customizable prompt templates for AI personalization in analysis (Listen) and queries (Ask). Defaults (system) allow append overrides; customs (user) enable full edits but no creation/deletion. Stored in local SQLite (`prompt_presets`, `preset_append_overrides`); auth-scoped via UID. UI in webapp `/personalize`; backend via settingsService/repo. Firebase dormant.

## Database Schema (`common/config/schema.js`)

- `prompt_presets`: id (PK), uid, title, prompt, is_default (1=system), created_at, sync_state ('clean'), append_text (customs only).
- `preset_append_overrides`: preset_id + uid (PK), append_text, updated_at.

Init: `databaseInitializer` creates tables; seeds defaults (e.g., 'sales', 'recruiting').

## Backend Flow (Electron Main - `src/`)

### Repository (`common/repositories/preset/sqlite.repository.js`)

- `getPresets(uid)`: Defaults + user customs/overrides; JOIN for appends; ORDER is_default DESC, title ASC.
- `getById(id, uid)`: Single with override.
- `update(id, {title?, prompt?, append_text?}, uid)`: Defaults (append only, overrides table); customs (full, direct); marks 'dirty'.
- No create/delete.

### Adapter (`common/repositories/preset/index.js`)

- Wraps SQLite; injects UID from `authService`; local-only (Firebase disabled).

### Service (`settings/settingsService.js`)

- `getPresets()`: Calls adapter.
- `updatePreset(id, updates)`: Calls adapter; emits `presets-updated` to windows (listen, settings).
- No create/delete.

### IPC (`index.js`)

- `web-data-request` channels: `get-presets`, `update-preset` → adapter.

## Frontend Flow (Webapp - `webapp/`)

### API (`utils/api.ts`)

- `getPresets()`: GET `/api/presets`.
- `updatePreset(id, updates)`: PUT `/api/presets/${id}`.
- Dev mock: LocalStorage if enabled.

### Routes (`backend_node/routes/presets.ts`)

- GET/`: ipcRequest('get-presets')`.
- PUT `/:id`: ipcRequest('update-preset', {id, data}).
- Auth middleware identifies user.

### UI (`app/personalize/page.tsx`)

- Fetch: `getPresets()` on load; auto-select first.
- List: Searchable (title/prompt); shows defaults + customs.
- Edit: Defaults (append to gray original); customs (full white editable).
- Save: API update; toast; char limit 2000 (warning).
- Reset: Confirm clear append/full content.
- No create/duplicate/delete.

## Integration

- **Analysis** (`listen/summary/summaryService.js`): `setAnalysisPreset(id)` loads via repo; prefixes role to prompt; maps to profiles (e.g., 'sales' → 'sales_analysis').
- **Ask** (`ask/askService.js`): Optional `presetId` in `sendMessage`; uses for system prompt.
- Notifications: `presets-updated` refreshes dropdowns (e.g., ListenView).

## Config & Auth

- Auth: UID from webapp login (`authService`); unauth sees defaults only (no edits).
- Env: None specific; dev mock via `?dev=1`.
- Errors: Toasts/UI warnings; backend verifies ownership.

## Files

- Backend: `schema.js`, `sqlite.repository.js`, `index.js` (adapter), `settingsService.js`, `index.js` (IPC).
- Frontend: `api.ts`, `routes/presets.ts`, `personalize/page.tsx`.
- Integration: `summaryService.js`, `askService.js`, `ListenView.js` (dropdown).

For LLM calls using presets, see `llm-pipeline.md`.
