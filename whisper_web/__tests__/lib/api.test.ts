import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { apiCall, deleteSession, getConversationStats, getMeetingsPage, getUserProfile } from '@/lib/api';
import { type DevAiMessage, setSessionDetailsMock, setSessionsMock } from '@/lib/devMock';
import { API_URL, makeMeeting, makeUser, server } from '../support/desktop';

describe('api in dev mock mode', () => {
    beforeEach(() => {
        localStorage.setItem('dev_mock', '1');
        // Seeded below instead of by `ensureMockData`, whose sessions have random durations.
        localStorage.setItem('dev_mock_init', '1');
    });

    it('pages the stored meetings ten at a time', async () => {
        setSessionsMock(Array.from({ length: 15 }, (_, i) => makeMeeting({ id: `sess-${i}`, title: `Meeting ${i}`, hoursAgo: i + 1 })));

        const page = await getMeetingsPage(0, 10);

        expect(page.items).toHaveLength(10);
        expect(page.nextOffset).toBe(10);
        expect(page.total).toBe(15);
    });

    it('adds up meeting time and the questions asked in the stored sessions', async () => {
        const meeting = makeMeeting({ id: 'sess-1', title: 'Meeting', minutes: 30 });
        setSessionsMock([meeting]);
        const message: Omit<DevAiMessage, 'id' | 'role'> = { session_id: 'sess-1', sent_at: 0, content: 'Hi', created_at: 0, sync_state: 'clean' };
        setSessionDetailsMock('sess-1', {
            session: meeting,
            transcripts: [],
            ai_messages: [
                { ...message, id: 'm-1', role: 'user' },
                { ...message, id: 'm-2', role: 'assistant' },
                { ...message, id: 'm-3', role: 'user' },
            ],
            summary: null,
        });

        expect(await getConversationStats()).toEqual({ totalMeetingSeconds: 1800, totalQuestions: 2 });
    });

    it('removes a deleted session from the stored sessions', async () => {
        setSessionsMock([makeMeeting({ id: 'sess-1', title: 'Kept' }), makeMeeting({ id: 'sess-2', title: 'Deleted' })]);

        await deleteSession('sess-2');

        expect((await getMeetingsPage(0, 10)).items.map(s => s.id)).toEqual(['sess-1']);
    });

    it('refuses to call the network', async () => {
        await expect(apiCall('/api/user/profile')).rejects.toThrow('apiCall not available in dev mock mode');
    });
});

describe('api against the desktop', () => {
    it("sends the stored user's id, which the desktop's backend reads as the user", async () => {
        localStorage.setItem('whisper_user', JSON.stringify(makeUser({ uid: 'user-42' })));
        let sentUserId: string | null = null;
        server.use(
            http.get(`${API_URL}/api/user/profile`, ({ request }) => {
                sentUserId = request.headers.get('X-User-ID');
                return HttpResponse.json(makeUser({ uid: 'user-42' }));
            })
        );

        await getUserProfile();

        expect(sentUserId).toBe('user-42');
    });
});
