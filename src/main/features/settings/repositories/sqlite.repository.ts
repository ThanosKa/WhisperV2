import { z } from 'zod';
import sqliteClient from '../../common/services/sqliteClient';
import { ResolvedPresetSchema } from '../../common/repositories/preset/sqlite.repository';
import type { ResolvedPreset } from '../../common/repositories/preset/sqlite.repository';
import { logger } from '../../common/utils/logger';

const log = logger.child({ module: 'SettingsRepository' });

const AutoUpdateRowSchema = z.object({ auto_update_enabled: z.number().nullable() });

function getPresets(uid: string | null): ResolvedPreset[] {
    const db = sqliteClient.getDb();
    const normalizedUid = uid && uid !== 'undefined' && uid !== 'null' ? uid : null;
    const targetUid = normalizedUid || sqliteClient.defaultUserId;
    const includeCustomPresets = !!normalizedUid;

    const query = `
        SELECT
            p.id,
            p.uid,
            p.title,
            p.prompt,
            p.is_default,
            p.created_at,
            p.sync_state,
            CASE
                WHEN p.is_default = 1 THEN COALESCE(o.append_text, '')
                ELSE COALESCE(p.append_text, '')
            END AS append_text
        FROM prompt_presets p
        LEFT JOIN preset_append_overrides o
            ON p.id = o.preset_id AND o.uid = ?
        WHERE p.is_default = 1${includeCustomPresets ? ' OR p.uid = ?' : ''}
        ORDER BY p.is_default DESC, p.title ASC
    `;

    try {
        const params = includeCustomPresets ? [targetUid, normalizedUid] : [targetUid];
        return z.array(ResolvedPresetSchema).parse(db.prepare(query).all(...params));
    } catch (err) {
        log.error({ err, uid }, 'Failed to get presets');
        throw err;
    }
}

function getAutoUpdate(uid: string | null): boolean {
    const db = sqliteClient.getDb();
    const targetUid = uid;

    try {
        const found: unknown = db.prepare('SELECT auto_update_enabled FROM users WHERE uid = ?').get(targetUid);
        const row = found === undefined ? undefined : AutoUpdateRowSchema.parse(found);

        if (row) {
            log.info({ autoUpdateEnabled: row.auto_update_enabled }, 'Auto update setting found');
            return row.auto_update_enabled !== 0;
        } else {
            // User doesn't exist, create them with default settings
            const now = Math.floor(Date.now() / 1000);
            const stmt = db.prepare(
                'INSERT OR REPLACE INTO users (uid, display_name, email, created_at, auto_update_enabled) VALUES (?, ?, ?, ?, ?)'
            );
            stmt.run(targetUid, 'User', 'user@example.com', now, 1);
            return true; // default to enabled
        }
    } catch (error) {
        log.error({ err: error, uid }, 'Error getting auto_update_enabled setting');
        return true; // fallback to enabled
    }
}

function setAutoUpdate({ uid, isEnabled }: { uid: string | null; isEnabled: boolean }): { success: true } {
    const db = sqliteClient.getDb();
    const targetUid = uid || sqliteClient.defaultUserId;

    try {
        const result = db.prepare('UPDATE users SET auto_update_enabled = ? WHERE uid = ?').run(isEnabled ? 1 : 0, targetUid);

        // If no rows were updated, the user might not exist, so create them
        if (result.changes === 0) {
            const now = Math.floor(Date.now() / 1000);
            const stmt = db.prepare(
                'INSERT OR REPLACE INTO users (uid, display_name, email, created_at, auto_update_enabled) VALUES (?, ?, ?, ?, ?)'
            );
            stmt.run(targetUid, 'User', 'user@example.com', now, isEnabled ? 1 : 0);
        }

        return { success: true };
    } catch (error) {
        log.error({ err: error, uid }, 'Error setting auto-update');
        throw error;
    }
}

export { getPresets, getAutoUpdate, setAutoUpdate };
