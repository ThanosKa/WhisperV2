# React UI structure

Status: resolved
Type: grilling
Blocked by: 15

## Question

For step 6 of [Order of the work](07-work-order.md): the folder and component layout of the new React UI (one renderer entry per window or one app with routes per window, shared components, how the UI calls the typed IPC contract from [Code structure for main and preload](15-main-code-structure.md), state per window, how markdown and code highlighting are rendered). Use the `codebase-design` skill.

## Comments

From [Code structure for main and preload](15-main-code-structure.md): the renderer lives in `src/renderer/`; the typed IPC contract is `src/shared/ipc.ts`, exposed by preload as typed functions. The UI makes no network calls of its own: the 5 views that `fetch` WhisperAPP today ask main over IPC instead, and nothing in the UI hard-codes the domain.

## Answer

Resolved 2026-11-24 with the owner, using the `codebase-design` skill. Owner's rule: follow the industry standard.

**What the UI is today:** 7 windows (header, ask, listen, settings, plan, screenshot, recovery-toast) loaded from 3 HTML pages; `content.html` shows 5 of them, picked by `?view=`. Preload groups its API by view (`askView`, `settingsView`, ...). Markdown uses vendored `marked` + `highlight.js` (github-dark) + `DOMPurify` + `smd`. Audio capture (`listenCapture`, `aec`) runs in the renderer but is not UI.

**Structure:**
1. **One HTML entry per window** in electron-vite: `src/renderer/<window>/` (`header`, `ask`, `listen`, `settings`, `plan`, `screenshot`, `recovery-toast`). One window, one folder, one entry; no router.
2. **Shared code:** `src/renderer/shared/` for components and hooks used by more than one window; `src/renderer/audio/` for audio capture as plain TS, no React.
3. **Calling main:** `window.api.<feature>.<method>` (ask, listen, settings, ...) typed from `src/shared/ipc.ts` ([Code structure for main and preload](15-main-code-structure.md)). Events from main through a `useIpcEvent` hook that unsubscribes on unmount. No network calls from the UI.
4. **State:** main holds it; each window shows it. React built-ins only (`useState`, `useReducer`), no store library.
5. **Markdown:** `react-markdown` + `remark-gfm` + `rehype-highlight` (same `highlight.js` and github-dark theme, so code colors match), as in `whisper_web`. `react-markdown` renders no raw HTML, so `DOMPurify`, `marked` and `smd` go.
6. **Components:** from the owner's shadcn-format registry **Kosmos** (`~/Desktop/Cursor/design-system`, 126 items, including `assistant-message`, `reasoning`, `prompt-composer`), added with the shadcn CLI into `src/renderer/shared/ui/`. Tailwind only. Kosmos components read their look from Kosmos's CSS variables (`tokens` item); Whisper fills those variables with its own values, set in [DESIGN.md scope](17-design-md-scope.md). Kosmos must be reachable by step 6 (deployed, or run locally; today it is on `localhost:3000`).
7. **Order inside step 6:** one window at a time, smallest first: recovery-toast, screenshot, plan, settings, header, listen, ask. Lit and React live side by side meanwhile; screenshots checked after each window. Step 6 ends when Lit is gone.

UI tests stay as decided in [Which tests to delete](09-which-tests-to-delete.md): the Playwright smoke tests and screenshots only.
