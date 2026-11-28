import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SettingsPage from '@/app/settings/page';
import { desktop, holdApi, makeUser, server } from './support/desktop';

const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/settings' }));

/** The value shown under a profile detail's label. */
const detail = async (label: RegExp) => {
    const row = (await screen.findByText(label)).parentElement;
    if (!row) throw new Error(`No row around the ${label} label`);
    return within(row);
};

describe('SettingsPage', () => {
    beforeEach(() => {
        router.push.mockClear();
    });

    it('shows a loading state until the desktop answers', async () => {
        server.use(holdApi('/api/user/profile'));

        render(<SettingsPage />);

        expect(screen.getByText(/loading/i)).toBeInTheDocument();
    });

    it('sends the user to login when the desktop has no signed-in user', async () => {
        desktop.user = null;

        render(<SettingsPage />);

        await vi.waitFor(() => expect(router.push).toHaveBeenCalledWith('/login'));
    });

    it('in a plain browser with no stored user, sends the user to login', async () => {
        desktop.mode = 'web';

        render(<SettingsPage />);

        await vi.waitFor(() => expect(router.push).toHaveBeenCalledWith('/login'));
    });

    it('in a plain browser, shows the user stored by the last sign-in', async () => {
        desktop.mode = 'web';
        localStorage.setItem('whisper_user', JSON.stringify({ uid: 'user-9', display_name: 'Stored User', email: 'stored@example.com' }));

        render(<SettingsPage />);

        expect((await detail(/display name/i)).getByText('Stored User')).toBeInTheDocument();
        expect((await detail(/primary email/i)).getByText('stored@example.com')).toBeInTheDocument();
    });

    it("shows the desktop user's profile", async () => {
        desktop.user = makeUser({ uid: 'user-1', display_name: 'John Doe', email: 'john@example.com', plan: 'free' });

        render(<SettingsPage />);

        expect((await detail(/display name/i)).getByText('John Doe')).toBeInTheDocument();
        expect((await detail(/primary email/i)).getByText('john@example.com')).toBeInTheDocument();
        expect((await detail(/account id/i)).getByText('user-1')).toBeInTheDocument();
        expect((await detail(/sign-in method/i)).getByText(/whisper web account/i)).toBeInTheDocument();
        expect((await detail(/data storage/i)).getByText(/synced securely/i)).toBeInTheDocument();
        expect(screen.getByText(/cloud authenticated/i)).toBeInTheDocument();
    });

    it('shows initials of the first and last name in the avatar', async () => {
        desktop.user = makeUser({ display_name: 'John Doe' });

        render(<SettingsPage />);

        expect(await screen.findByText('JD')).toBeInTheDocument();
    });

    it('shows the first initial of a single name in the avatar', async () => {
        desktop.user = makeUser({ display_name: 'John' });

        render(<SettingsPage />);

        expect(await screen.findByText('J')).toBeInTheDocument();
    });

    it('uses the email for the name and avatar when the display name is empty', async () => {
        desktop.user = makeUser({ display_name: '', email: 'john@example.com' });

        render(<SettingsPage />);

        expect(await screen.findByText('J')).toBeInTheDocument();
        expect((await detail(/display name/i)).getByText('john@example.com')).toBeInTheDocument();
    });

    it('links the free plan to the WhisperApp pricing page', async () => {
        desktop.user = makeUser({ plan: 'free' });

        render(<SettingsPage />);

        expect(await screen.findByRole('link', { name: 'Free' })).toHaveAttribute('href', 'https://www.app-whisper.com/pricing');
    });

    it('shows the plan the desktop got from WhisperApp', async () => {
        desktop.user = makeUser({ plan: 'pro' });

        render(<SettingsPage />);

        expect(await screen.findByRole('link', { name: 'Pro' })).toBeInTheDocument();
    });
});
