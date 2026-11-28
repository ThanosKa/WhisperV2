# 02: electron-vite builds today's app

**What to build:** the app is built by electron-vite and packaged by electron-builder from its output, with the code in `src/main/`, `src/preload/`, `src/shared/` and `src/renderer/`, still in JavaScript but written as ESM (`import`/`export`). Nothing the user sees changes. This is the ticket that lets JavaScript and TypeScript files live side by side, so the TypeScript move can go folder by folder. Follows [the spec](../spec.md), "4a-1: build with electron-vite" and "4a-1: folders and TypeScript".

**Blocked by:** 01

**Status:** open

**Label:** ready-for-agent

**Model:** Opus (run `/model opus` before `/implement`). Unknown failures likely: bundled import order and the two import cycles, the sandboxed preload, asar paths, `SystemAudioDump`, and whether Vite can serve the vendored renderer scripts unchanged.

- [ ] electron-vite builds main, preload and the renderer. Main and preload are output as CommonJS; preload is one file that runs in the sandbox
- [ ] `src/index.js`, `src/window/`, `src/bridge/` and `src/features/` move into `src/main/` with the same folders and file names; preload into `src/preload/`; the Lit UI into `src/renderer/`, unchanged
- [ ] Every `require` in main and preload becomes an `import`. A `require` that runs inside a function to keep an import cycle working becomes a dynamic `import()` at the same place, or stays as it is if `import()` would make sync code async; each such case is listed in this ticket's comments
- [ ] The renderer keeps today's three HTML entries and its vendored scripts and `aec.js` as they are. If Vite cannot serve them without changing the Lit code, the renderer keeps `build.js` until step 6 and the reason is written here; otherwise `build.js` is deleted
- [ ] `pnpm dev` starts the app with reload on change
- [ ] `electron-builder.yml` (`files`, `asarUnpack`, `extraResources`) and the `package.json` `main` field follow the new output; the packaged app launches, and `SystemAudioDump` and the icons are found in dev and packaged
- [ ] The e2e launch helpers start the app from the electron-vite output (dev) and from the packaged app; the e2e test files pass type-check
- [ ] Run once in this ticket: the 4 smoke tests, in dev and packaged, and the 6 window screenshots against the step-3 baselines. Any difference is fixed
- [ ] Root Jest 130 still passes, with module paths updated to the new folders
- [ ] `pnpm type-check` and `pnpm test` pass, and `pnpm lint` passes as it stands when the ticket runs (oxlint is set up outside this spec). The test counts are recorded in this ticket's comments
- [ ] No lint rule is silenced with a disable comment
- [ ] Work on its own branch, merged into `dev` through a pull request
