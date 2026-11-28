import Database from 'better-sqlite3';
import { z } from 'zod';
import LATEST_SCHEMA, { type TableSchema } from '../config/schema';
import { logger } from '../utils/logger';

const log = logger.child({ module: 'SQLiteClient' });

const NameRowSchema = z.object({ name: z.string() });
const IdRowSchema = z.object({ id: z.string() });

class SQLiteClient {
    db: Database.Database | null = null;
    dbPath: string | null = null;
    readonly defaultUserId = 'default_user';

    connect(dbPath: string): void {
        if (this.db) {
            log.info('Already connected');
            return;
        }

        try {
            this.dbPath = dbPath;
            this.db = new Database(this.dbPath);
            this.db.pragma('journal_mode = WAL');
            log.info({ dbPath: this.dbPath }, 'Connected');
        } catch (err) {
            log.error({ err, dbPath }, 'Could not connect to database');
            throw err;
        }
    }

    getDb(): Database.Database {
        if (!this.db) {
            throw new Error('Database not connected. Call connect() first.');
        }
        return this.db;
    }

    _validateAndQuoteIdentifier(identifier: string): string {
        if (!/^[a-zA-Z0-9_]+$/.test(identifier)) {
            throw new Error(`Invalid database identifier used: ${identifier}. Only alphanumeric characters and underscores are allowed.`);
        }
        return `"${identifier}"`;
    }

    synchronizeSchema(): void {
        log.info('Starting schema synchronization');

        const tablesInDb = this.getTablesFromDb();

        for (const [tableName, tableSchema] of Object.entries(LATEST_SCHEMA)) {
            if (!tablesInDb.includes(tableName)) {
                // Table doesn't exist, create it
                this.createTable({ tableName, tableSchema });
            } else {
                // Table exists, check for missing columns
                this.updateTable({ tableName, tableSchema });
            }
        }
        log.info('Schema synchronization finished');
    }

    getTablesFromDb(): string[] {
        const tables = z.array(NameRowSchema).parse(this.getDb().prepare("SELECT name FROM sqlite_master WHERE type='table'").all());
        return tables.map(t => t.name);
    }

    createTable({ tableName, tableSchema }: { tableName: string; tableSchema: TableSchema }): void {
        const safeTableName = this._validateAndQuoteIdentifier(tableName);
        const columnDefs = tableSchema.columns.map(col => `${this._validateAndQuoteIdentifier(col.name)} ${col.type}`).join(', ');

        const constraints = tableSchema.constraints ?? [];
        const constraintsDef = constraints.length > 0 ? ', ' + constraints.join(', ') : '';

        const query = `CREATE TABLE IF NOT EXISTS ${safeTableName} (${columnDefs}${constraintsDef})`;
        log.info({ tableName }, 'Creating table');
        this.getDb().exec(query);
    }

    updateTable({ tableName, tableSchema }: { tableName: string; tableSchema: TableSchema }): void {
        const db = this.getDb();
        const safeTableName = this._validateAndQuoteIdentifier(tableName);

        // Get current columns
        const currentColumns = z.array(NameRowSchema.loose()).parse(db.prepare(`PRAGMA table_info(${safeTableName})`).all());
        const currentColumnNames = currentColumns.map(col => col.name);

        // Check for new columns to add
        const newColumns = tableSchema.columns.filter(col => !currentColumnNames.includes(col.name));

        if (newColumns.length > 0) {
            log.info({ tableName, count: newColumns.length }, 'Adding new columns');
            for (const col of newColumns) {
                const safeColName = this._validateAndQuoteIdentifier(col.name);
                const addColumnQuery = `ALTER TABLE ${safeTableName} ADD COLUMN ${safeColName} ${col.type}`;
                db.exec(addColumnQuery);
                log.info({ tableName, column: col.name }, 'Added column');
            }
        }

        if (tableSchema.constraints && tableSchema.constraints.length > 0) {
            log.info({ tableName }, 'Constraints can only be set during table creation');
        }
    }

