const sqliteRepository = require('./sqlite.repository');
const authService = require('../../common/services/authService');

function getBaseRepository() {
    // Always use SQLite for local-first data strategy
    // Firebase repository disabled in favor of webapp authentication with local storage
    return sqliteRepository;
}

const settingsRepositoryAdapter = {
    getPresets: () => {
        const uid = authService.getCurrentUserId();
        return getBaseRepository().getPresets(uid);
    },

    getPresetTemplates: () => {
        return getBaseRepository().getPresetTemplates();
    },

    updatePreset: (id, options) => {
        const uid = authService.getCurrentUserId();
        return getBaseRepository().updatePreset(id, options, uid);
    },

    getAutoUpdate: () => {
        const uid = authService.getCurrentUserId();
        return getBaseRepository().getAutoUpdate(uid);
    },

    setAutoUpdate: isEnabled => {
        const uid = authService.getCurrentUserId();
        return getBaseRepository().setAutoUpdate(uid, isEnabled);
    },
};

module.exports = settingsRepositoryAdapter;
