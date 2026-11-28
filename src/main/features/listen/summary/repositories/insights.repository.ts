import crypto from 'crypto';
import { z } from 'zod';
import { SessionIdSchema, type SessionId } from '../../../../../shared/sessionId';
import sqliteClient from '../../../common/services/sqliteClient';
import { logger } from '../../../common/utils/logger';

const log = logger.child({ module: 'InsightsRepository' });

// What summaryService saves after each analysis round, as JSON in `payload_json`. Every version
// that wrote this table saved these four fields; `sections` has always been empty.
export const InsightPayloadSchema = z.object({
    summary: z.array(z.string()),
    actions: z.array(z.string()),
    followUps: z.array(z.string()),
    sections: z.array(z.unknown()),
});

export type InsightPayload = z.infer<typeof InsightPayloadSchema>;

// A row of `session_insights` (config/schema.ts); every column is NOT NULL.
const InsightRowSchema = z.object({
    id: z.string(),
    session_id: SessionIdSchema,
    analysis_round: z.number(),
    payload_json: z.string(),
    created_at: z.number(),
});

export type InsightRow = z.infer<typeof InsightRowSchema>;

export type Insight = InsightRow & { payload: InsightPayload };

function saveInsight({ sessionId, analysisRound, payload }: { sessionId: SessionId; analysisRound: number; payload: InsightPayload }): {
    id: string;
} {
    const db = sqliteClient.getDb();
    const id = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);
    const payloadJson = JSON.stringify(payload);

    const query = `INSERT INTO session_insights (id, session_id, analysis_round, payload_json, created_at) VALUES (?, ?, ?, ?, ?)`;
    try {
        db.prepare(query).run(id, sessionId, analysisRound, payloadJson, now);
        return { id };
    } catch (err) {
        log.error({ err, sessionId, analysisRound }, 'Failed to save insight');
        throw err;
    }
}

function getAllInsightsBySessionId(sessionId: string): Insight[] {
    const db = sqliteClient.getDb();
    const query = `SELECT * FROM session_insights WHERE session_id = ? ORDER BY analysis_round ASC`;
    const rows = z.array(InsightRowSchema).parse(db.prepare(query).all(sessionId));
    return rows.map(row => ({
        ...row,
        payload: InsightPayloadSchema.parse(JSON.parse(row.payload_json)),
    }));
}

export { saveInsight, getAllInsightsBySessionId };
