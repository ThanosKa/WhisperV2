import * as sqliteRepository from './sqlite.repository';
import authService from '../../../common/services/authService';

export type { TranscriptRow } from './sqlite.repository';

function getBaseRepository() {
    // Always use SQLite for local-first data strategy
    // Firebase repository disabled in favor of webapp authentication with local storage
    return sqliteRepository;
}

const sttRepositoryAdapter = {
    addTranscript: ({ sessionId, speaker, text }: { sessionId: string; speaker: string; text: string }) => {
        const uid = authService.getCurrentUserId();
        return getBaseRepository().addTranscript({ uid, sessionId, speaker, text });
    },
    getAllTranscriptsBySessionId: (sessionId: string) => {
        return getBaseRepository().getAllTranscriptsBySessionId(sessionId);
    },
};

export default sttRepositoryAdapter;
