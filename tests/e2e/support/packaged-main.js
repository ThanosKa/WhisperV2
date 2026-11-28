// Main entry of the packaged app the Electron suite runs against (tests/e2e/electron-builder.e2e.yml).
// It does what `electron -r main-preload.js .` does for the development app: the preload runs in
// main before any of the app's code, then the app starts from its own entry point.
require('./main-preload');
require('../../../src/index.js');
