import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SessionDetailsPage from '@/app/activity/details/page';
import type { AiMessage, SessionDetails, Transcript } from '@/lib/api';
import { desktop, makeMeeting, makeQuestion, makeUser, sentRequests } from './support/desktop';

const router = vi.hoisted(() => ({ push: vi.fn() }));
const query = vi.hoisted(() => ({ current: new URLSearchParams() }));
vi.mock('next/navigation', () => ({
    useRouter: () => router,
    useSearchParams: () => query.current,
}));

const NOW = Math.floor(Date.now() / 1000);

const makeAiMessage = ({ id, role, content }: { id: string; role: AiMessage['role']; content: string }): AiMessage => ({
    id,
    session_id: 'session-1',
    sent_at: NOW,
    role,
    content,
    created_at: NOW,
    sync_state: 'clean',
});

const makeTranscript = ({ id, speaker, text }: { id: string; speaker: string; text: string }): Transcript => ({
    id,
    session_id: 'session-1',
    start_at: NOW,
    speaker,
    text,
    created_at: NOW,
    sync_state: 'clean',
});

const finishedMeeting = (): SessionDetails => ({
    session: makeMeeting({ id: 'session-1', title: 'Team Sync' }),
    transcripts: [makeTranscript({ id: 't1', speaker: 'Alice', text: 'Shall we start?' })],
    ai_messages: [
        makeAiMessage({ id: 'm1', role: 'user', content: 'What did we decide?' }),
        makeAiMessage({ id: 'm2', role: 'assistant', content: 'You decided to ship on Friday.' }),
    ],
    summary: {
        session_id: 'session-1',
        generated_at: NOW,
        text: 'Full summary',
        tldr: 'The team agreed on the launch plan.',
        bullet_json: JSON.stringify(['Launch on Friday']),
        action_json: JSON.stringify(['Write the announcement']),
        updated_at: NOW,
        sync_state: 'clean',
    },
});

const open = (details: SessionDetails) => {
    desktop.details[details.session.id] = details;
    query.current = new URLSearchParams({ sessionId: details.session.id });
    return render(<SessionDetailsPage />);
};

