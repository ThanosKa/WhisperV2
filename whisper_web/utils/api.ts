// Removed Firebase imports - using webapp authentication now
// Firebase functionality disabled in favor of local-first approach
import {
    isDevMockEnabled,
    ensureMockData,
    getMockUser,
    getPresetsMock,
    setPresetsMock,
    getSessionsMock,
    setSessionsMock,
    getSessionDetailsMock,
    setSessionDetailsMock,
} from './devMock';

export interface UserProfile {
    uid: string;
    display_name: string;
    email: string;
    plan?: string;
}

export interface Session {
    id: string;
    uid: string;
    title: string;
    session_type: string;
    started_at: number;
    ended_at?: number;
    sync_state: 'clean' | 'dirty';
    updated_at: number;
}

export interface Transcript {
    id: string;
    session_id: string;
    start_at: number;
    end_at?: number;
    speaker?: string;
    text: string;
    lang?: string;
    created_at: number;
    sync_state: 'clean' | 'dirty';
}

export interface AiMessage {
    id: string;
    session_id: string;
    sent_at: number;
    role: 'user' | 'assistant';
    content: string;
    tokens?: number;
    model?: string;
    created_at: number;
    sync_state: 'clean' | 'dirty';
}

export interface Summary {
    session_id: string;
    generated_at: number;
    model?: string;
    text: string;
    tldr: string;
    bullet_json: string;
    action_json: string;
    tokens_used?: number;
    updated_at: number;
    sync_state: 'clean' | 'dirty';
}

export interface PromptPreset {
    id: string;
    uid: string;
    title: string;
    prompt: string;
    is_default: 0 | 1;
    created_at: number;
    sync_state: 'clean' | 'dirty';
    append_text?: string;
}

export interface SessionDetails {
    session: Session;
    transcripts: Transcript[];
    ai_messages: AiMessage[];
    summary: Summary | null;
    insights?: Array<{ analysis_round: number; payload: { summary?: string[]; actions?: string[] } }> | null;
}

const isFirebaseMode = (): boolean => {
    // Firebase mode disabled - using local-first approach with webapp authentication
    return false;
};

// Firebase conversion functions removed - not needed for local-first approach

let API_ORIGIN = process.env.NODE_ENV === 'development' ? 'http://localhost:9001' : '';

const loadRuntimeConfig = async (): Promise<string | null> => {
    // In dev mock mode, do not attempt to load electron runtime config
    if (isDevMockEnabled()) return null;
    try {
        const response = await fetch('/runtime-config.json');
        if (response.ok) {
            const config = await response.json();
            console.log('✅ Runtime config loaded:', config);
            return config.API_URL;
        }
    } catch (error) {
        console.log('⚠️ Failed to load runtime config:', error);
    }
    return null;
};

let apiUrlInitialized = false;
let initializationPromise: Promise<void> | null = null;

const initializeApiUrl = async () => {
    if (apiUrlInitialized) return;

    // Electron IPC 관련 코드를 모두 제거하고 runtime-config.json 또는 fallback에만 의존합니다.
    const runtimeUrl = await loadRuntimeConfig();
    if (runtimeUrl) {
        API_ORIGIN = runtimeUrl;
        apiUrlInitialized = true;
        return;
    }

    console.log('📍 Using fallback API URL:', API_ORIGIN);
    apiUrlInitialized = true;
};

if (typeof window !== 'undefined') {
    initializationPromise = initializeApiUrl();
}

// Dev init helper
let devInitialized = false;
const initDevIfNeeded = () => {
    if (typeof window === 'undefined') return;
    if (!isDevMockEnabled()) return;
    if (!devInitialized) {
        ensureMockData();
        devInitialized = true;
    }
};

// Testing utility to reset module state between Jest suites
export const __resetApiTestState = () => {
    apiUrlInitialized = false;
    initializationPromise = null;
    API_ORIGIN = process.env.NODE_ENV === 'development' ? 'http://localhost:9001' : '';
    devInitialized = false;
};

const userInfoListeners: Array<(userInfo: UserProfile | null) => void> = [];

