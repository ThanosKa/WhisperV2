import * as sqliteRepository from './sqlite.repository';
import type { PresetChanges } from './sqlite.repository';
import authService from '../../services/authService';

export type { PresetChanges, PresetRow, ResolvedPreset } from './sqlite.repository';

function getBaseRepository() {
    // Always use SQLite for local-first data strategy
    // Firebase repository disabled in favor of webapp authentication with local storage
    return sqliteRepository;
}

const presetRepositoryAdapter = {
    getPresets: () => {
        const uid = authService.getCurrentUserId();
        return getBaseRepository().getPresets(uid);
    },

    getById: (id: string) => {
        const uid = authService.getCurrentUserId();
        return getBaseRepository().getById({ id, uid });
    },

    findUserPresetByTitle: (title: string) => {
        const uid = authService.getCurrentUserId();
        return getBaseRepository().findUserPresetByTitle({ title, uid });
    },

    update: ({ id, changes }: { id: string; changes: PresetChanges }) => {
        const uid = authService.getCurrentUserId();
        return getBaseRepository().update({ id, changes, uid });
    },
};

export default presetRepositoryAdapter;
