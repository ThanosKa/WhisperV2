import * as sqliteRepository from './sqlite.repository';
import type { SessionType } from './sqlite.repository';
import type { AuthService } from '../../services/authService';
import { logger } from '../../utils/logger';

export type { SessionRow, SessionType } from './sqlite.repository';

const log = logger.child({ module: 'SessionRepository' });

// authService sets itself here in its constructor; importing it would close a cycle at load.
let authService: Pick<AuthService, 'getCurrentUserId'> | null = null;

function setAuthService(service: Pick<AuthService, 'getCurrentUserId'>): void {
    authService = service;
}

function getBaseRepository() {
    // Always use SQLite for local-first data strategy
    // Firebase repository disabled in favor of webapp authentication with local storage
    return sqliteRepository;
}

function currentUserId(): string | null {
    if (!authService) {
        throw new Error('SessionRepository used before authService was set');
    }
    return authService.getCurrentUserId();
}

// The adapter layer that injects the UID
const sessionRepositoryAdapter = {
    setAuthService, // Expose the setter

    getById: (id: string) => getBaseRepository().getById(id),

    create: (type: SessionType = 'ask') => {
        const uid = currentUserId();
        if (!uid) {
            log.warn('Cannot create session: user not authenticated');
            return null;
        }
        return getBaseRepository().create({ uid, type });
    },

    getAllByUserId: () => {
        const uid = currentUserId();
        if (!uid) {
            log.warn('Cannot get sessions: user not authenticated');
            return [];
        }
        return getBaseRepository().getAllByUserId(uid);
    },

    updateTitle: ({ id, title }: { id: string; title: string }) => getBaseRepository().updateTitle({ id, title }),

    deleteWithRelatedData: (id: string) => getBaseRepository().deleteWithRelatedData(id),

    end: (id: string) => getBaseRepository().end(id),

    updateType: ({ id, type }: { id: string; type: SessionType }) => getBaseRepository().updateType({ id, type }),

    touch: (id: string) => getBaseRepository().touch(id),

    getOrCreateActive: (requestedType: SessionType = 'ask') => {
        const uid = currentUserId();
        if (!uid) {
            log.warn('Cannot get or create active session: user not authenticated');
            return null;
        }
        return getBaseRepository().getOrCreateActive({ uid, requestedType });
    },

    endAllActiveSessions: () => {
        const uid = currentUserId();
        if (!uid) {
            log.info('Skipping endAllActiveSessions: user not authenticated');
            return Promise.resolve();
        }
        return getBaseRepository().endAllActiveSessions(uid);
    },

    findLatestUnfinishedListen: () => {
        const uid = currentUserId();
        if (!uid) return null;
        return getBaseRepository().findLatestUnfinishedListen(uid);
    },
};

export default sessionRepositoryAdapter;
