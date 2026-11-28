import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SearchPopup from '@/components/layout/SearchPopup';
import { desktop, makeMeeting, makeQuestion, sentRequests } from './support/desktop';

const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

const PLACEHOLDER = 'Search conversations...';

describe('SearchPopup', () => {
    beforeEach(() => {
        router.push.mockClear();
        desktop.sessions = [
            makeMeeting({ id: 'meeting-1', title: 'Team Sync' }),
            makeMeeting({ id: 'meeting-2', title: 'Product Review' }),
            makeQuestion({ id: 'question-1', title: 'Sync question' }),
        ];
    });

    it('lists the sessions whose title matches what the user types', async () => {
        const user = userEvent.setup();
        render(<SearchPopup isOpen onClose={vi.fn()} />);

        await user.type(screen.getByPlaceholderText(PLACEHOLDER), 'sync');

        expect(await screen.findByText('Team Sync')).toBeInTheDocument();
        expect(screen.getByText('Sync question')).toBeInTheDocument();
        expect(screen.queryByText('Product Review')).not.toBeInTheDocument();
        expect(screen.getByText('End.')).toBeInTheDocument();
    });

    it('says so when nothing matches', async () => {
        const user = userEvent.setup();
        render(<SearchPopup isOpen onClose={vi.fn()} />);

        await user.type(screen.getByPlaceholderText(PLACEHOLDER), 'zzz');

        expect(await screen.findByText(/no results found for "zzz"/i)).toBeInTheDocument();
    });

    it('shows the help text for a lone question mark, without searching', async () => {
        const user = userEvent.setup();
        render(<SearchPopup isOpen onClose={vi.fn()} />);

        await user.type(screen.getByPlaceholderText(PLACEHOLDER), '?');

        expect(await screen.findByText('Help with searching')).toBeInTheDocument();
        expect(sentRequests.some(request => request.includes('/search/page'))).toBe(false);
    });

    it('searches the summaries too when the query starts with a hash', async () => {
        const user = userEvent.setup();
        render(<SearchPopup isOpen onClose={vi.fn()} />);

        await user.type(screen.getByPlaceholderText(PLACEHOLDER), '#plan');

        await screen.findByText('Product Review');
        expect(sentRequests.some(request => request.includes('/search/page') && request.includes('scope=all'))).toBe(true);
    });

    it('opens the chosen session and closes the popup', async () => {
        const user = userEvent.setup();
        const onClose = vi.fn();
        render(<SearchPopup isOpen onClose={onClose} />);

        await user.type(screen.getByPlaceholderText(PLACEHOLDER), 'team');
        await user.click(await screen.findByText('Team Sync'));

        expect(router.push).toHaveBeenCalledWith('/activity/details?sessionId=meeting-1');
        expect(onClose).toHaveBeenCalled();
    });

    it('clears the query with the clear button', async () => {
        const user = userEvent.setup();
        render(<SearchPopup isOpen onClose={vi.fn()} />);
        const input = screen.getByPlaceholderText(PLACEHOLDER);

        await user.type(input, 'team');
        await screen.findByText('Team Sync');
        const clear = screen.getAllByRole('button').find(button => button.querySelector('svg.lucide-x'));
        if (!clear) throw new Error('No clear button');
        await user.click(clear);

        expect(input).toHaveValue('');
        expect(screen.queryByText('Team Sync')).not.toBeInTheDocument();
    });
});
