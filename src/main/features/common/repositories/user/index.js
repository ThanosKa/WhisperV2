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

        // Get base data from SQLite
        const sqliteData = getBaseRepository().getById(uid);

        // Get cloud data from AuthService (plan, apiQuota)
        const authService = getAuthService();
        const userState = authService.getCurrentUser();
        const currentUser = userState?.currentUser;

        if (currentUser && currentUser.plan) {
            // Merge cloud data into SQLite data
            // If SQLite data exists, merge plan/apiQuota into it
            // If SQLite data is null but we have cloud data, return cloud data with SQLite field names
            if (sqliteData) {
                return {
                    ...sqliteData,
                    plan: currentUser.plan,
                    apiQuota: currentUser.apiQuota || null,
                };
            } else {
                // No SQLite data yet, but we have cloud data - return cloud data with proper field mapping
                return {
                    uid: currentUser.uid,
                    display_name: currentUser.displayName || '',
                    email: currentUser.email || '',
                    plan: currentUser.plan,
                    apiQuota: currentUser.apiQuota || null,
                };
            }
        }

        return sqliteData;
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
