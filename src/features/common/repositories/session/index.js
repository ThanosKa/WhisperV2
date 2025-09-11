const sqliteRepository = require('./sqlite.repository');

let authService = null;

function setAuthService(service) {
    authService = service;
}

function getBaseRepository() {
    if (!authService) {
        // Fallback or error if authService is not set, to prevent crashes.
        // During initial load, it might not be set, so we default to sqlite.
        return sqliteRepository;
    }
    // Always use SQLite for local-first data strategy
    // Firebase repository disabled in favor of webapp authentication with local storage
    return sqliteRepository;
}

// The adapter layer that injects the UID
const sessionRepositoryAdapter = {
    setAuthService, // Expose the setter

    getById: id => getBaseRepository().getById(id),

    create: (type = 'ask') => {
        const uid = authService.getCurrentUserId();
        if (!uid) {
            console.warn('[SessionRepository] Cannot create session: user not authenticated');
            return null;
        }
        return getBaseRepository().create(uid, type);
    },

    getAllByUserId: () => {
        const uid = authService.getCurrentUserId();
        if (!uid) {
            console.warn('[SessionRepository] Cannot get sessions: user not authenticated');
            return [];
        }
        return getBaseRepository().getAllByUserId(uid);
    },

    updateTitle: (id, title) => getBaseRepository().updateTitle(id, title),

    deleteWithRelatedData: id => getBaseRepository().deleteWithRelatedData(id),

    end: id => getBaseRepository().end(id),

    updateType: (id, type) => getBaseRepository().updateType(id, type),

    touch: id => getBaseRepository().touch(id),

    getOrCreateActive: (requestedType = 'ask') => {
        const uid = authService.getCurrentUserId();
        if (!uid) {
            console.warn('[SessionRepository] Cannot get/create active session: user not authenticated');
            return null;
        }
        return getBaseRepository().getOrCreateActive(uid, requestedType);
    },

    endAllActiveSessions: () => {
        const uid = authService.getCurrentUserId();
        if (!uid) {
            console.log('[SessionRepository] Skipping endAllActiveSessions: user not authenticated');
            return Promise.resolve();
        }
        return getBaseRepository().endAllActiveSessions(uid);
    },
};

module.exports = sessionRepositoryAdapter;
