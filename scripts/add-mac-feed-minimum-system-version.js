#!/usr/bin/env node
// Writes the macOS floor into the update feed that `electron-builder --mac` leaves in the output
// folder (`latest-mac.yml`), before the feed is uploaded.
//
// Installed builds decide whether to update: electron-updater compares the feed's
// `minimumSystemVersion` with `os.release()`, which on macOS is the Darwin kernel version, not the
// macOS version. So the feed must carry the Darwin version of the floor (macOS 13 is Darwin 22.0.0).
// electron-builder 26.18 writes the floor to Info.plist only, never to the feed, and its config
// cannot add the field, so this step does.
//
// Usage: node scripts/add-mac-feed-minimum-system-version.js [path to latest-mac.yml]

const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');

const ROOT_DIR = path.join(__dirname, '..');
const BUILD_CONFIG = path.join(ROOT_DIR, 'electron-builder.yml');

// Darwin major version of each macOS major version, from Apple's release notes. macOS 26 follows
// macOS 15, so there is no formula.
const DARWIN_MAJOR_BY_MACOS_MAJOR = new Map([
    [11, 20],
    [12, 21],
    [13, 22],
    [14, 23],
    [15, 24],
    [26, 25],
]);

const isRecord = value => typeof value === 'object' && value !== null && !Array.isArray(value);

function readYaml({ file }) {
    const parsed = yaml.load(fs.readFileSync(file, 'utf8'));
    if (!isRecord(parsed)) {
        throw new Error(`${file} is not a YAML mapping`);
    }
    return parsed;
}

function readMacosFloor({ buildConfig }) {
    const mac = buildConfig.mac;
    const floor = isRecord(mac) ? mac.minimumSystemVersion : undefined;
    if (typeof floor !== 'string') {
        throw new Error(`${BUILD_CONFIG} has no mac.minimumSystemVersion`);
    }
    return floor;
}

// '13.0' -> '22.0.0'. Only the major version gates the update; minor macOS versions do not map
// one-to-one onto Darwin minor versions, so a floor like '13.3' is refused.
function darwinVersionFor({ macosVersion }) {
    const match = /^(\d+)(?:\.0)?(?:\.0)?$/.exec(macosVersion);
    const darwinMajor = match ? DARWIN_MAJOR_BY_MACOS_MAJOR.get(Number(match[1])) : undefined;
    if (darwinMajor === undefined) {
        throw new Error(`No known Darwin version for macOS ${macosVersion}; use a major version from 11 on, like '13.0'`);
    }
    return `${darwinMajor}.0.0`;
}

function outputDir({ buildConfig }) {
    const directories = buildConfig.directories;
    const output = isRecord(directories) ? directories.output : undefined;
    return path.join(ROOT_DIR, typeof output === 'string' ? output : 'dist');
}

function main() {
    const buildConfig = readYaml({ file: BUILD_CONFIG });
    const feedFile = process.argv[2] ? path.resolve(process.argv[2]) : path.join(outputDir({ buildConfig }), 'latest-mac.yml');
    const feed = readYaml({ file: feedFile });
    if (typeof feed.version !== 'string' || !Array.isArray(feed.files)) {
        throw new Error(`${feedFile} is not an electron-builder update feed (no version or files)`);
    }

    const macosFloor = readMacosFloor({ buildConfig });
    const minimumSystemVersion = darwinVersionFor({ macosVersion: macosFloor });
    const updated = { ...feed, minimumSystemVersion };
    fs.writeFileSync(feedFile, yaml.dump(updated, { lineWidth: -1, noRefs: true }));
    console.log(`[mac-feed] ${feedFile}: minimumSystemVersion ${minimumSystemVersion} (macOS ${macosFloor}), version ${feed.version}`);
}

main();
