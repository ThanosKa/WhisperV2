const sqliteClient = require('../../common/services/sqliteClient');

function getPresets(uid) {
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
        return db.prepare(query).all(...params);
    } catch (err) {
        console.error('SQLite: Failed to get presets:', err);
        throw err;
    }
}

function getPresetTemplates() {
    const db = sqliteClient.getDb();
    const query = `
        SELECT * FROM prompt_presets 
        WHERE is_default = 1 
        ORDER BY title ASC
    `;

    try {
        return db.prepare(query).all() || [];
    } catch (err) {
        console.error('SQLite: Failed to get preset templates:', err);
        throw err;
    }
}

function updatePreset(id, { title, prompt, append_text }, uid) {
    const db = sqliteClient.getDb();
    const current = db.prepare('SELECT * FROM prompt_presets WHERE id = ?').get(id);
    if (!current) {
        throw new Error('Preset not found');
    }

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
                const targetUid = uid && uid !== 'undefined' && uid !== 'null' ? uid : sqliteClient.defaultUserId;
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
            `
            UPDATE prompt_presets 
            SET title = ?, prompt = ?, append_text = ?, sync_state = 'dirty'
            WHERE id = ? AND uid = ?
        `
        )
        .run(title, prompt, append_text != null ? append_text : '', id, uid);
    if (result.changes === 0) {
        throw new Error('Preset not found or permission denied');
    }
    return { changes: result.changes };
}

function getAutoUpdate(uid) {
    const db = sqliteClient.getDb();
    const targetUid = uid;

    try {
        const row = db.prepare('SELECT auto_update_enabled FROM users WHERE uid = ?').get(targetUid);

        if (row) {
            console.log('SQLite: Auto update setting found:', row.auto_update_enabled);
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
        console.error('SQLite: Error getting auto_update_enabled setting:', error);
        return true; // fallback to enabled
    }
}

function setAutoUpdate(uid, isEnabled) {
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
        console.error('SQLite: Error setting auto-update:', error);
        throw error;
    }
}

module.exports = {
    getPresets,
    getPresetTemplates,
    updatePreset,
    getAutoUpdate,
    setAutoUpdate,
};
