import { randomUUID } from 'crypto';
import { z } from 'zod';
import sqliteClient from '../../services/sqliteClient';
import { logger } from '../../utils/logger';

const log = logger.child({ module: 'SessionRepository' });

// A row of `sessions` (config/schema.ts). Only `id` and `uid` are NOT NULL.
export const SessionRowSchema = z.object({
    id: z.string(),
    uid: z.string(),
    title: z.string().nullable(),
    session_type: z.string().nullable(),
    started_at: z.number().nullable(),
    ended_at: z.number().nullable(),
    sync_state: z.string().nullable(),
    updated_at: z.number().nullable(),
});

export type SessionRow = z.infer<typeof SessionRowSchema>;

// The types the app writes; rows from older versions may hold others, so reads keep a string.
export type SessionType = 'ask' | 'listen';

const ActiveSessionSchema = SessionRowSchema.pick({ id: true, session_type: true });

const parseOptionalRow = (row: unknown): SessionRow | undefined => (row === undefined ? undefined : SessionRowSchema.parse(row));

function getById(id: string): SessionRow | undefined {
    const db = sqliteClient.getDb();
    return parseOptionalRow(db.prepare('SELECT * FROM sessions WHERE id = ?').get(id));
}

function create({ uid, type = 'ask' }: { uid: string; type?: SessionType }): string {
    const db = sqliteClient.getDb();
    const sessionId = randomUUID();
    const now = Math.floor(Date.now() / 1000);
    const query = `INSERT INTO sessions (id, uid, title, session_type, started_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`;

    try {
        db.prepare(query).run(sessionId, uid, `Session @ ${new Date().toLocaleTimeString('en-US')}`, type, now, now);
        log.info({ sessionId, uid, type }, 'Created session');
        return sessionId;
    } catch (err) {
        log.error({ err, uid, type }, 'Failed to create session');
        throw err;
    }
}

function getAllByUserId(uid: string): SessionRow[] {
    const db = sqliteClient.getDb();
    const query =
        'SELECT id, uid, title, session_type, started_at, ended_at, sync_state, updated_at FROM sessions WHERE uid = ? ORDER BY started_at DESC';
    return z.array(SessionRowSchema).parse(db.prepare(query).all(uid));
}

function updateTitle({ id, title }: { id: string; title: string }): { changes: number } {
    const db = sqliteClient.getDb();
    const result = db.prepare('UPDATE sessions SET title = ? WHERE id = ?').run(title, id);
    return { changes: result.changes };
}

function deleteWithRelatedData(id: string): { success: true } {
    const db = sqliteClient.getDb();
    const transaction = db.transaction(() => {
        db.prepare('DELETE FROM transcripts WHERE session_id = ?').run(id);
        db.prepare('DELETE FROM ai_messages WHERE session_id = ?').run(id);
        db.prepare('DELETE FROM summaries WHERE session_id = ?').run(id);
        db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
    });

    transaction();
    return { success: true };
}

function end(id: string): { changes: number } {
    const db = sqliteClient.getDb();
    const now = Math.floor(Date.now() / 1000);
    const query = `UPDATE sessions SET ended_at = ?, updated_at = ? WHERE id = ?`;
    const result = db.prepare(query).run(now, now, id);
    return { changes: result.changes };
}

function updateType({ id, type }: { id: string; type: SessionType }): { changes: number } {
    const db = sqliteClient.getDb();
    const now = Math.floor(Date.now() / 1000);
    const query = 'UPDATE sessions SET session_type = ?, updated_at = ? WHERE id = ?';
    const result = db.prepare(query).run(type, now, id);
    return { changes: result.changes };
}

function touch(id: string): { changes: number } {
    const db = sqliteClient.getDb();
    const now = Math.floor(Date.now() / 1000);
    const query = 'UPDATE sessions SET updated_at = ? WHERE id = ?';
    const result = db.prepare(query).run(now, id);
    return { changes: result.changes };
}

function getOrCreateActive({ uid, requestedType = 'ask' }: { uid: string; requestedType?: SessionType }): string {
    const db = sqliteClient.getDb();

    // 1. Look for ANY active session for the user (ended_at IS NULL).
    //    Prefer 'listen' sessions over 'ask' sessions to ensure continuity.
    const findQuery = `
        SELECT id, session_type FROM sessions
        WHERE uid = ? AND ended_at IS NULL
        ORDER BY CASE session_type WHEN 'listen' THEN 1 WHEN 'ask' THEN 2 ELSE 3 END
        LIMIT 1
    `;

    const row = db.prepare(findQuery).get(uid);
    const activeSession = row === undefined ? undefined : ActiveSessionSchema.parse(row);

    if (activeSession) {
        // An active session exists.
        log.info({ sessionId: activeSession.id, type: activeSession.session_type }, 'Found active session');

        // 2. Promotion Logic: If it's an 'ask' session and we need 'listen', promote it.
        if (activeSession.session_type === 'ask' && requestedType === 'listen') {
            updateType({ id: activeSession.id, type: 'listen' });
            log.info({ sessionId: activeSession.id }, "Promoted session to 'listen'");
        }

        // 3. Touch the session and return its ID.
        touch(activeSession.id);
        return activeSession.id;
    } else {
        // 4. No active session found, create a new one.
        log.info({ uid, type: requestedType }, 'No active session, creating one');
        return create({ uid, type: requestedType });
    }
}

function endAllActiveSessions(uid: string): { changes: number } {
    const db = sqliteClient.getDb();
    const now = Math.floor(Date.now() / 1000);
    // Filter by uid to match the Firebase repository's behavior.
    const query = `UPDATE sessions SET ended_at = ?, updated_at = ? WHERE ended_at IS NULL AND uid = ?`;

    try {
        const result = db.prepare(query).run(now, now, uid);
        log.info({ uid, ended: result.changes }, 'Ended active sessions');
        return { changes: result.changes };
    } catch (err) {
        log.error({ err, uid }, 'Failed to end all active sessions');
        throw err;
    }
}

function findLatestUnfinishedListen(uid: string): SessionRow | undefined {
    const db = sqliteClient.getDb();
    const query = `
        SELECT * FROM sessions
        WHERE uid = ?
          AND session_type = 'listen'
          AND ended_at IS NULL
        ORDER BY started_at DESC
        LIMIT 1
    `;
    return parseOptionalRow(db.prepare(query).get(uid));
}

export {
    getById,
    create,
    getAllByUserId,
    updateTitle,
    deleteWithRelatedData,
    end,
    updateType,
    touch,
    getOrCreateActive,
    endAllActiveSessions,
    findLatestUnfinishedListen,
};
