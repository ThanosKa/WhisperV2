const sqliteClient = require('../../../common/services/sqliteClient');
const crypto = require('crypto');

function saveInsight({ sessionId, analysisRound, payload }) {
    const db = sqliteClient.getDb();
    const id = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);
    const payloadJson = JSON.stringify(payload);
    
    const query = `INSERT INTO session_insights (id, session_id, analysis_round, payload_json, created_at) VALUES (?, ?, ?, ?, ?)`;
    try {
        db.prepare(query).run(id, sessionId, analysisRound, payloadJson, now);
        return { id };
    } catch (err) {
        console.error('[InsightsRepo] Save failed:', err);
        throw err;
    }
}

function getLatestInsightBySessionId(sessionId) {
    const db = sqliteClient.getDb();
    const query = `SELECT * FROM session_insights WHERE session_id = ? ORDER BY created_at DESC LIMIT 1`;
    const row = db.prepare(query).get(sessionId);
    if (!row) return null;
    return {
        ...row,
        payload: JSON.parse(row.payload_json)
    };
}

function getAllInsightsBySessionId(sessionId) {
    const db = sqliteClient.getDb();
    const query = `SELECT * FROM session_insights WHERE session_id = ? ORDER BY analysis_round ASC`;
    const rows = db.prepare(query).all(sessionId);
    return rows.map(row => ({
        ...row,
        payload: JSON.parse(row.payload_json)
    }));
}

module.exports = { saveInsight, getLatestInsightBySessionId, getAllInsightsBySessionId };

