import { z } from 'zod';
import sqliteClient from '../../services/sqliteClient';
import { logger } from '../../utils/logger';
import { errorMessage } from '../../utils/errors';

const log = logger.child({ module: 'UserRepository' });

// A row of `users` (config/schema.ts).
export const UserRowSchema = z.object({
    uid: z.string(),
    display_name: z.string(),
    email: z.string(),
    created_at: z.number().nullable(),
    auto_update_enabled: z.number().nullable(),
});

export type UserRow = z.infer<typeof UserRowSchema>;

// What `findOrCreate` needs from a signed-in user; a WhisperAPP profile has these fields.
export type NewUser = { uid: string; displayName?: string | null | undefined; email?: string | null | undefined };

const SessionIdRowSchema = z.object({ id: z.string() });

function findOrCreate(user: NewUser | null | undefined): UserRow | null | undefined {
    const db = sqliteClient.getDb();

    if (!user || !user.uid) {
        throw new Error('User object and uid are required');
    }

    const { uid, displayName, email } = user;
    const now = Math.floor(Date.now() / 1000);

    // Validate inputs
    const safeDisplayName = displayName || 'User';
    const safeEmail = email || 'no-email@example.com';

    const query = `
        INSERT INTO users (uid, display_name, email, created_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(uid) DO UPDATE SET
            display_name=excluded.display_name,
            email=excluded.email
    `;

    try {
        log.info({ uid, displayName: safeDisplayName, email: safeEmail }, 'Creating or updating user');
        db.prepare(query).run(uid, safeDisplayName, safeEmail, now);
        const result = getById(uid);
        log.info({ uid, user: result }, 'User operation successful');
        return result;
    } catch (err) {
        log.error({ err, uid, displayName: safeDisplayName, email: safeEmail }, 'Failed to find or create user');
        throw new Error(`Failed to create user in database: ${errorMessage(err)}`);
    }
}

function getById(uid: string | null | undefined): UserRow | null | undefined {
    const db = sqliteClient.getDb();
    log.info({ uid }, 'getById called');

    if (!uid || uid === 'undefined' || uid === 'null') {
        log.info({ uid }, 'Invalid uid provided, returning null');
        return null;
    }

    const row = db.prepare('SELECT * FROM users WHERE uid = ?').get(uid);
    const result = row === undefined ? undefined : UserRowSchema.parse(row);
    log.info({ uid, user: result }, 'getById result');

    if (!result) {
        log.info({ uid }, 'No user found in the local database yet');
    }

    return result;
}

function update({ uid, displayName }: { uid: string; displayName: string }): { changes: number } {
    const db = sqliteClient.getDb();
    const result = db.prepare('UPDATE users SET display_name = ? WHERE uid = ?').run(displayName, uid);
    return { changes: result.changes };
}

function deleteById(uid: string | null): { success: true } {
    const db = sqliteClient.getDb();
    const userSessions = z.array(SessionIdRowSchema).parse(db.prepare('SELECT id FROM sessions WHERE uid = ?').all(uid));
    const sessionIds = userSessions.map(s => s.id);

    const transaction = db.transaction(() => {
        if (sessionIds.length > 0) {
            const placeholders = sessionIds.map(() => '?').join(',');
            db.prepare(`DELETE FROM transcripts WHERE session_id IN (${placeholders})`).run(...sessionIds);
            db.prepare(`DELETE FROM ai_messages WHERE session_id IN (${placeholders})`).run(...sessionIds);
            db.prepare(`DELETE FROM summaries WHERE session_id IN (${placeholders})`).run(...sessionIds);
            db.prepare(`DELETE FROM sessions WHERE uid = ?`).run(uid);
        }
        db.prepare('DELETE FROM prompt_presets WHERE uid = ? AND is_default = 0').run(uid);
        db.prepare('DELETE FROM users WHERE uid = ?').run(uid);
    });

    transaction();
    return { success: true };
}

export { findOrCreate, getById, update, deleteById };
