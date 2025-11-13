const sqliteRepository = require('./sqlite.repository');
const insightsRepository = require('./insights.repository');
const authService = require('../../../common/services/authService');

function getBaseRepository() {
    // Always use SQLite for local-first data strategy
    // Firebase repository disabled in favor of webapp authentication with local storage
    return sqliteRepository;
}

const summaryRepositoryAdapter = {
    saveSummary: ({ sessionId, tldr, text, bullet_json, action_json, model }) => {
        const uid = authService.getCurrentUserId();
        return getBaseRepository().saveSummary({ uid, sessionId, tldr, text, bullet_json, action_json, model });
    },
    getSummaryBySessionId: sessionId => {
        return getBaseRepository().getSummaryBySessionId(sessionId);
    },
    // Insights methods
    saveInsight: insightsRepository.saveInsight,
    getAllInsightsBySessionId: insightsRepository.getAllInsightsBySessionId,
};

module.exports = summaryRepositoryAdapter;

