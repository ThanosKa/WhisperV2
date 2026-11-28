import { z } from 'zod';
import sqliteClient from '../../../common/services/sqliteClient';
import { logger } from '../../../common/utils/logger';

const log = logger.child({ module: 'SummaryRepository' });

// A row of `summaries` (config/schema.ts). Only `session_id` is NOT NULL.
export const SummaryRowSchema = z.object({
    session_id: z.string(),
    generated_at: z.number().nullable(),
    model: z.string().nullable(),
    text: z.string().nullable(),
    tldr: z.string().nullable(),
    bullet_json: z.string().nullable(),
    action_json: z.string().nullable(),
    tokens_used: z.number().nullable(),
    updated_at: z.number().nullable(),
    sync_state: z.string().nullable(),
});

export type SummaryRow = z.infer<typeof SummaryRowSchema>;

export type NewSummary = {
    uid: string | null;
    sessionId: string;
    tldr: string | null | undefined;
    text: string;
    bullet_json: string;
    action_json: string;
    model?: string | undefined;
};

function saveSummary({ sessionId, tldr, text, bullet_json, action_json, model = 'unknown' }: NewSummary): Promise<{ changes: number }> {
    // uid is ignored in the SQLite implementation
    return new Promise((resolve, reject) => {
        try {
            const db = sqliteClient.getDb();
            const now = Math.floor(Date.now() / 1000);
            const query = `
                INSERT INTO summaries (session_id, generated_at, model, text, tldr, bullet_json, action_json, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(session_id) DO UPDATE SET
                    generated_at=excluded.generated_at,
                    model=excluded.model,
                    text=excluded.text,
                    tldr=excluded.tldr,
                    bullet_json=excluded.bullet_json,
                    action_json=excluded.action_json,
                    updated_at=excluded.updated_at
            `;

            const result = db.prepare(query).run(sessionId, now, model, text, tldr, bullet_json, action_json, now);
            resolve({ changes: result.changes });
        } catch (err) {
            log.error({ err, sessionId }, 'Failed to save summary');
            reject(err);
        }
    });
}

function getSummaryBySessionId(sessionId: string): SummaryRow | null {
    const db = sqliteClient.getDb();
    const query = 'SELECT * FROM summaries WHERE session_id = ?';
    const row: unknown = db.prepare(query).get(sessionId);
    return row ? SummaryRowSchema.parse(row) : null;
}

export { saveSummary, getSummaryBySessionId };
