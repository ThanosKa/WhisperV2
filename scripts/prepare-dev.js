// Builds what `pnpm dev` needs before electron-vite starts, so it works from a clean checkout:
// - the dashboard's backend_node, which main bundles (whisper_web/backend_node/dist), every time,
//   since it is quick and main must not bundle a stale copy;
// - the dashboard's static export, which main serves (whisper_web/out), only when it is missing,
//   since a Next build is slow. Run `pnpm run build:web` to refresh it.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// The pnpm that runs `pnpm dev` (npm_execpath), or the one on PATH when run by hand
const pnpmPath = process.env.npm_execpath || 'pnpm';
const pnpm = args => {
    const [file, fileArgs] = /\.[cm]?js$/.test(pnpmPath) ? [process.execPath, [pnpmPath, ...args]] : [pnpmPath, args];
    execFileSync(file, fileArgs, { stdio: 'inherit', cwd: path.join(__dirname, '..') });
};

pnpm(['--filter', 'whisper-frontend', 'run', 'build:backend']);

// `next typegen` (pnpm type-check) also writes into whisper_web/out, so look for the export's page.
if (!fs.existsSync(path.join(__dirname, '..', 'whisper_web', 'out', 'index.html'))) {
    pnpm(['--filter', 'whisper-frontend', 'exec', 'next', 'build']);
}
