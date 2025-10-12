const path = require('node:path');

process.env.TS_NODE_PROJECT = path.resolve(__dirname, 'tsconfig.main.json');
require('ts-node/register/transpile-only');
require('tsconfig-paths/register');
require('./src/index.ts');
