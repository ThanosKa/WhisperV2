// One-off check for ticket 07: reads a latest-mac.yml the way electron-updater does and shows
// which Macs it offers the update to. Run from the repo root:
//   node .scratch/step-2-3-safety-net-upgrades/assets/mac-feed-check.js <path to latest-mac.yml>
// electron-updater's check (AppUpdater.checkIfUpdateSupported): the update is refused when
// semver.lt(os.release(), feed.minimumSystemVersion). On macOS, os.release() is the Darwin version.
const fs = require('node:fs');
const semver = require('semver');
const { parseUpdateInfo } = require('electron-updater/out/providers/Provider');

const feedFile = process.argv[2];
const info = parseUpdateInfo(fs.readFileSync(feedFile, 'utf8'), 'latest-mac.yml', feedFile);
console.log(`feed version ${info.version}, minimumSystemVersion ${JSON.stringify(info.minimumSystemVersion)}`);

// os.release() on the last version of each macOS (Darwin x.6 is macOS 11.7, 12.7; 22.6 is 13.7).
const macs = [
    ['macOS 11.7 Big Sur', '20.6.0'],
    ['macOS 12.7 Monterey', '21.6.0'],
    ['macOS 13.0 Ventura', '22.1.0'],
    ['macOS 15 Sequoia', '24.6.0'],
    ['macOS 26 Tahoe', '25.0.0'],
];
for (const [name, darwin] of macs) {
    const refused = info.minimumSystemVersion ? semver.lt(darwin, info.minimumSystemVersion) : false;
    console.log(`${name} (Darwin ${darwin}): ${refused ? 'no update' : 'updates'}`);
}