export const getUserInfo = (): UserProfile | null => {
    if (typeof window === 'undefined') return null;

    const storedUserInfo = localStorage.getItem('whisper_user');
    if (storedUserInfo) {
        try {
            return JSON.parse(storedUserInfo);
        } catch (error) {
            console.error('Failed to parse user info:', error);
            localStorage.removeItem('whisper_user');
        }
    }
    return null;
};

export const setUserInfo = (userInfo: UserProfile | null, skipEvents: boolean = false) => {
    if (typeof window === 'undefined') return;

    if (userInfo) {
        localStorage.setItem('whisper_user', JSON.stringify(userInfo));
    } else {
        localStorage.removeItem('whisper_user');
    }

    if (!skipEvents) {
        userInfoListeners.forEach(listener => listener(userInfo));

        window.dispatchEvent(new Event('userInfoChanged'));
    }
};

export const onUserInfoChange = (listener: (userInfo: UserProfile | null) => void) => {
    userInfoListeners.push(listener);

    return () => {
        const index = userInfoListeners.indexOf(listener);
        if (index > -1) {
            userInfoListeners.splice(index, 1);
        }
    };
};

export const getApiHeaders = (): HeadersInit => {
    const headers: HeadersInit = {
        'Content-Type': 'application/json',
    };

    const userInfo = getUserInfo();
    if (userInfo?.uid) {
        headers['X-User-ID'] = userInfo.uid;
    }

    return headers;
};

export const apiCall = async (path: string, options: RequestInit = {}) => {
    // In dev-mock, do not call network at all
    if (isDevMockEnabled()) {
        throw new Error('apiCall not available in dev mock mode');
    }

    if (!apiUrlInitialized && initializationPromise) {
        await initializationPromise;
    }

    if (!apiUrlInitialized) {
        await initializeApiUrl();
    }

    const url = `${API_ORIGIN}${path}`;
    console.log('🌐 apiCall (Local Mode):', {
        path,
        API_ORIGIN,
        fullUrl: url,
        initialized: apiUrlInitialized,
        timestamp: new Date().toISOString(),
    });

    const defaultOpts: RequestInit = {
        headers: {
            'Content-Type': 'application/json',
            ...getApiHeaders(),
            ...(options.headers || {}),
        },
        ...options,
    };
    return fetch(url, defaultOpts);
};

export const searchConversations = async (query: string): Promise<Session[]> => {
    if (!query.trim()) {
        return [];
    }

    if (isDevMockEnabled()) {
        initDevIfNeeded();
        const sessions = getSessionsMock();
        return sessions.filter(s => (s.title || '').toLowerCase().includes(query.toLowerCase()));
    } else if (isFirebaseMode()) {
        const sessions = await getSessions();
        return sessions.filter(session => session.title.toLowerCase().includes(query.toLowerCase()));
    } else {
        const response = await apiCall(`/api/conversations/search?q=${encodeURIComponent(query)}`, {
            method: 'GET',
        });
        if (!response.ok) {
            throw new Error('Failed to search conversations');
        }
        return response.json();
    }
};

