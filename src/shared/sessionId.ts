import { z } from 'zod';

// The id of a row in `sessions`, kept apart from the other string ids (user, preset, relay session).
// A SessionId comes from the session repository, from a parsed row, or from this schema at a
// boundary (IPC, the dashboard's requests). What writes or holds a session id takes a SessionId;
// the lookups (`getById`, `get…BySessionId`, `handleRecoveryAction`) take any string, since they only
// match it against stored ids and the listen and crash-recovery tests call them with plain strings.
export const SessionIdSchema = z.string().brand<'SessionId'>();

export type SessionId = z.infer<typeof SessionIdSchema>;
