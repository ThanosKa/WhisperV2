import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ActivityPage from '@/app/activity/page';
import { desktop, holdApi, makeMeeting, makeQuestion, makeUser, sentRequests, server } from './support/desktop';
import { scrollIntoView } from './support/intersection-observer';

const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

/** The card of the session with this title. */
const card = async (title: string) => {
    const link = (await screen.findByText(title)).closest('a');
    if (!link) throw new Error(`No session card around ${title}`);
    return within(link);
};

describe('ActivityPage', () => {
    beforeEach(() => {
        router.push.mockClear();
        desktop.user = makeUser({ display_name: 'Test User' });
        desktop.sessions = [
            makeMeeting({ id: 'meeting-1', title: 'Team Sync', minutes: 30, hoursAgo: 1 }),
            makeMeeting({ id: 'meeting-2', title: 'Product Review', minutes: 45, hoursAgo: 2 }),
            makeQuestion({ id: 'question-1', title: 'Question #1', hoursAgo: 1 }),
        ];
        desktop.userQuestionCount = 5;
    });

    it('shows a loading state until the sessions arrive', async () => {
        server.use(holdApi('/api/conversations/meetings'));

        render(<ActivityPage />);

        expect(await screen.findByText(/loading your activity/i)).toBeInTheDocument();
    });

    it('greets the desktop user by name', async () => {
        render(<ActivityPage />);

        expect(await screen.findByRole('heading', { name: /good (morning|afternoon|evening), test user/i })).toBeInTheDocument();
    });

    it('sends the user to login when the desktop has no signed-in user', async () => {
        desktop.user = null;

        render(<ActivityPage />);

        await vi.waitFor(() => expect(router.push).toHaveBeenCalledWith('/login'));
    });

    it('shows the total meeting time and the number of questions', async () => {
        render(<ActivityPage />);

        expect(await screen.findByText('1h 15m')).toBeInTheDocument();
        expect(screen.getByText(/total time in meetings/i)).toBeInTheDocument();
        expect(screen.getByText(/whisper uses/i)).toBeInTheDocument();
        expect(screen.getByText('5')).toBeInTheDocument();
    });

    it('lists the meetings first', async () => {
        render(<ActivityPage />);

        expect(await screen.findByText('Team Sync')).toBeInTheDocument();
        expect(screen.getByText('Product Review')).toBeInTheDocument();
        expect(screen.queryByText('Question #1')).not.toBeInTheDocument();
    });

    it('lists the questions on the questions tab', async () => {
        const user = userEvent.setup();
        render(<ActivityPage />);
        await screen.findByText('Team Sync');

        await user.click(screen.getByRole('button', { name: 'Questions' }));

        expect(await screen.findByText('Question #1')).toBeInTheDocument();
        expect(screen.queryByText('Team Sync')).not.toBeInTheDocument();
    });

    it('says so when there are no meetings yet', async () => {
        desktop.sessions = [makeQuestion({ id: 'question-1', title: 'Question #1' })];

        render(<ActivityPage />);

        expect(await screen.findByText(/no meetings yet/i)).toBeInTheDocument();
    });

    it('says so when there are no questions yet', async () => {
        desktop.sessions = [makeMeeting({ id: 'meeting-1', title: 'Team Sync' })];
        const user = userEvent.setup();
        render(<ActivityPage />);
        await screen.findByText('Team Sync');

        await user.click(screen.getByRole('button', { name: 'Questions' }));

        expect(await screen.findByText(/no questions yet/i)).toBeInTheDocument();
    });

    it('deletes a session after the user confirms', async () => {
        const user = userEvent.setup();
        render(<ActivityPage />);

        await user.click((await card('Team Sync')).getByRole('button', { name: 'Delete' }));
        const dialog = await screen.findByRole('dialog');
        expect(within(dialog).getByText(/are you sure you want to delete this activity/i)).toBeInTheDocument();
        await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

        await waitFor(() => expect(screen.queryByText('Team Sync')).not.toBeInTheDocument());
        expect(screen.getByText('Product Review')).toBeInTheDocument();
        expect(desktop.sessions.map(s => s.id)).not.toContain('meeting-1');
    });

    it('keeps the session when the user cancels the delete', async () => {
        const user = userEvent.setup();
        render(<ActivityPage />);

        await user.click((await card('Team Sync')).getByRole('button', { name: 'Delete' }));
        await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel' }));

        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        expect(screen.getByText('Team Sync')).toBeInTheDocument();
        expect(sentRequests.filter(request => request.startsWith('DELETE'))).toEqual([]);
    });

    it('renames a session', async () => {
        const user = userEvent.setup();
        render(<ActivityPage />);

        await user.click((await card('Team Sync')).getByRole('button', { name: 'Edit' }));
        const input = screen.getByPlaceholderText(/enter title/i);
        await user.clear(input);
        await user.type(input, 'Weekly Sync{Enter}');

        expect(await screen.findByText('Weekly Sync')).toBeInTheDocument();
        expect(desktop.sessions.find(s => s.id === 'meeting-1')?.title).toBe('Weekly Sync');
    });

    it('loads the next page of meetings when the user scrolls to the end', async () => {
        desktop.sessions = Array.from({ length: 12 }, (_, i) => makeMeeting({ id: `meeting-${i + 1}`, title: `Meeting ${i + 1}`, hoursAgo: i + 1 }));
        render(<ActivityPage />);
        expect(await screen.findByText('Meeting 10')).toBeInTheDocument();
        expect(screen.queryByText('Meeting 11')).not.toBeInTheDocument();

        scrollIntoView(screen.getByTestId('meetings-sentinel'));

        expect(await screen.findByText('Meeting 12')).toBeInTheDocument();
        expect(screen.getByText('Meeting 11')).toBeInTheDocument();
        expect(screen.getByText('End.')).toBeInTheDocument();
    });

    it('in dev mock mode, shows the mock user and sessions without any request', async () => {
        localStorage.setItem('dev_mock', '1');
        const user = userEvent.setup();

        render(<ActivityPage />);

        expect(await screen.findByRole('heading', { name: /dev user/i })).toBeInTheDocument();
        expect(await screen.findByText('Team Sync #1')).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Questions' }));
        expect(await screen.findByText('Question #1')).toBeInTheDocument();
        expect(sentRequests).toEqual([]);
    });
});
