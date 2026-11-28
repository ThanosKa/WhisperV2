import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import sqliteClient from './sqliteClient';
import { logger } from '../utils/logger';

const log = logger.child({ module: 'DatabaseInitializer' });

class DatabaseInitializer {
    isInitialized = false;
    readonly dbPath: string;
    readonly dataDir: string;
    readonly sourceDbPath: string;

    constructor() {
        // Final DB path to be used (writable location)
        const userDataPath = app.getPath('userData');
        // In both development and production mode, the database is stored in the userData directory:
        //   macOS: ~/Library/Application Support/Whisper/whisper.db
        //   Windows: %APPDATA%\Whisper\whisper.db
        this.dbPath = path.join(userDataPath, 'whisper.db');
        this.dataDir = userDataPath;

        // The original DB path (read-only location in the package)
        this.sourceDbPath = app.isPackaged ? path.join(process.resourcesPath, 'data', 'whisper.db') : path.join(app.getAppPath(), 'data', 'whisper.db');
    }

    ensureDatabaseExists(): void {
        if (!fs.existsSync(this.dbPath)) {
            log.info({ dbPath: this.dbPath }, 'Database not found, preparing to create a new one');

            // Create userData directory (if it doesn't exist)
            if (!fs.existsSync(this.dataDir)) {
                fs.mkdirSync(this.dataDir, { recursive: true });
            }

            // Copy bundled initial DB if it exists, otherwise leave it to create empty file.
            if (fs.existsSync(this.sourceDbPath)) {
                try {
                    fs.copyFileSync(this.sourceDbPath, this.dbPath);
                    log.info({ dbPath: this.dbPath }, 'Bundled database copied');
                } catch (err) {
                    log.error({ err, sourceDbPath: this.sourceDbPath }, 'Failed to copy bundled database');
                    // Continue so that new DB can still be created even if copy fails
                }
            } else {
                log.info('No bundled database found, a fresh one will be created');
            }
        }
    }

    async initialize(): Promise<boolean> {
        if (this.isInitialized) {
            log.info('Already initialized');
            return true;
        }

        try {
            this.ensureDatabaseExists();

            sqliteClient.connect(this.dbPath);

            // This single call will now synchronize the schema and then init default data.
            sqliteClient.initTables();

            // Clean up any orphaned sessions from previous versions
            sqliteClient.cleanupEmptySessions();

            this.isInitialized = true;
            log.info({ dbPath: this.dbPath }, 'Database initialized');
            return true;
        } catch (err) {
            log.error({ err, dbPath: this.dbPath }, 'Database initialization failed');
            this.isInitialized = false;
            throw err;
        }
    }

    close(): void {
        sqliteClient.close();
        this.isInitialized = false;
        log.info('Database connection closed');
    }
}

const databaseInitializer = new DatabaseInitializer();

export default databaseInitializer;
