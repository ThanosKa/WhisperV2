import { delay, http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { Session } from '@/backend_node/types/session';

// A fake of what the dashboard talks to: the page server's `/runtime-config.json` and the
// desktop app's Express bridge (`backend_node`). Each route answers the way `backend_node` does,
// from an in-memory desktop that a test sets up with `desktop.*` before it renders a page.

/** The origin Vitest's jsdom gives the page: the Next server in production, port 3000. */
export const WEB_URL = 'http://localhost:3000';
/** The `API_URL` the desktop app writes into `runtime-config.json`. */
export const API_URL = 'http://localhost:9001';

/** The row `GET /api/user/profile` returns: the SQLite user, plus the plan the desktop got from WhisperAPP. */
export type DesktopUser = {
    uid: string;
    display_name: string;
    email: string;
    created_at: number;
    auto_update_enabled: number;
    plan?: string;
};

type DesktopState = {
    /** `electron`: the page is served by the desktop app, so `/runtime-config.json` exists. */
    mode: 'electron' | 'web';
    /** `null`: the desktop has no signed-in user, and `/api/user/profile` answers 404. */
    user: DesktopUser | null;
    sessions: Session[];
    /** What `/api/conversations/stats` counts from the sessions' user messages. */
    userQuestionCount: number;
};

const NOW = Math.floor(Date.now() / 1000);

export const makeUser = (fields: Partial<DesktopUser> = {}): DesktopUser => ({
    uid: 'user-1',
    display_name: 'Test User',
    email: 'test@example.com',
    created_at: NOW - 86_400,
    auto_update_enabled: 1,
    ...fields,
});

export const makeMeeting = ({ id, title, minutes = 30, hoursAgo = 1 }: { id: string; title: string; minutes?: number; hoursAgo?: number }): Session => {
    const startedAt = NOW - hoursAgo * 3600;
    return {
        id,
        uid: 'user-1',
        title,
        session_type: 'listen',
        started_at: startedAt,
        ended_at: startedAt + minutes * 60,
        sync_state: 'clean',
        updated_at: startedAt + minutes * 60,
    };
};

export const makeQuestion = ({ id, title, hoursAgo = 1 }: { id: string; title: string; hoursAgo?: number }): Session => ({
    id,
    uid: 'user-1',
    title,
    session_type: 'ask',
    started_at: NOW - hoursAgo * 3600,
    sync_state: 'clean',
    updated_at: NOW - hoursAgo * 3600,
});

const initialState = (): DesktopState => ({
    mode: 'electron',
    user: makeUser(),
    sessions: [],
    userQuestionCount: 0,
});

/** The fake desktop's data. Tests change it before rendering; it is reset after each test. */
export const desktop: DesktopState = initialState();

export const resetDesktop = () => {
    Object.assign(desktop, initialState());
};

/** `backend_node`'s paging: `limit` 1-50 (default 10), `offset` from 0, `nextOffset` null on the last page. */
const page = ({ sessions, url }: { sessions: Session[]; url: URL }) => {
    const limit = Math.max(1, Math.min(parseInt(url.searchParams.get('limit') || '10', 10), 50));
    const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10));
    const items = sessions.slice(offset, offset + limit);
    return {
        items,
        nextOffset: offset + items.length < sessions.length ? offset + items.length : null,
        total: sessions.length,
    };
};

const ofType = (type: 'listen' | 'ask') => desktop.sessions.filter(s => s.session_type === type);

const api = (path: string) => `${API_URL}${path}`;

const isTitleBody = (body: unknown): body is { title: string } =>
    typeof body === 'object' && body !== null && 'title' in body && typeof body.title === 'string';

export const handlers = [
    http.get(`${WEB_URL}/runtime-config.json`, () => {
        if (desktop.mode === 'web') {
            return new HttpResponse('Not Found', { status: 404 });
        }
        return HttpResponse.json({ API_URL, WEB_URL, timestamp: NOW * 1000 });
    }),

    http.get(api('/api/user/profile'), () => {
        if (!desktop.user) {
            return HttpResponse.json(
                { error: 'User not found', details: 'User profile not found in local database. Authentication may be required.' },
                { status: 404 }
            );
        }
        return HttpResponse.json(desktop.user);
    }),

    http.get(api('/api/conversations/meetings'), ({ request }) => HttpResponse.json(page({ sessions: ofType('listen'), url: new URL(request.url) }))),

    http.get(api('/api/conversations/questions'), ({ request }) => HttpResponse.json(page({ sessions: ofType('ask'), url: new URL(request.url) }))),

    http.get(api('/api/conversations/stats'), () => {
        const totalMeetingSeconds = ofType('listen').reduce((sum, s) => sum + Math.max(0, (s.ended_at || NOW) - s.started_at), 0);
        return HttpResponse.json({ totalMeetingSeconds, totalQuestions: desktop.userQuestionCount });
    }),

    http.put(api('/api/conversations/:sessionId'), async ({ params, request }) => {
        const body: unknown = await request.json();
        if (!isTitleBody(body) || !body.title) {
            return HttpResponse.json({ error: 'title is required' }, { status: 400 });
        }
        const session = desktop.sessions.find(s => s.id === params.sessionId);
        if (session) {
            session.title = body.title;
        }
        return HttpResponse.json({ changes: session ? 1 : 0 });
    }),

    http.delete(api('/api/conversations/:sessionId'), ({ params }) => {
        desktop.sessions = desktop.sessions.filter(s => s.id !== params.sessionId);
        return HttpResponse.json({ message: 'Session deleted successfully' });
    }),
];

export const server = setupServer(...handlers);

/** Holds every answer from `path` on the desktop API until the test ends, so the page stays loading. */
export const holdApi = (path: string) => http.get(api(path), () => delay('infinite'));

/** Every request the page sent during the test, as `METHOD URL`. */
export const sentRequests: string[] = [];
server.events.on('request:start', ({ request }) => {
    sentRequests.push(`${request.method} ${request.url}`);
});
