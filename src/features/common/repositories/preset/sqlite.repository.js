const sqliteClient = require('../../services/sqliteClient');

function getPresets(uid) {
    const db = sqliteClient.getDb();
    const query = `
        SELECT * FROM prompt_presets 
        ORDER BY is_default DESC, title ASC
    `;

    try {
        return db.prepare(query).all();
    } catch (err) {
        console.error('SQLite: Failed to get presets:', err);
        throw err;
    }
}

function getById(id) {
    const db = sqliteClient.getDb();
    const query = `SELECT * FROM prompt_presets WHERE id = ?`;
    try {
        return db.prepare(query).get(id) || null;
    } catch (err) {
        console.error('SQLite: Failed to get preset by id:', err);
        throw err;
    }
}

function findUserPresetByTitle(title, uid) {
    const db = sqliteClient.getDb();
    const query = `SELECT * FROM prompt_presets WHERE uid = ? AND is_default = 0 AND LOWER(title) = LOWER(?)`;
    try {
        return db.prepare(query).get(uid, title) || null;
    } catch (err) {
        console.error('SQLite: Failed to find user preset by title:', err);
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
        return db.prepare(query).all();
    } catch (err) {
        console.error('SQLite: Failed to get preset templates:', err);
        throw err;
    }
}

function create({ uid, title, prompt }) {
    const db = sqliteClient.getDb();
    const presetId = require('crypto').randomUUID();
    const now = Math.floor(Date.now() / 1000);
    const query = `INSERT INTO prompt_presets (id, uid, title, prompt, is_default, created_at, sync_state) VALUES (?, ?, ?, ?, 0, ?, 'dirty')`;

    try {
        db.prepare(query).run(presetId, uid, title, prompt, now);
        return { id: presetId };
    } catch (err) {
        throw err;
    }
}

function update(id, { title, prompt }, uid) {
    const db = sqliteClient.getDb();
    // Allow updating both user presets and defaults; only deletion is blocked for defaults
    const query = `UPDATE prompt_presets SET title = ?, prompt = ?, sync_state = 'dirty' WHERE id = ? AND (uid = ? OR is_default = 1)`;

    try {
        const result = db.prepare(query).run(title, prompt, id, uid);
        if (result.changes === 0) {
            throw new Error('Preset not found or permission denied.');
        }
        return { changes: result.changes };
    } catch (err) {
        throw err;
    }
}

function del(id, uid) {
    const db = sqliteClient.getDb();
    const query = `DELETE FROM prompt_presets WHERE id = ? AND uid = ? AND is_default = 0`;

    try {
        const result = db.prepare(query).run(id, uid);
        if (result.changes === 0) {
            throw new Error('Preset not found or permission denied.');
        }
        return { changes: result.changes };
    } catch (err) {
        throw err;
    }
}

module.exports = {
    getPresets,
    getById,
    findUserPresetByTitle,
    getPresetTemplates,
    create,
    update,
    delete: del,
};
