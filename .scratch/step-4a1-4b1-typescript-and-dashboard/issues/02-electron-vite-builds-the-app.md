# 02: electron-vite builds today's app

**What to build:** the app is built by electron-vite and packaged by electron-builder from its output, with the code in `src/main/`, `src/preload/`, `src/shared/` and `src/renderer/`, still in JavaScript but written as ESM (`import`/`export`). Nothing the user sees changes. This is the ticket that lets JavaScript and TypeScript files live side by side, so the TypeScript move can go folder by folder. Follows [the spec](../spec.md), "4a-1: build with electron-vite" and "4a-1: folders and TypeScript".

**Blocked by:** 01

**Status:** resolved

**Label:** ready-for-agent

**Model:** Opus (run `/model opus` before `/implement`). Unknown failures likely: bundled import order and the two import cycles, the sandboxed preload, asar paths, `SystemAudioDump`, and whether Vite can serve the vendored renderer scripts unchanged.

- [x] electron-vite builds main, preload and the renderer. Main and preload are output as CommonJS; preload is one file that runs in the sandbox
- [x] `src/index.js`, `src/window/`, `src/bridge/` and `src/features/` move into `src/main/` with the same folders and file names; preload into `src/preload/`; the Lit UI into `src/renderer/`, unchanged
- [x] Every `require` in main and preload becomes an `import`. A `require` that runs inside a function to keep an import cycle working becomes a dynamic `import()` at the same place, or stays as it is if `import()` would make sync code async; each such case is listed in this ticket's comments
- [x] The renderer keeps today's three HTML entries and its vendored scripts and `aec.js` as they are. If Vite cannot serve them without changing the Lit code, the renderer keeps `build.js` until step 6 and the reason is written here; otherwise `build.js` is deleted
- [x] `pnpm dev` starts the app with reload on change
- [x] `electron-builder.yml` (`files`, `asarUnpack`, `extraResources`) and the `package.json` `main` field follow the new output; the packaged app launches, and `SystemAudioDump` and the icons are found in dev and packaged
- [x] The e2e launch helpers start the app from the electron-vite output (dev) and from the packaged app; the e2e test files pass type-check
- [x] Run once in this ticket: the 4 smoke tests, in dev and packaged, and the 6 window screenshots against the step-3 baselines. Any difference is fixed
- [x] Root Jest 130 still passes, with module paths updated to the new folders
- [ ] `pnpm type-check` and `pnpm test` pass, and `pnpm lint` passes as it stands when the ticket runs (oxlint is set up outside this spec). The test counts are recorded in this ticket's comments
- [x] No lint rule is silenced with a disable comment
- [ ] Work on its own branch, merged into `dev` through a pull request

## Comments

Done 2026-11-28 on branch `step-4a1-4b1-02-electron-vite-builds-the-app`.

