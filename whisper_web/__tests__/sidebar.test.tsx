import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Sidebar from '@/components/layout/Sidebar';
import { desktop, makeUser } from './support/desktop';

const router = vi.hoisted(() => ({ push: vi.fn() }));
const location = vi.hoisted(() => ({ pathname: '/activity' }));
vi.mock('next/navigation', () => ({
    useRouter: () => router,
    usePathname: () => location.pathname,
}));

describe('Sidebar', () => {
    beforeEach(() => {
        router.push.mockClear();
        location.pathname = '/activity';
        desktop.user = makeUser({ display_name: 'Test User' });
    });

    it('links to the activity and personalize pages', () => {
        render(<Sidebar isCollapsed={false} onToggle={vi.fn()} />);

        expect(screen.getByRole('link', { name: 'View my activity' })).toHaveAttribute('href', '/activity');
        expect(screen.getByRole('link', { name: 'Personalization settings' })).toHaveAttribute('href', '/personalize');
    });

    it('opens the search from the search button', async () => {
        const user = userEvent.setup();
        const onSearchClick = vi.fn();
        render(<Sidebar isCollapsed={false} onToggle={vi.fn()} onSearchClick={onSearchClick} />);

        await user.click(screen.getByRole('button', { name: 'Open search' }));

        expect(onSearchClick).toHaveBeenCalledTimes(1);
    });

    it('collapses and expands with the toggle buttons', async () => {
        const user = userEvent.setup();
        const onToggle = vi.fn();
        const { rerender } = render(<Sidebar isCollapsed={false} onToggle={onToggle} />);

        await user.click(screen.getByRole('button', { name: 'Close sidebar' }));
        expect(onToggle).toHaveBeenLastCalledWith(true);

        rerender(<Sidebar isCollapsed onToggle={onToggle} />);
        const [openButton] = screen.getAllByRole('button', { name: 'Open sidebar' });
        if (!openButton) throw new Error('No open button');
        await user.click(openButton);
        expect(onToggle).toHaveBeenLastCalledWith(false);
    });

    it('shows the settings submenu once the user opens it, with the login link for a guest', async () => {
        const user = userEvent.setup();
        desktop.user = null;
        render(<Sidebar isCollapsed={false} onToggle={vi.fn()} />);

        const settings = screen.getByRole('button', { name: 'Settings menu' });
        expect(settings).toHaveAttribute('aria-expanded', 'false');
        await user.click(settings);

        expect(settings).toHaveAttribute('aria-expanded', 'true');
        expect(screen.getByRole('menuitem', { name: 'Personal profile settings' })).toHaveAttribute('href', '/settings');
        expect(screen.getByRole('menuitem', { name: 'Data and privacy settings' })).toHaveAttribute('href', '/settings/privacy');
        expect(screen.getByRole('menuitem', { name: 'Login' })).toHaveAttribute('href', '/login');
    });

    it('starts with the settings submenu open on a settings page and marks the current page', () => {
        location.pathname = '/settings/privacy';
        render(<Sidebar isCollapsed={false} onToggle={vi.fn()} />);

        expect(screen.getByRole('button', { name: 'Settings menu' })).toHaveAttribute('aria-expanded', 'true');
        expect(screen.getByRole('menuitem', { name: 'Data and privacy settings' })).toHaveAttribute('aria-current', 'page');
        expect(screen.getByRole('menuitem', { name: 'Personal profile settings' })).not.toHaveAttribute('aria-current');
    });

    it('shows the signed-in user and sends them to settings from the avatar', async () => {
        const user = userEvent.setup();
        render(<Sidebar isCollapsed={false} onToggle={vi.fn()} />);

        const avatar = await screen.findByRole('button', { name: 'User: Test User' });
        await user.click(avatar);

        expect(router.push).toHaveBeenCalledWith('/settings');
    });

    it('sends a guest to login from the avatar', async () => {
        const user = userEvent.setup();
        desktop.user = null;
        render(<Sidebar isCollapsed={false} onToggle={vi.fn()} />);

        const avatar = await screen.findByRole('button', { name: 'User: Guest' });
        await user.click(avatar);

        expect(router.push).toHaveBeenCalledWith('/login');
    });
});
