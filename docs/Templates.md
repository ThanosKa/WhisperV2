### Templates and Analysis Modes

This document captures the current state, the target behavior, and a practical, phased plan to enable multiple, user-editable meeting analysis modes (e.g., Personal, Sales, Customer Support, Recruiting, School) selectable from the Listen window.

### What we currently do

- **System prompts**
    - **Builder**: `src/features/common/prompts/promptBuilder.js` returns the system string from static `profilePrompts` and appends context.
    - **Static templates**: `src/features/common/prompts/promptTemplates.js`
        - Meeting analysis uses a single static template: `profilePrompts.meeting_analysis.system`.
    - **Usage in analysis**: `src/features/listen/summary/summaryService.js`
        - Builds system prompt via `getSystemPrompt(this.analysisProfile || 'meeting_analysis', { context })`.
        - Default `analysisProfile` is `'meeting_analysis'`.

- **Live insights UI (Listen)**
    - **Listen shell**: `src/ui/listen/ListenView.js` renders top bar with “Live insights / Show Transcript” and the content areas.
    - **Transcript view**: `src/ui/listen/stt/SttView.js` subscribes to `stt-update` events.
    - **Insights view**: `src/ui/listen/summary/SummaryView.js` subscribes to `summary-update` and shows insights.
    - There is currently no dropdown in Listen to select analysis templates.

- **Presets (Personalize)**
    - **DB schema**: `prompt_presets` in `src/features/common/config/schema.js`.
    - **Seeding defaults**: `src/features/common/services/sqliteClient.js` seeds defaults: School, Meetings, Sales, Recruiting, Customer Support (all `is_default=1`).
    - **Repositories**: `src/features/common/repositories/preset/` (SQLite adapter used).
    - **Main IPC adapter**: `src/index.js` handles `get-presets/create-preset/update-preset/delete-preset` and delegates to the preset repository.
    - **Web API**: `pickleglass_web/backend_node/routes/presets.ts` bridges to main via IPC.
    - **Web UI**: `pickleglass_web/app/personalize/page.tsx` lists presets, supports edit/create/duplicate.
    - Presets are not yet used by `SummaryService` for analysis mode selection.

- **IPC surface around Listen**
    - `src/preload.js` exposes (stubs) for `listen:setPromptProfile`, `listen:getPromptProfile`, `listen:getAvailableProfiles`, but these handlers are removed in main. No current implementation in `src/bridge/featureBridge.js`.

### Goal (user requirements)

- **Dropdown in ListenView** to select the current analysis template.
    - Default option named “Personal” (maps to existing default; names can be adjusted later).
    - The dropdown must list all user templates (defaults + user-created).
- **User-editable templates** (role-focused)
    - Users edit template content live via the running app, without rebuilds.
    - We focus the editable part on a concise “role” definition (e.g., sales assistant intent), limited to ~100 words.
    - Values should be represented and returned as an object to Electron (JSON), but remain backward-compatible with plain text.
- **Analysis behavior**
    - Keep one base analysis template (current `meeting_analysis`) and inject the selected role at the top.
    - Analysis output structure remains consistent across modes.

### Proposed approach (high-level)

- Use existing `prompt_presets` as the source for roles. Continue using the static base `meeting_analysis` template for structure.
- When a preset is selected, prepend a role directive to the system prompt, then append the `meeting_analysis.system` text and the Context block.
- Role content storage and transport:
    - Store role as JSON in `prompt_presets.prompt`, e.g. `{ "kind": "analysis_role", "version": 1, "role": "..." }`.
    - Backward-compatible: if `prompt` is plain text, treat it as the role string.
    - Enforce a ~100-word limit at save-time (web UI) and as a defensive check at use-time (main).
- Real-time edits: saving a preset writes to SQLite immediately; Listen should refresh its list on-demand or via a lightweight event.

### Files to modify (and suggested changes)

- `src/ui/listen/ListenView.js`
    - Add a dropdown in the top bar (`.bar-controls`) to list presets.
    - On open or focus, fetch presets via new IPC `listen:listAnalysisPresets`.
    - On change, call `listen:setAnalysisPreset({ presetId })`; show the current selection next to “Live insights”.

- `src/preload.js`
    - Replace the unused profile methods with:
        - `listen:listAnalysisPresets()` → returns array of presets.
        - `listen:getAnalysisPreset()` → returns currently selected preset id/info.
        - `listen:setAnalysisPreset({ presetId })` → persists selection and updates analysis.

