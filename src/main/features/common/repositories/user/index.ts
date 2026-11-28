import * as sqliteRepository from './sqlite.repository';
import type { NewUser } from './sqlite.repository';
import authService from '../../services/authService';
import { logger } from '../../utils/logger';

export type { NewUser, UserRow } from './sqlite.repository';

const log = logger.child({ module: 'UserRepository' });

function getBaseRepository() {
    // Always use SQLite for local-first data strategy
    // Firebase repository disabled in favor of webapp authentication with local storage
    return sqliteRepository;
}

const userRepositoryAdapter = {
    findOrCreate: (user: NewUser | null | undefined) => {
        // This function receives the full user object, which includes the uid. No need to inject.
        return getBaseRepository().findOrCreate(user);
    },

    getById: () => {
        const uid = authService.getCurrentUserId();
        if (!uid) {
            log.warn('Cannot get user: not authenticated');
            return null;
        }

        // Get base data from SQLite
        const sqliteData = getBaseRepository().getById(uid);

        // Get cloud data from AuthService (plan, apiQuota)
        const currentUser = authService.getCurrentUser().currentUser;

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

    update: (updateData: { displayName: string }) => {
        const uid = authService.getCurrentUserId();
        if (!uid) {
            log.warn('Cannot update user: not authenticated');
            return null;
        }
        return getBaseRepository().update({ uid, ...updateData });
    },

    deleteById: () => {
        const uid = authService.getCurrentUserId();
        return getBaseRepository().deleteById(uid);
    },
};

export default {
    ...userRepositoryAdapter,
};