describe('SessionDetailsPage', () => {
    beforeEach(() => {
        router.push.mockClear();
        desktop.user = makeUser();
    });

    it('shows a loading state, then the session title and its kind', async () => {
        open(finishedMeeting());

        expect(screen.getByText('Loading...')).toBeInTheDocument();
        expect(await screen.findByRole('heading', { level: 1, name: 'Team Sync' })).toBeInTheDocument();
        expect(screen.getByText('Meeting')).toBeInTheDocument();
    });

    it('shows the summary, key points and action items of a finished meeting', async () => {
        open(finishedMeeting());

        expect(await screen.findByText('The team agreed on the launch plan.')).toBeInTheDocument();
        expect(screen.getByText('Key points')).toBeInTheDocument();
        expect(screen.getByText('Launch on Friday')).toBeInTheDocument();
        expect(screen.getByText('Action items')).toBeInTheDocument();
        expect(screen.getByText('Write the announcement')).toBeInTheDocument();
    });

    it('shows a placeholder while a meeting is still running and has no insights', async () => {
        const details = finishedMeeting();
        details.session = { ...details.session, ended_at: undefined };
        open(details);

        expect(await screen.findByText('Summary will appear here once the session is complete.')).toBeInTheDocument();
    });

    it('merges the insights of a running meeting, without repeats', async () => {
        const details = finishedMeeting();
        details.session = { ...details.session, ended_at: undefined };
        details.insights = [
            { analysis_round: 1, payload: { summary: ['Point A'], actions: ['Do X'] } },
            { analysis_round: 2, payload: { summary: ['Point A', 'Point B'], actions: ['Do Y'] } },
        ];
        open(details);

        expect(await screen.findByText('Point B')).toBeInTheDocument();
        expect(screen.getAllByText('Point A')).toHaveLength(1);
        expect(screen.getByText('Do X')).toBeInTheDocument();
        expect(screen.getByText('Do Y')).toBeInTheDocument();
    });

    it('pairs each question with its answer in the Q&A list', async () => {
        open(finishedMeeting());

        expect(await screen.findByText('Your Question')).toBeInTheDocument();
        expect(screen.getByText('What did we decide?')).toBeInTheDocument();
        expect(screen.getByText('AI Response')).toBeInTheDocument();
        expect(await screen.findByText('You decided to ship on Friday.')).toBeInTheDocument();
    });

    it('shows a question session without the summary or the transcript card', async () => {
        open({
            session: makeQuestion({ id: 'session-1', title: 'Quick question' }),
            transcripts: [],
            ai_messages: [makeAiMessage({ id: 'm1', role: 'user', content: 'How tall is Everest?' })],
            summary: null,
        });

        expect(await screen.findByText('How tall is Everest?')).toBeInTheDocument();
        expect(screen.getByText('Question')).toBeInTheDocument();
        expect(screen.queryByText('Summary')).not.toBeInTheDocument();
        expect(screen.queryByText('Timeline & Usage')).not.toBeInTheDocument();
    });

    it('opens the transcript sidebar from the timeline card', async () => {
        const user = userEvent.setup();
        open(finishedMeeting());

        expect(await screen.findByText('1 transcripts')).toBeInTheDocument();
        await user.click(screen.getByText('Timeline & Usage'));

        expect(await screen.findByText('Shall we start?')).toBeInTheDocument();
    });

    it('says the session was not found when the desktop does not know it', async () => {
        query.current = new URLSearchParams({ sessionId: 'missing' });

        render(<SessionDetailsPage />);

        expect(await screen.findByText('Session not found')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Return to activity' })).toHaveAttribute('href', '/activity');
    });

    it('sends the user to login when the desktop has no signed-in user', async () => {
        desktop.user = null;

        open(finishedMeeting());

        await vi.waitFor(() => expect(router.push).toHaveBeenCalledWith('/login'));
    });

    it('renames the session', async () => {
        const user = userEvent.setup();
        open(finishedMeeting());

        await user.click(await screen.findByRole('button', { name: 'Edit' }));
        const input = screen.getByPlaceholderText('Untitled session');
        await user.clear(input);
        await user.type(input, 'Launch Sync');
        await user.click(screen.getByRole('button', { name: 'Save' }));

        expect(await screen.findByRole('heading', { level: 1, name: 'Launch Sync' })).toBeInTheDocument();
        expect(sentRequests.some(request => request.startsWith('PUT ') && request.endsWith('/api/conversations/session-1'))).toBe(true);
    });

    it('cancels a rename without saving', async () => {
        const user = userEvent.setup();
        open(finishedMeeting());

        await user.click(await screen.findByRole('button', { name: 'Edit' }));
        await user.type(screen.getByPlaceholderText('Untitled session'), ' extra');
        await user.click(screen.getByRole('button', { name: 'Cancel' }));

        expect(screen.getByRole('heading', { level: 1, name: 'Team Sync' })).toBeInTheDocument();
        expect(sentRequests.some(request => request.startsWith('PUT '))).toBe(false);
    });

    it('deletes the session after confirmation and goes back to the activity list', async () => {
        const user = userEvent.setup();
        open(finishedMeeting());

        await user.click(await screen.findByRole('button', { name: 'Delete' }));
        expect(screen.getByText(/are you sure you want to delete this activity/i)).toBeInTheDocument();
        const dialogButtons = screen.getAllByRole('button', { name: 'Delete' });
        const confirm = dialogButtons[dialogButtons.length - 1];
        if (!confirm) throw new Error('No confirm button');
        await user.click(confirm);

        await waitFor(() => expect(router.push).toHaveBeenCalledWith('/activity'));
        expect(sentRequests.some(request => request.startsWith('DELETE ') && request.endsWith('/api/conversations/session-1'))).toBe(true);
    });
});
