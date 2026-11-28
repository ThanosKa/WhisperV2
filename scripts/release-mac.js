#!/usr/bin/env node
// Uploads the macOS release that `dist:mac` leaves in the output folder.
//
// `electron-builder publish` exits 0 when an upload fails (26.18 logs "error publishing" and
// returns null), and a shell glob that matches nothing is passed on as a literal file name. Either
// left a partial draft release behind with CI green. This step fails instead.
//
// Usage: node scripts/release-mac.js [output folder, default dist]

const fs = require('node:fs');
const path = require('node:path');

const ROOT_DIR = path.join(__dirname, '..');

const RELEASE_FILES = [
    { label: 'latest-mac.yml', matches: name => name === 'latest-mac.yml' },
    { label: '*.dmg', matches: name => name.endsWith('.dmg') },
    { label: '*.dmg.blockmap', matches: name => name.endsWith('.dmg.blockmap') },
    { label: '*-mac.zip', matches: name => name.endsWith('-mac.zip') },
    { label: '*-mac.zip.blockmap', matches: name => name.endsWith('-mac.zip.blockmap') },
];

// `publish` uploads the files and resolves to null when the upload failed, as
// electron-builder's `publishArtifactsWithOptions` does.
async function releaseMac({ distDir, publish }) {
    const names = fs.existsSync(distDir) ? fs.readdirSync(distDir) : [];
    const missing = RELEASE_FILES.filter(({ matches }) => !names.some(matches)).map(({ label }) => label);
    if (missing.length > 0) {
        throw new Error(`${distDir} has no ${missing.join(', ')}; nothing was uploaded`);
    }

    const files = names.filter(name => RELEASE_FILES.some(({ matches }) => matches(name))).map(name => path.join(distDir, name));
    const uploaded = await publish({ files });
    if (uploaded === null) {
        throw new Error('The upload failed; the draft release may hold only part of the files');
    }
    console.log(`[release-mac] uploaded ${files.map(file => path.basename(file)).join(', ')}`);
}

if (require.main === module) {
    const { publishArtifactsWithOptions } = require('electron-builder');
    const distDir = path.resolve(process.argv[2] ?? path.join(ROOT_DIR, 'dist'));
    const publish = ({ files }) =>
        publishArtifactsWithOptions(
            files.map(file => ({ file, arch: null })),
            undefined,
            undefined,
            undefined,
            { publish: 'always' }
        );
    releaseMac({ distDir, publish }).catch(error => {
        console.error(`[release-mac] ${error.message}`);
        process.exitCode = 1;
    });
}

module.exports = { releaseMac };