export const searchConversationsPage = async (params: {
    query: string;
    scope?: 'title' | 'summary' | 'all';
    offset?: number;
    limit?: number;
}): Promise<PagedResult<Session>> => {
    const { query, scope = 'title', offset = 0, limit = 10 } = params;

    if (isDevMockEnabled()) {
        initDevIfNeeded();
        const all = getSessionsMock() as unknown as Session[];
        // Default ordering already roughly newest-first in mock initializer
        if (scope === 'all') {
            const items = all.slice(offset, offset + limit);
            const nextOffset = offset + items.length < all.length ? offset + items.length : null;
            return { items, nextOffset, total: all.length };
        }
        if (scope === 'summary') {
            const listen = all.filter(s => s.session_type === 'listen');
            const trimmed = (query || '').trim().toLowerCase();
            if (!trimmed) {
                const items = listen.slice(offset, offset + limit);
                const nextOffset = offset + items.length < listen.length ? offset + items.length : null;
                return { items, nextOffset, total: listen.length };
            }
            const filtered = listen.filter(s => {
                const d = getSessionDetailsMock(s.id) as unknown as SessionDetails | null;
                if (!d || !d.summary) return false;
                const tldr = (d.summary.tldr || '').toLowerCase();
                const text = (d.summary.text || '').toLowerCase();
                return tldr.includes(trimmed) || text.includes(trimmed);
            });
            const items = filtered.slice(offset, offset + limit);
            const nextOffset = offset + items.length < filtered.length ? offset + items.length : null;
            return { items, nextOffset, total: filtered.length };
        }
        const trimmed = (query || '').trim().toLowerCase();
        if (!trimmed) {
            return { items: [], nextOffset: null, total: 0 };
        }
        const filtered = all.filter(s => (s.title || '').toLowerCase().includes(trimmed));
        const items = filtered.slice(offset, offset + limit);
        const nextOffset = offset + items.length < filtered.length ? offset + items.length : null;
        return { items, nextOffset, total: filtered.length };
    }

    if (isFirebaseMode()) {
        // Firebase mode disabled; fall back to local getSessions and filter
        const sessions = await getSessions();
        const trimmed = (query || '').trim().toLowerCase();
        if (scope === 'summary') {
            const listen = sessions.filter(s => s.session_type === 'listen');
            if (!trimmed) {
                const items = listen.slice(offset, offset + limit);
                const nextOffset = offset + items.length < listen.length ? offset + items.length : null;
                return { items, nextOffset, total: listen.length };
            }
            // Without a summary index in Firebase mode, return empty
            return { items: [], nextOffset: null, total: 0 };
        }
        if (!trimmed) {
            return { items: [], nextOffset: null, total: 0 };
        }
        const filtered = sessions.filter(s => (s.title || '').toLowerCase().includes(trimmed));
        const items = filtered.slice(offset, offset + limit);
        const nextOffset = offset + items.length < filtered.length ? offset + items.length : null;
        return { items, nextOffset, total: filtered.length };
    }

    const qs = new URLSearchParams({
        q: query || '',
        scope: (params.scope || 'title') as string,
        offset: String(offset),
        limit: String(limit),
    });
    const response = await apiCall(`/api/conversations/search/page?${qs.toString()}`, { method: 'GET' });
    if (!response.ok) {
        throw new Error('Failed to search conversations (page)');
    }
    return response.json();
};

export const getSessions = async (): Promise<Session[]> => {
    if (isDevMockEnabled()) {
        initDevIfNeeded();
        return getSessionsMock();
    }
    const response = await apiCall(`/api/conversations`, { method: 'GET' });
    if (!response.ok) throw new Error('Failed to fetch sessions');
    return response.json();
};

export const getMeetings = async (): Promise<Session[]> => {
    if (isDevMockEnabled()) {
        initDevIfNeeded();
        return getSessionsMock().filter(s => s.session_type === 'listen');
    }
    const response = await apiCall(`/api/conversations/meetings`, { method: 'GET' });
    if (!response.ok) throw new Error('Failed to fetch meetings');
    const data = await response.json();
    // Backward compatibility with pre-pagination responses
    return Array.isArray(data) ? data : data.items;
};

export const getQuestions = async (): Promise<Session[]> => {
    if (isDevMockEnabled()) {
        initDevIfNeeded();
        return getSessionsMock().filter(s => s.session_type === 'ask');
    }
    const response = await apiCall(`/api/conversations/questions`, { method: 'GET' });
    if (!response.ok) throw new Error('Failed to fetch questions');
    const data = await response.json();
    return Array.isArray(data) ? data : data.items;
};

export interface PagedResult<T> {
    items: T[];
    nextOffset: number | null;
    total: number;
}

export const getMeetingsPage = async (offset = 0, limit = 10): Promise<PagedResult<Session>> => {
    if (isDevMockEnabled()) {
        initDevIfNeeded();
        const all = getSessionsMock().filter(s => s.session_type === 'listen');
        const items = all.slice(offset, offset + limit);
        const nextOffset = offset + items.length < all.length ? offset + items.length : null;
        return { items, nextOffset, total: all.length };
    }
    const response = await apiCall(`/api/conversations/meetings?offset=${offset}&limit=${limit}`, { method: 'GET' });
    if (!response.ok) throw new Error('Failed to fetch meetings page');
    return response.json();
};

