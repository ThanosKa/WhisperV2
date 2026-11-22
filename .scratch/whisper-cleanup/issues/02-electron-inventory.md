# Electron app inventory

Status: resolved
Type: research
Blocked by: none

## Question

What does the Electron app in `src/` consist of, as input to the TypeScript migration? Cover: the build pipeline (`build.js`, electron-builder, how `whisper_web` is bundled), main vs preload vs renderer code, the UI technology in `src/ui/`, module system (CommonJS or ESM), native dependencies (`better-sqlite3`, `SystemAudioDump`), the `aec` submodule listed in `.gitmodules` but missing on disk, the existing ESLint/TS config, and the largest and most coupled files. Note anything that will make a TypeScript move hard.

## Answer

Full findings: branch `research/electron-inventory` (commit `ebe2337`, local only), file `.scratch/whisper-cleanup/research/02-electron-inventory.md`.

- ~22.7K lines to convert (main 9.8K, preload 333, renderer 12.5K, of which 5.4K are CSS in JS strings). ~5.9K vendored/generated lines stay JS.
- Main and preload ship as raw `src/**/*` with no build; only the renderer is bundled (esbuild, 3 entries, ESM). esbuild already strips TS types; type-checking needs `tsc --noEmit`.
- Outside `src/ui/` is CommonJS; `src/ui/` is ESM (except 3 CJS files in `audioCore/`). No computed `require`.
- UI is Lit (vendored minified `lit-core-2.7.4`, no types); `marked`, `hljs`, `DOMPurify` are `<script>` globals.
- Preload is sandboxed: must stay one file or be bundled.
- Two import cycles (7-module one around windowManager; authService and the user repository), held by lazy `require`. ESM output needs them broken first; CJS output does not.
- Many paths assume the `src/` layout (main field, preload, `loadFile`, `SystemAudioDump`, backend_node dist, electron-builder `files`, Jest mocks, Playwright), so emitting to `dist/` touches them all.
- IPC channels are plain strings in 3 places with no shared list; mismatches already exist.
- Dead references a type-checker would catch (e.g. `window.captureManualScreenshot`, `global.modelStateService`).
- No root tsconfig or ESLint config, yet `npm run lint` calls eslint. 724 `console.*` calls; no schema library.
- `aec` submodule is orphaned; 11 root dependencies are never imported; `npm run make` calls electron-forge, which is not installed.
- Most coupled: authService (12 importers), sqliteClient (10), windowManager (7). Largest: AskView.js 1,783, summaryService.js 1,142, windowManager.js 1,125.
