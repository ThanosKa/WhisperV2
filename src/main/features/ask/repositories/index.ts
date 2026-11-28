import * as sqliteRepository from './sqlite.repository';
import type { NewAiMessage } from './sqlite.repository';
import authService from '../../common/services/authService';

function getBaseRepository() {
    // Always use SQLite for local-first data strategy
    // Firebase repository disabled in favor of webapp authentication with local storage
    return sqliteRepository;
}

// The adapter layer that injects the UID
const askRepositoryAdapter = {
    addAiMessage: ({ sessionId, role, content, model }: Omit<NewAiMessage, 'uid'>) => {
        const uid = authService.getCurrentUserId();
        return getBaseRepository().addAiMessage({ uid, sessionId, role, content, model });
    },
    getAllAiMessagesBySessionId: (sessionId: string) => {
        // This function does not require a UID at the service level.
        return getBaseRepository().getAllAiMessagesBySessionId(sessionId);
    }
};

export type { AiMessageRow } from './sqlite.repository';

export default askRepositoryAdapter; 