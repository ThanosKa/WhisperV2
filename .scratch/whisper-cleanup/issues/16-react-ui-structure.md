# React UI structure

Status: open
Type: grilling
Blocked by: 15

## Question

For step 6 of [Order of the work](07-work-order.md): the folder and component layout of the new React UI (one renderer entry per window or one app with routes per window, shared components, how the UI calls the typed IPC contract from [Code structure for main and preload](15-main-code-structure.md), state per window, how markdown and code highlighting are rendered). Use the `codebase-design` skill.

## Comments

From [Code structure for main and preload](15-main-code-structure.md): the renderer lives in `src/renderer/`; the typed IPC contract is `src/shared/ipc.ts`, exposed by preload as typed functions. The UI makes no network calls of its own: the 5 views that `fetch` WhisperAPP today ask main over IPC instead, and nothing in the UI hard-codes the domain.
