import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LoginPage from '@/app/login/page';
import { desktop, makeUser, sentRequests } from './support/desktop';

const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

describe('LoginPage', () => {
    beforeEach(() => {
        router.push.mockClear();
    });

    it('in a plain browser, asks the user to sign in with their account', async () => {
        desktop.mode = 'web';

        render(<LoginPage />);

        expect(screen.getByRole('heading', { name: /welcome to whisper/i })).toBeInTheDocument();
        expect(await screen.findByText(/sign in with your account/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /sign in with account/i })).toBeInTheDocument();
    });

    it('in dev mock mode, shows the browser sign-in without asking for the runtime config', async () => {
        localStorage.setItem('dev_mock', '1');

        render(<LoginPage />);

        expect(await screen.findByRole('button', { name: /sign in with account/i })).toBeInTheDocument();
        expect(sentRequests).toEqual([]);
    });

    it('in the desktop app, syncs the signed-in desktop user and opens settings', async () => {
        desktop.user = makeUser({ uid: 'user-7', display_name: 'Desk User', email: 'desk@example.com' });

        render(<LoginPage />);

        expect(await screen.findByText(/desktop app detected/i)).toBeInTheDocument();
        expect(await screen.findByRole('button', { name: /sync complete/i })).toBeInTheDocument();
        expect(JSON.parse(localStorage.getItem('whisper_user') || 'null')).toEqual({
            uid: 'user-7',
            display_name: 'Desk User',
            email: 'desk@example.com',
        });
        await vi.waitFor(() => expect(router.push).toHaveBeenCalledWith('/settings'), { timeout: 2000 });
    });

    it('in the desktop app with no signed-in user, says so and offers a retry', async () => {
        desktop.user = null;

        render(<LoginPage />);

        expect(await screen.findByText(/desktop app user not found/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /retry sync/i })).toBeInTheDocument();
    });

    it('syncs on retry once the user has signed in to the desktop app', async () => {
        desktop.user = null;
        const user = userEvent.setup();
        render(<LoginPage />);
        const retry = await screen.findByRole('button', { name: /retry sync/i });

        desktop.user = makeUser({ display_name: 'Retry User' });
        await user.click(retry);

        expect(await screen.findByRole('button', { name: /sync complete/i })).toBeInTheDocument();
    });
});
