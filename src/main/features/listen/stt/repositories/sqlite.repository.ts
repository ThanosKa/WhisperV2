import { randomUUID } from 'crypto';
import { z } from 'zod';
import sqliteClient from '../../../common/services/sqliteClient';
import { logger } from '../../../common/utils/logger';

const log = logger.child({ module: 'SttRepository' });

// A row of `transcripts` (config/schema.ts). Only `id` and `session_id` are NOT NULL.
export const TranscriptRowSchema = z.object({
    id: z.string(),
    session_id: z.string(),
    start_at: z.number().nullable(),
    end_at: z.number().nullable(),
    speaker: z.string().nullable(),
    text: z.string().nullable(),
    lang: z.string().nullable(),
    created_at: z.number().nullable(),
    sync_state: z.string().nullable(),
});

export type TranscriptRow = z.infer<typeof TranscriptRowSchema>;

export type NewTranscript = { uid: string | null; sessionId: string; speaker: string; text: string };

function addTranscript({ sessionId, speaker, text }: NewTranscript): { id: string } {
    // uid is ignored in the SQLite implementation
    const db = sqliteClient.getDb();
    const transcriptId = randomUUID();
    const now = Math.floor(Date.now() / 1000);
    const query = `INSERT INTO transcripts (id, session_id, start_at, speaker, text, created_at) VALUES (?, ?, ?, ?, ?, ?)`;

    try {
        db.prepare(query).run(transcriptId, sessionId, now, speaker, text, now);
        return { id: transcriptId };
    } catch (err) {
        log.error({ err, sessionId }, 'Failed to add transcript');
        throw err;
    }
}

function getAllTranscriptsBySessionId(sessionId: string): TranscriptRow[] {
    const db = sqliteClient.getDb();
    const query = 'SELECT * FROM transcripts WHERE session_id = ? ORDER BY start_at ASC';
    return z.array(TranscriptRowSchema).parse(db.prepare(query).all(sessionId));
}

export { addTranscript, getAllTranscriptsBySessionId };
