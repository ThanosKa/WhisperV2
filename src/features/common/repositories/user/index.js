const sqliteRepository = require('./sqlite.repository');

let authService = null;

function getAuthService() {
    if (!authService) {
        authService = require('../../services/authService');
    }
    return authService;
}

function getBaseRepository() {
    const service = getAuthService();
    if (!service) {
        throw new Error('AuthService could not be loaded for the user repository.');
    }
    const user = service.getCurrentUser();
    // Always use SQLite for local-first data strategy
    // Firebase repository disabled in favor of webapp authentication with local storage
    return sqliteRepository;
}

const userRepositoryAdapter = {
    findOrCreate: user => {
        // This function receives the full user object, which includes the uid. No need to inject.
        return getBaseRepository().findOrCreate(user);
    },

    getById: () => {
        const uid = getAuthService().getCurrentUserId();
        if (!uid) {
            console.warn('[UserRepository] Cannot get user: not authenticated');
            return null;
        }
        return getBaseRepository().getById(uid);
    },

    update: updateData => {
        const uid = getAuthService().getCurrentUserId();
        if (!uid) {
            console.warn('[UserRepository] Cannot update user: not authenticated');
            return null;
        }
        return getBaseRepository().update({ uid, ...updateData });
    },

    deleteById: () => {
        const uid = getAuthService().getCurrentUserId();
        return getBaseRepository().deleteById(uid);
    },
};

module.exports = {
    ...userRepositoryAdapter,
};
