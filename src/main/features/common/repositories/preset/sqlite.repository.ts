import { z } from 'zod';
import sqliteClient from '../../services/sqliteClient';
import { logger } from '../../utils/logger';

const log = logger.child({ module: 'PresetRepository' });

// A row of `prompt_presets` (config/schema.ts), as `SELECT *` reads it.
export const PresetRowSchema = z.object({
    id: z.string(),
    uid: z.string(),
    title: z.string(),
    prompt: z.string(),
    is_default: z.number(),
    created_at: z.number().nullable(),
    sync_state: z.string().nullable(),
    append_text: z.string().nullable(),
});

export type PresetRow = z.infer<typeof PresetRowSchema>;

// A preset with the user's append text resolved (the per-user override for a default preset).
export const ResolvedPresetSchema = PresetRowSchema.extend({ append_text: z.string() });

export type ResolvedPreset = z.infer<typeof ResolvedPresetSchema>;

export type PresetChanges = { title?: string | undefined; prompt?: string | undefined; append_text?: string | null | undefined };

const normalizeUid = (uid: string | null | undefined): string | null => (uid && uid !== 'undefined' && uid !== 'null' ? uid : null);

const RESOLVED_PRESET_COLUMNS = `
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
            END AS append_text`;

function getPresets(uid: string | null): ResolvedPreset[] {
    const db = sqliteClient.getDb();

    const normalizedUid = normalizeUid(uid);
    const targetUid = normalizedUid || sqliteClient.defaultUserId;

    const baseQuery = `
        SELECT ${RESOLVED_PRESET_COLUMNS}
        FROM prompt_presets p
        LEFT JOIN preset_append_overrides o
            ON p.id = o.preset_id AND o.uid = ?
        WHERE p.is_default = 1${normalizedUid ? ' OR p.uid = ?' : ''}
        ORDER BY p.is_default DESC, p.title ASC
    `;

    try {
        const params = normalizedUid ? [targetUid, normalizedUid] : [targetUid];
        return z.array(ResolvedPresetSchema).parse(db.prepare(baseQuery).all(...params));
    } catch (err) {
        log.error({ err, uid }, 'Failed to get presets');
        throw err;
    }
}

function getById({ id, uid }: { id: string; uid: string | null }): ResolvedPreset | null {
    const db = sqliteClient.getDb();
    const targetUid = normalizeUid(uid) || sqliteClient.defaultUserId;

    const query = `
        SELECT ${RESOLVED_PRESET_COLUMNS}
        FROM prompt_presets p
        LEFT JOIN preset_append_overrides o
            ON p.id = o.preset_id AND o.uid = ?
        WHERE p.id = ?
    `;

    try {
        const row = db.prepare(query).get(targetUid, id);
        return row === undefined ? null : ResolvedPresetSchema.parse(row);
    } catch (err) {
        log.error({ err, presetId: id, uid }, 'Failed to get preset by id');
        throw err;
    }
}

function findUserPresetByTitle({ title, uid }: { title: string; uid: string | null }): PresetRow | null {
    const db = sqliteClient.getDb();
    const query = `SELECT * FROM prompt_presets WHERE uid = ? AND is_default = 0 AND LOWER(title) = LOWER(?)`;
    try {
        const row = db.prepare(query).get(uid, title);
        return row === undefined ? null : PresetRowSchema.parse(row);
    } catch (err) {
        log.error({ err, uid }, 'Failed to find user preset by title');
        throw err;
    }
}

function getPresetTemplates(): PresetRow[] {
    const db = sqliteClient.getDb();
    const query = `
        SELECT * FROM prompt_presets
        WHERE is_default = 1
        ORDER BY title ASC
    `;

    try {
        return z.array(PresetRowSchema).parse(db.prepare(query).all());
    } catch (err) {
        log.error({ err }, 'Failed to get preset templates');
        throw err;
    }
}

function update({ id, changes, uid }: { id: string; changes: PresetChanges; uid: string | null }): { changes: number } {
    const { title, prompt, append_text } = changes;
    const db = sqliteClient.getDb();
    const row = db.prepare('SELECT * FROM prompt_presets WHERE id = ?').get(id);
    if (row === undefined) {
        throw new Error('Preset not found');
    }
    const current = PresetRowSchema.parse(row);

    if (current.is_default === 1) {
        if (prompt !== undefined && prompt !== current.prompt) {
            throw new Error('Cannot modify prompt for default presets');
        }

        const txn = db.transaction(() => {
            if (title !== undefined && title !== current.title) {
                const result = db
                    .prepare("UPDATE prompt_presets SET title = ?, sync_state = 'dirty' WHERE id = ? AND is_default = 1")
                    .run(title, id);
                if (result.changes === 0) {
                    throw new Error('Permission denied');
                }
            } else {
                db.prepare("UPDATE prompt_presets SET sync_state = 'dirty' WHERE id = ? AND is_default = 1").run(id);
            }

            if (append_text !== undefined) {
                const targetUid = normalizeUid(uid) || sqliteClient.defaultUserId;
                const normalized = append_text || '';
                const timestamp = Math.floor(Date.now() / 1000);

                if (normalized) {
                    db.prepare(
                        `INSERT INTO preset_append_overrides (preset_id, uid, append_text, updated_at)
                         VALUES (?, ?, ?, ?)
                         ON CONFLICT(preset_id, uid) DO UPDATE SET append_text = excluded.append_text, updated_at = excluded.updated_at`
                    ).run(id, targetUid, normalized, timestamp);
                } else {
                    db.prepare('DELETE FROM preset_append_overrides WHERE preset_id = ? AND uid = ?').run(id, targetUid);
                }

                db.prepare('UPDATE prompt_presets SET append_text = NULL WHERE id = ?').run(id);
            }
        });

        txn();
        return { changes: 1 };
    }

    const result = db
        .prepare(
            `UPDATE prompt_presets
             SET title = ?, prompt = ?, append_text = ?, sync_state = 'dirty'
             WHERE id = ? AND uid = ?`
        )
        .run(title, prompt, append_text != null ? append_text : '', id, uid);
    if (result.changes === 0) {
        throw new Error('Preset not found or permission denied.');
    }
    return { changes: result.changes };
}

export { getPresets, getById, findUserPresetByTitle, getPresetTemplates, update };
