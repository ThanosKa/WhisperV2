// The Lit renderer's build, run by electron-vite (electron.vite.config.mjs) until the renderer is
// rewritten in step 6. It stays on esbuild because Vite's dev server cannot serve the renderer
// unchanged: src/renderer/listen/audioCore/ is CommonJS (`require`, `module.exports`), and Vite
// serves source files as native ES modules.
const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const RENDERER_DIR = path.join(__dirname, 'src', 'renderer');

const baseConfig = {
    bundle: true,
    platform: 'browser',
    format: 'esm',
    loader: { '.js': 'jsx' },
    sourcemap: true,
    external: ['electron'],
    define: {
        'process.env.NODE_ENV': `"${process.env.NODE_ENV || 'development'}"`,
    },
};

const entryPoints = [
    { in: 'src/renderer/app/HeaderController.js', out: 'public/build/header' },
    { in: 'src/renderer/app/WhisperApp.js', out: 'public/build/content' },
    { in: 'src/renderer/app/RecoveryToast.js', out: 'public/build/recovery-toast' },
];

async function buildRenderer() {
    await Promise.all(
        entryPoints.map(point =>
            esbuild.build({
                ...baseConfig,
                absWorkingDir: __dirname,
                entryPoints: [point.in],
                outfile: `${point.out}.js`,
            })
        )
    );
}

// Every file under src/renderer/, so a watch build reruns the renderer build when one changes.
function rendererSourceFiles() {
    return fs
        .readdirSync(RENDERER_DIR, { recursive: true, withFileTypes: true })
        .filter(entry => entry.isFile())
        .map(entry => path.join(entry.parentPath, entry.name));
}

module.exports = { buildRenderer, rendererSourceFiles };
