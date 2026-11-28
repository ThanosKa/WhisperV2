import * as sqliteRepository from './sqlite.repository';
import * as insightsRepository from './insights.repository';
import type { NewSummary } from './sqlite.repository';
import authService from '../../../common/services/authService';

export type { SummaryRow } from './sqlite.repository';
export type { Insight, InsightPayload } from './insights.repository';

function getBaseRepository() {
    // Always use SQLite for local-first data strategy
    // Firebase repository disabled in favor of webapp authentication with local storage
    return sqliteRepository;
}

const summaryRepositoryAdapter = {
    saveSummary: ({ sessionId, tldr, text, bullet_json, action_json, model }: Omit<NewSummary, 'uid'>) => {
        const uid = authService.getCurrentUserId();
        return getBaseRepository().saveSummary({ uid, sessionId, tldr, text, bullet_json, action_json, model });
    },
    getSummaryBySessionId: (sessionId: string) => {
        return getBaseRepository().getSummaryBySessionId(sessionId);
    },
    // Insights methods
    saveInsight: insightsRepository.saveInsight,
    getAllInsightsBySessionId: insightsRepository.getAllInsightsBySessionId,
};

export default summaryRepositoryAdapter;
