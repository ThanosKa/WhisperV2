import { defineConfig } from 'electron-vite';
import rendererBuild from './build.js';

// Builds the Lit renderer with build.js (esbuild) as part of the main build, so `electron-vite build`
// builds the whole app, and `electron-vite dev --watch` rebuilds the renderer and restarts the app
// when a renderer file changes. Replaced by electron-vite's renderer build in step 6.
const litRenderer = () => ({
    name: 'whisper:lit-renderer',
    async buildStart() {
        await rendererBuild.buildRenderer();
        if (this.meta.watchMode) {
            for (const file of rendererBuild.rendererSourceFiles()) {
                this.addWatchFile(file);
            }
        }
    },
});

// Main and preload are built as CommonJS (package.json has no "type": "module"): a sandboxed
// preload must be CommonJS, and main keeps `__dirname`. Dependencies stay in node_modules.
export default defineConfig({
    main: {
        build: {
            lib: { entry: 'src/main/index.ts' },
            rolldownOptions: {
                // An optional dependency loaded with `import()` (sharp) is loaded with `require`, as
                // before the bundle: `require` reads a package in app.asar and its unpacked binaries.
                output: { dynamicImportInCjs: false },
            },
        },
        plugins: [litRenderer()],
    },
    preload: {
        build: {
            lib: { entry: 'src/preload/preload.ts' },
        },
    },
});