- **Counts:** root Jest 130 (15 suites), `whisper_web` Jest 49, Vitest 3 (`main` 1, `whisper_web` 2). `pnpm type-check` and `pnpm test` pass. After merging `step-4a1-4b1` (tickets 08-10): root Jest 130, Vitest 37 (`main` 1, `whisper_web` 36), both still pass, and `pnpm run build:all` bundles the changed `backend_node`.
- **Electron suite, run once:** development app 10 passed (4 smoke, 6 screenshots, no pixel difference from the step-3 baselines); packaged app (`pnpm run package:e2e`, then `WHISPER_E2E_APP=packaged`) 4 smoke passed. No rerun needed.
- **Not ticked: `pnpm lint`.** It fails as on the integration branch (root `eslint --ext` with no root config); left to the oxlint setup. `pnpm web:lint` passes. No disable comment was added.
- **Not ticked: the PR into `dev`.** The branch is committed locally; the PR and merge are the caller's.
- **Renderer keeps `build.js` until step 6.** Vite's dev server serves source files as native ES modules, and the renderer's audio code is CommonJS: `listen/audioCore/renderer.js` and `listenCapture.js` use `require`/`module.exports`, and `aec.js` exports through `module.exports`. Serving them would mean changing that code. So electron-vite builds main and preload, and `build.js` (esbuild, settings unchanged) runs inside the main build through a small plugin in `electron.vite.config.mjs`: `electron-vite build` builds all three, and in watch mode a renderer change rebuilds the renderer and restarts the app. The windows load the HTML from `src/renderer/app/` with `loadFile`, in dev and packaged, as before; there is no renderer dev server. `build.js`'s `--watch` mode and the `build:renderer`/`watch:renderer` scripts are gone.
- **One renderer edit, forced by the move:** `ask/AskView.js`, `ask/AskView.template.js` and `ask/ask-view.css.js` imported Lit and smd through `../../ui/assets/`; they now say `../../renderer/assets/`. Nothing else in the renderer changed.
- **Scripts:** `pnpm dev` = `electron-vite dev --watch` (main, preload or renderer change: rebuild and restart). `pnpm start` = `electron-vite preview`. `build:app` = `electron-vite build`. `build:all` = `build:web` then `build:app`, since main now bundles `whisper_web/backend_node/dist`: run `pnpm run build:web` once before `pnpm dev` on a clean checkout. `pnpm dev` itself was not launched (it opens windows); its watch rebuilds were checked by running the same Vite watch build without Electron.
- **Output:** `out/main/index.js` and `out/preload/preload.js` (CommonJS, one file each; the preload only requires `electron`). Dependencies stay external in `node_modules`. `package.json` `main` is `out/main/index.js`. `electron-builder.yml` ships `out/`, `src/renderer/`, `public/build/` and `package.json`; `asarUnpack` and the icons point at `src/renderer/assets/`. In the packaged app, `SystemAudioDump` is at `app.asar.unpacked/src/renderer/assets/SystemAudioDump` and `icon.icns` matches `wlogo.icns`.
- **`require`s that ran inside a function, and what they became:**
  - **Dynamic `import()` at the same place (cycle):** `askService` → `listenService`, in `toggleAskButton` and `sendMessage` (both already async). A static import breaks when `summaryService` is the first module loaded (root Jest does this): `summaryService` → `settingsService` → `windowManager` → `askService` → `listenService`, whose singleton's constructor reads `summaryService` before it exists. Rolldown warns `INEFFECTIVE_DYNAMIC_IMPORT` on each build, which is expected: the import is there for evaluation order, not for a separate chunk.
  - **`import()` for an optional dependency:** `sharp`, which was `require`d in a `try` at the top of `askService`. It is now an `import('sharp')` started at load and awaited in `captureScreenshot`, with the same logs and fallback; the bundle turns it back into `require` (`dynamicImportInCjs: false`), so it loads from the asar as before.
  - **Top-level imports (no cycle needs them lazy, since every cyclic module only uses the other inside functions):** `windowManager` in `index.js`, `listenService`, `sttService`, `summaryService`, `askService` (`getWindowManager`) and `windowBridge` (whose "circular dependency" comment was stale: `windowManager` does not import it); `settingsService` in `listenService` and `summaryService`; `authService` in the user repository and the user repository in `authService`; the repositories, `llmClient`, `internalBridge` and `mockAnalysisData` used inside functions; `electron`, `electron-updater`, `child_process`, `crypto`, `net`, `fs`, `path` used inside functions; `backend_node`'s dist in `index.js`.
  - **None stays a `require`.**
- **Load order:** `index.js` imports `dotenv/config` first, so `.env` is loaded before any module reads `process.env` (the bundle's first line is `require("dotenv/config")`). The single-instance lock now runs after all modules have loaded, as static imports run first: a second instance builds the services' singletons (two `electron-store` files opened, no window, IPC or database work) before it quits.
- **Root Jest on ESM source:** `jest.config.js` runs `babel-jest` with `@babel/plugin-transform-dynamic-import`, `@babel/plugin-transform-modules-commonjs` and `babel-plugin-add-module-exports` (a default-only module keeps `module.exports` = its default, so the old `require()`s see the same values). Only module paths changed in the tests. The three Babel plugins are dev dependencies until ticket 03 moves the tests to Vitest and deletes them.
- **For ticket 03 and later:** the root `tsconfig.json` still type-checks only `.ts` files; `allowJs` for the folder-by-folder conversion is not set yet. A module that exported an object of shorthand names now has named exports (consumers use `import * as` or named imports); one that exported a single value or an object with methods has a default export.