- `src/bridge/featureBridge.js`
    - Implement main handlers:
        - `listen:listAnalysisPresets` → use `settingsService.getPresets()` (which uses the existing repository) to return presets.
        - `listen:getAnalysisPreset` → read from `settingsService.getSettings()` (new `analysisPresetId` field).
        - `listen:setAnalysisPreset` → save via `settingsService.saveSettings({ analysisPresetId })`, then call `summaryService.setAnalysisPreset(presetId)`.
    - Option A (events): include the Listen window in the set of windows that receive `presets-updated` so the dropdown can refresh.
        - Update `NOTIFICATION_CONFIG.RELEVANT_WINDOW_TYPES` in `src/features/settings/settingsService.js` to include `'listen'`.
    - Option B (pull): Listen dropdown fetches fresh presets on open; no event needed.

- `src/features/listen/summary/summaryService.js`
    - New state: `selectedPresetId`, `selectedRoleText`.
    - `setAnalysisPreset(presetId)` loads the preset via repository and extracts the role string:
        - If `prompt` parses as JSON and `kind === 'analysis_role'`, use `prompt.role` (trim to ~100 words).
        - Else treat `prompt` as raw role string (trim to ~100 words).
    - In `makeOutlineAndRequests()`, build the system prompt as:
        - `<role>ROLE_TEXT</role>\n\n` + `profilePrompts.meeting_analysis.system` (+ existing context append).
    - Persist selection across sessions via `settingsService` (already handled in IPC call).

- `src/features/common/repositories/preset/*`
    - No changes for Phase 1 (we’re reusing list/update/create/delete as-is).
    - Phase 2 optional: add `preset_type` to filter analysis roles only.

- `src/features/settings/settingsService.js`
    - Add `analysisPresetId` to stored settings; expose via `getSettings`/`saveSettings`.
    - Optionally include the Listen window in `WindowNotificationManager` notifications for `presets-updated`.

- `pickleglass_web/app/personalize/page.tsx`
    - Around save/create/update: normalize the edited text into JSON if the user is editing an analysis role.
        - If user entered raw text: wrap as `{ kind: 'analysis_role', version: 1, role: '<text>' }`.
        - Enforce ~100-word role limit; show a gentle warning if exceeded.
    - UI affordance: show which presets are used by Listen as “Analysis Roles” (simple label or filter).

- `pickleglass_web/backend_node/routes/presets.ts`
    - No changes (already bridges to main IPC).

### Data model and object format

- Store JSON in `prompt_presets.prompt` for analysis-role presets (backward-compatible with plain text):

```json
{
    "kind": "analysis_role",
    "version": 1,
    "role": "You are a sales assistant that ...",
    "limits": { "roleMaxWords": 100 }
}
```

- Fallback: if `prompt` is plain text, treat it as `role` (and inject `<role>...</role>` at runtime).

### Real-time behavior

- Saving a preset through the app writes to SQLite immediately; no rebuild is required.
- To reflect changes without any UX lag:
    - Either Listen subscribes to `presets-updated` (include `'listen'` in relevant windows) and refreshes the dropdown list.
    - Or Listen fetches fresh presets when the dropdown opens.

### Phases (incremental plan)

- **Phase 1: Role selection with base analysis**
    - Add Listen dropdown and IPC methods.
    - Persist `analysisPresetId` in settings; default to “Personal”.
    - Prepend selected `<role>...</role>` to `meeting_analysis.system` and append Context.
    - Accept both JSON and plain text in `prompt`.
    - Enforce 100-word role cap at use time (defensive trim).
    - No DB/schema changes.

- **Phase 2: Role-only editing and visibility**
    - Personalize: validate and save role as JSON `{ kind:'analysis_role', role }`; reject or warn if >100 words.
    - Optionally add `preset_type` to `prompt_presets` to filter only analysis roles in the Listen dropdown and Personalize filter.
    - Include Listen in `presets-updated` notifications for live refresh.

- **Phase 3 (optional): Full template override**
    - Allow a preset to fully replace the system prompt (advanced users).
    - Mark such presets with `{ kind:'analysis_template', system:'...' }`.
    - SummaryService: if `kind==='analysis_template'`, skip base `meeting_analysis` and use the preset’s system as-is (still append Context).

### Acceptance criteria (Phase 1)

- A dropdown appears in the Listen top bar with “Personal” preselected and lists all presets.
- Changing the selection immediately affects live insights tone/content.
- The selection persists across app restarts and is re-applied on session start.
- Editing presets in Personalize updates the dropdown list and applied role without rebuilding.

### Notes & risks

- Backward compatibility: many existing presets are plain text. The runtime JSON-or-text parse keeps them working.
- Role length enforcement: enforce at save-time (user feedback) and trim at use-time (robustness).
- Event fanout: if we include `'listen'` in `RELEVANT_WINDOW_TYPES`, verify no unintended traffic to hidden Listen windows.
