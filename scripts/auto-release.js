#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = path.join(__dirname, '..');
const webDir = path.join(rootDir, 'whisper_web');
const bumpType = (process.argv[2] || process.env.BUMP || 'patch').toLowerCase();
const validBumps = ['major', 'minor', 'patch'];
const isDirectVersion = /^\d+\.\d+\.\d+(-[a-z0-9.]+)?$/i.test(bumpType);

if (!validBumps.includes(bumpType) && !isDirectVersion) {
    console.error(`Invalid argument "${bumpType}". Use one of: ${validBumps.join(', ')} or a specific version (e.g. 1.7.0)`);
    process.exit(1);
}

function run(cmd, options = {}) {
    execSync(cmd, { stdio: 'inherit', cwd: rootDir, ...options });
}

function ensureCleanWorkingTree() {
    const status = execSync('git status --porcelain', { cwd: rootDir }).toString().trim();
    if (status) {
        console.error('Working tree is not clean. Commit or stash changes before releasing.');
        process.exit(1);
    }
}

function bumpVersion(version, bump) {
    if (/^\d+\.\d+\.\d+(-[a-z0-9.]+)?$/i.test(bump)) return bump;

    const [major, minor, patch] = version.split('.').map(Number);
    if ([major, minor, patch].some(Number.isNaN)) {
        throw new Error(`Invalid semver: ${version}`);
    }

    if (bump === 'major') return `${major + 1}.0.0`;
    if (bump === 'minor') return `${major}.${minor + 1}.0`;
    return `${major}.${minor}.${patch + 1}`;
}

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, data, space) {
    fs.writeFileSync(file, `${JSON.stringify(data, null, space)}\n`);
}

function updatePackageJson(file, newVersion, space = 4) {
    const pkg = readJson(file);
    pkg.version = newVersion;
    writeJson(file, pkg, space);
}

function updatePackageLock(file, newVersion) {
    if (!fs.existsSync(file)) return;
    const lock = readJson(file);
    if (lock.version) lock.version = newVersion;
    if (lock.packages && lock.packages['']) {
        lock.packages[''].version = newVersion;
    }
    writeJson(file, lock, 2);
}

function main() {
    ensureCleanWorkingTree();

    const rootPkgPath = path.join(rootDir, 'package.json');
    const rootLockPath = path.join(rootDir, 'package-lock.json');
    const webPkgPath = path.join(webDir, 'package.json');
    const webLockPath = path.join(webDir, 'package-lock.json');

    const currentRootVersion = readJson(rootPkgPath).version;
    const newVersion = bumpVersion(currentRootVersion, bumpType);

    updatePackageJson(rootPkgPath, newVersion, 4);
    updatePackageLock(rootLockPath, newVersion);

    updatePackageJson(webPkgPath, newVersion, 4);
    updatePackageLock(webLockPath, newVersion);

    run(`git add ${rootPkgPath} ${rootLockPath} ${webPkgPath} ${webLockPath}`);
    run(`git commit -m "Release v${newVersion}"`);
    run(`git tag v${newVersion}`);
    run('git push');
    run(`git push origin v${newVersion}`);

    console.log(`Released v${newVersion} (${bumpType}).`);
}

main();