export const getQuestionsPage = async (offset = 0, limit = 10): Promise<PagedResult<Session>> => {
    if (isDevMockEnabled()) {
        initDevIfNeeded();
        const all = getSessionsMock().filter(s => s.session_type === 'ask');
        const items = all.slice(offset, offset + limit);
        const nextOffset = offset + items.length < all.length ? offset + items.length : null;
        return { items, nextOffset, total: all.length };
    }
    const response = await apiCall(`/api/conversations/questions?offset=${offset}&limit=${limit}`, { method: 'GET' });
    if (!response.ok) throw new Error('Failed to fetch questions page');
    return response.json();
};

export interface ConversationStats {
    totalMeetingSeconds: number;
    totalQuestions: number;
}

export const getConversationStats = async (): Promise<ConversationStats> => {
    if (isDevMockEnabled()) {
        initDevIfNeeded();
        const sessions = getSessionsMock();
        const meetings = sessions.filter(s => s.session_type === 'listen');
        const nowSec = Math.floor(Date.now() / 1000);
        const totalMeetingSeconds = meetings.reduce((sum, s) => {
            const end = s.ended_at || nowSec;
            const dur = Math.max(0, end - s.started_at);
            return sum + dur;
        }, 0);
        let totalQuestions = 0;
        sessions.forEach(s => {
            const details = getSessionDetailsMock(s.id);
            if (details && Array.isArray(details.ai_messages)) {
                totalQuestions += details.ai_messages.filter(m => m.role === 'user').length;
            }
        });
        return { totalMeetingSeconds, totalQuestions };
    }
    const response = await apiCall(`/api/conversations/stats`, { method: 'GET' });
    if (!response.ok) throw new Error('Failed to fetch conversation stats');
    return response.json();
};

export const getSessionDetails = async (sessionId: string): Promise<SessionDetails> => {
    if (isDevMockEnabled()) {
        initDevIfNeeded();
        const details = getSessionDetailsMock(sessionId);
        if (!details) throw new Error('Session not found');
        // Type cast from dev interfaces to app interfaces (same shape)
        return details as unknown as SessionDetails;
    }
    const response = await apiCall(`/api/conversations/${sessionId}`, { method: 'GET' });
    if (!response.ok) throw new Error('Failed to fetch session details');
    return response.json();
};

