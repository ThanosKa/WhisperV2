import { randomUUID } from 'crypto';
import { z } from 'zod';
import sqliteClient from '../../common/services/sqliteClient';
import { logger } from '../../common/utils/logger';

const log = logger.child({ module: 'AskRepository' });

// A row of `ai_messages` (common/config/schema.ts), as `SELECT *` reads it.
export const AiMessageRowSchema = z.object({
    id: z.string(),
    session_id: z.string(),
    sent_at: z.number().nullable(),
    role: z.string().nullable(),
    content: z.string().nullable(),
    tokens: z.number().nullable(),
    model: z.string().nullable(),
    created_at: z.number().nullable(),
    sync_state: z.string().nullable(),
});

export type AiMessageRow = z.infer<typeof AiMessageRowSchema>;

export type NewAiMessage = {
    // Ignored by the SQLite implementation.
    uid: string | null;
    sessionId: string | null;
    role: string;
    content: string;
    model?: string | undefined;
};

function addAiMessage({ sessionId, role, content, model = 'unknown' }: NewAiMessage) {
    // uid is ignored in the SQLite implementation
    const db = sqliteClient.getDb();
    const messageId = randomUUID();
    const now = Math.floor(Date.now() / 1000);
    const query = `INSERT INTO ai_messages (id, session_id, sent_at, role, content, model, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`;
    
    try {
        db.prepare(query).run(messageId, sessionId, now, role, content, model, now);
        return { id: messageId };
    } catch (err) {
        log.error({ err, sessionId }, 'Failed to add AI message');
        throw err;
    }
}

function getAllAiMessagesBySessionId(sessionId: string): AiMessageRow[] {
    const db = sqliteClient.getDb();
    const query = "SELECT * FROM ai_messages WHERE session_id = ? ORDER BY sent_at ASC";
    return z.array(AiMessageRowSchema).parse(db.prepare(query).all(sessionId));
}

export {
    addAiMessage,
    getAllAiMessagesBySessionId
}; 