const sqliteRepository = require('./sqlite.repository');
const authService = require('../../services/authService');

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

    getById: id => {
        const uid = authService.getCurrentUserId();
        return getBaseRepository().getById(id, uid);
    },

    findUserPresetByTitle: title => {
        const uid = authService.getCurrentUserId();
        return getBaseRepository().findUserPresetByTitle(title, uid);
    },

    getPresetTemplates: () => {
        return getBaseRepository().getPresetTemplates();
    },

    update: (id, options) => {
        const uid = authService.getCurrentUserId();
        return getBaseRepository().update(id, options, uid);
    },
};

module.exports = presetRepositoryAdapter;