export const updateSessionTitle = async (sessionId: string, title: string): Promise<void> => {
    if (isDevMockEnabled()) {
        initDevIfNeeded();
        const list = getSessionsMock();
        const idx = list.findIndex(s => s.id === sessionId);
        if (idx >= 0) {
            list[idx] = { ...list[idx], title, updated_at: Math.floor(Date.now() / 1000) };
            setSessionsMock(list);
        }
        const details = getSessionDetailsMock(sessionId);
        if (details) {
            details.session.title = title;
            setSessionDetailsMock(sessionId, details as any);
        }
        // announce update for listeners
        if (typeof window !== 'undefined') window.dispatchEvent(new Event('sessionUpdated'));
        return;
    }
    const response = await apiCall(`/api/conversations/${sessionId}`, {
        method: 'PUT',
        body: JSON.stringify({ title }),
    });
    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Failed to update title: ${response.status} ${text}`);
    }
};

export const createSession = async (title?: string): Promise<{ id: string }> => {
    if (isDevMockEnabled()) {
        initDevIfNeeded();
        const id = `sess-${Math.random().toString(36).slice(2, 8)}`;
        const now = Math.floor(Date.now() / 1000);
        const s: Session = {
            id,
            uid: 'dev_user',
            title: title || `Session @ ${new Date().toLocaleTimeString()}`,
            session_type: 'ask',
            started_at: now,
            sync_state: 'clean',
            updated_at: now,
        };
        const list = getSessionsMock() as unknown as Session[];
        (list as any).unshift(s as any);
        setSessionsMock(list as any);
        const details: SessionDetails = { session: s, transcripts: [], ai_messages: [], summary: null };
        setSessionDetailsMock(id, details as any);
        if (typeof window !== 'undefined') window.dispatchEvent(new Event('sessionUpdated'));
        return { id };
    }
    const response = await apiCall(`/api/conversations`, {
        method: 'POST',
        body: JSON.stringify({ title }),
    });
    if (!response.ok) throw new Error('Failed to create session');
    return response.json();
};

export const deleteSession = async (sessionId: string): Promise<void> => {
    if (isDevMockEnabled()) {
        initDevIfNeeded();
        const list = getSessionsMock().filter(s => s.id !== sessionId);
        setSessionsMock(list);
        try {
            if (typeof window !== 'undefined') localStorage.removeItem('dev_mock_session_details_' + sessionId);
        } catch {}
        if (typeof window !== 'undefined') window.dispatchEvent(new Event('sessionUpdated'));
        return;
    }
    const response = await apiCall(`/api/conversations/${sessionId}`, { method: 'DELETE' });
    if (!response.ok) throw new Error('Failed to delete session');
};

export const getUserProfile = async (): Promise<UserProfile> => {
    if (isDevMockEnabled()) {
        initDevIfNeeded();
        return getMockUser() as UserProfile;
    }
    const response = await apiCall(`/api/user/profile`, { method: 'GET' });
    if (!response.ok) throw new Error('Failed to fetch user profile');
    return response.json();
};

export const updateUserProfile = async (data: { displayName: string }): Promise<void> => {
    if (isDevMockEnabled()) {
        // no-op in dev
        return;
    }
    const response = await apiCall(`/api/user/profile`, {
        method: 'PUT',
        body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Failed to update user profile');
};

export const findOrCreateUser = async (user: UserProfile): Promise<UserProfile> => {
    if (isDevMockEnabled()) {
        return user;
    }
    const response = await apiCall(`/api/user/find-or-create`, {
        method: 'POST',
        body: JSON.stringify(user),
    });
    if (!response.ok) throw new Error('Failed to find or create user');
    return response.json();
};

export const deleteAccount = async (): Promise<void> => {
    const response = await apiCall(`/api/user/profile`, { method: 'DELETE' });
    if (!response.ok) throw new Error('Failed to delete account');
};

export const getPresets = async (): Promise<PromptPreset[]> => {
    if (isDevMockEnabled()) {
        initDevIfNeeded();
        return getPresetsMock() as unknown as PromptPreset[];
    }
    const response = await apiCall(`/api/presets`, { method: 'GET' });
    if (!response.ok) throw new Error('Failed to fetch presets');
    return response.json();
};

export const updatePreset = async (id: string, data: { title?: string; prompt?: string; append_text?: string }): Promise<void> => {
    if (isDevMockEnabled()) {
        initDevIfNeeded();
        const presets = getPresetsMock();
        const idx = presets.findIndex(p => p.id === id);
        if (idx >= 0) {
            const updated = { ...(presets as any)[idx] };
            if (data.title !== undefined) updated.title = data.title;
            if (data.prompt !== undefined) updated.prompt = data.prompt;
            if (data.append_text !== undefined) updated.append_text = data.append_text;
            (presets as any)[idx] = updated;
            setPresetsMock(presets as any);
        }
        if (typeof window !== 'undefined') window.dispatchEvent(new Event('presetUpdated'));
        return;
    }
    const body = { ...data }; // Only send provided fields
    const response = await apiCall(`/api/presets/${id}`, {
        method: 'PUT',
        body: JSON.stringify(body),
    });
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to update preset: ${response.status} ${errorText}`);
    }
};

export interface BatchData {
    profile?: UserProfile;
    presets?: PromptPreset[];
    sessions?: Session[];
}

export const getBatchData = async (includes: ('profile' | 'presets' | 'sessions')[]): Promise<BatchData> => {
    if (isDevMockEnabled()) {
        initDevIfNeeded();
        const out: BatchData = {};
        if (includes.includes('profile')) out.profile = getMockUser() as any;
        if (includes.includes('presets')) out.presets = getPresetsMock() as any as PromptPreset[];
        if (includes.includes('sessions')) out.sessions = getSessionsMock() as any as Session[];
        return out;
    }
    const response = await apiCall(`/api/user/batch?include=${includes.join(',')}`, { method: 'GET' });
    if (!response.ok) throw new Error('Failed to fetch batch data');
    return response.json();
};

export const logout = async () => {
    // Clear local storage
    setUserInfo(null);
    localStorage.removeItem('openai_api_key');
    localStorage.removeItem('user_info');

    // Redirect to login
    window.location.href = '/login';
};
