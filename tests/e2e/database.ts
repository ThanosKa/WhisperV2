import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { promisify } from 'node:util';

const APP_ROOT = path.resolve(__dirname, '../..');

// `better-sqlite3` is built for Electron, not for the Node that runs Playwright, so the query runs
// in Electron's binary in Node mode, with the app's own driver, after the app has closed.
const QUERY_SCRIPT = `
const Database = require('better-sqlite3');
const db = new Database(process.env.E2E_DB_PATH, { readonly: true, fileMustExist: true });
process.stdout.write(JSON.stringify(db.prepare(process.env.E2E_SQL).all()));
db.close();
`;

const electronBinary = (): string => {
    const resolved: unknown = createRequire(__filename)('electron');
    if (typeof resolved !== 'string') {
        throw new Error('The electron package did not resolve to the path of its binary');
    }
    return resolved;
};

// Returns the rows of `sql` run on the profile's `whisper.db`, as parsed JSON.
export async function queryDatabase({ userDataDir, sql }: { userDataDir: string; sql: string }): Promise<unknown> {
    const { stdout } = await promisify(execFile)(electronBinary(), ['-e', QUERY_SCRIPT], {
        cwd: APP_ROOT,
        env: {
            ...process.env,
            ELECTRON_RUN_AS_NODE: '1',
            E2E_DB_PATH: path.join(userDataDir, 'whisper.db'),
            E2E_SQL: sql,
        },
    });
    const rows: unknown = JSON.parse(stdout);
    return rows;
}