    cleanupEmptySessions(): void {
        const db = this.getDb();
        log.info('Checking for empty sessions');
        const query = `
            SELECT s.id FROM sessions s
            LEFT JOIN transcripts t ON s.id = t.session_id
            LEFT JOIN ai_messages a ON s.id = a.session_id
            LEFT JOIN summaries su ON s.id = su.session_id
            WHERE t.id IS NULL AND a.id IS NULL AND su.session_id IS NULL
        `;

        const rows = z.array(IdRowSchema).parse(db.prepare(query).all());

        if (rows.length === 0) {
            log.info('No empty sessions found');
            return;
        }

        const idsToDelete = rows.map(r => r.id);
        const placeholders = idsToDelete.map(() => '?').join(',');
        const deleteQuery = `DELETE FROM sessions WHERE id IN (${placeholders})`;

        log.info({ count: idsToDelete.length }, 'Deleting empty sessions');
        const result = db.prepare(deleteQuery).run(idsToDelete);
        log.info({ deleted: result.changes }, 'Deleted empty sessions');
    }

    initTables(): void {
        this.synchronizeSchema();
        this.initDefaultData();
    }

    initDefaultData(): void {
        const db = this.getDb();
        const now = Math.floor(Date.now() / 1000);
        const initUserQuery = `
            INSERT OR IGNORE INTO users (uid, display_name, email, created_at)
            VALUES (?, ?, ?, ?)
        `;

        db.prepare(initUserQuery).run(this.defaultUserId, 'Default User', 'contact@whisper.app', now);

        const defaultPresets = [
            {
                id: 'school',
                title: 'School',
                prompt: "You are a school and lecture assistant. Your goal is to help the user, a student, understand academic material and answer questions.\n\nWhenever a question appears on the user's screen or is asked aloud, you provide a direct, step-by-step answer, showing all necessary reasoning or calculations.\n\nIf the user is watching a lecture or working through new material, you offer concise explanations of key concepts and clarify definitions as they come up.",
            },
            {
                id: 'meetings',
                title: 'Meetings',
                prompt: 'You are a meeting assistant. Your goal is to help the user capture key information during meetings and follow up effectively.\n\nYou help capture meeting notes, track action items, identify key decisions, and summarize important points discussed during meetings.',
            },
            {
                id: 'sales',
                title: 'Sales',
                prompt: 'You are a real-time AI sales assistant, and your goal is to help the user close deals during sales interactions.\n\nYou provide real-time sales support, suggest responses to objections, help identify customer needs, and recommend strategies to advance deals.',
            },
            {
                id: 'recruiting',
                title: 'Recruiting',
                prompt: 'You are a recruiting assistant. Your goal is to help the user interview candidates and evaluate talent effectively.\n\nYou help evaluate candidates, suggest interview questions, analyze responses, and provide insights about candidate fit for positions.',
            },
            {
                id: 'customer-support',
                title: 'Customer Support',
                prompt: 'You are a customer support assistant. Your goal is to help resolve customer issues efficiently and thoroughly.\n\nYou help diagnose customer problems, suggest solutions, provide step-by-step troubleshooting guidance, and ensure customer satisfaction.',
            },
        ];

        const stmt = db.prepare(`
            INSERT OR IGNORE INTO prompt_presets (id, uid, title, prompt, is_default, created_at, append_text)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        for (const preset of defaultPresets) {
            stmt.run(preset.id, '', preset.title, preset.prompt, 1, now, null);
        }

        // Create session_insights table if it doesn't exist (fallback for schema sync)
        db.exec(`
            CREATE TABLE IF NOT EXISTS session_insights (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                analysis_round INTEGER NOT NULL,
                payload_json TEXT NOT NULL,
                created_at INTEGER NOT NULL
            )
        `);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_session_insights_session ON session_insights (session_id, analysis_round)`);

        log.info('Default data initialized');
    }

    close(): void {
        if (this.db) {
            try {
                this.db.close();
                log.info('Connection closed');
            } catch (err) {
                log.error({ err }, 'Connection close failed');
            }
            this.db = null;
        }
    }
}

const sqliteClient = new SQLiteClient();
export default sqliteClient;
