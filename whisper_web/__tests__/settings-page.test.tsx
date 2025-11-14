import { render, screen, within } from '@testing-library/react';
import SettingsPage from '@/app/settings/page';
import * as auth from '@/utils/auth';

const mockPush = jest.fn();

jest.mock('@/utils/auth');
jest.mock('next/navigation', () => ({
    useRouter: () => ({
        push: mockPush,
    }),
    usePathname: () => '/settings',
}));

const mockUseAuth = auth.useAuth as jest.MockedFunction<typeof auth.useAuth>;

describe('SettingsPage', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('shows loading state', () => {
        mockUseAuth.mockReturnValue({
            user: null,
            isLoading: true,
            mode: null,
        });

        render(<SettingsPage />);
        expect(screen.getByText(/loading/i)).toBeInTheDocument();
    });

    it('redirects when user is not authenticated', () => {
        mockPush.mockClear();
        mockUseAuth.mockReturnValue({
            user: null,
            isLoading: false,
            mode: null,
        });

        render(<SettingsPage />);
        expect(mockPush).toHaveBeenCalledWith('/login');
    });

    it('renders profile card with user info', () => {
        mockUseAuth.mockReturnValue({
            user: {
                uid: 'user-1',
                display_name: 'John Doe',
                email: 'john@example.com',
                plan: 'free',
            },
            isLoading: false,
            mode: 'webapp',
        });

        render(<SettingsPage />);
        const displayNameRow = screen.getByText(/display name/i).closest('div');
        const emailRow = screen.getByText(/primary email/i).closest('div');
        expect(displayNameRow).toBeTruthy();
        expect(emailRow).toBeTruthy();
        expect(within(displayNameRow as HTMLElement).getByText('John Doe')).toBeInTheDocument();
        expect(within(emailRow as HTMLElement).getByText('john@example.com')).toBeInTheDocument();
    });

    it('derives avatar initials from display name', () => {
        mockUseAuth.mockReturnValue({
            user: {
                uid: 'user-1',
                display_name: 'John Doe',
                email: 'john@example.com',
                plan: 'free',
            },
            isLoading: false,
            mode: 'webapp',
        });

        render(<SettingsPage />);
        const avatar = screen.getByText('JD');
        expect(avatar).toBeInTheDocument();
    });

    it('derives avatar initials from single name', () => {
        mockUseAuth.mockReturnValue({
            user: {
                uid: 'user-1',
                display_name: 'John',
                email: 'john@example.com',
                plan: 'free',
            },
            isLoading: false,
            mode: 'webapp',
        });

        render(<SettingsPage />);
        const avatar = screen.getByText('J');
        expect(avatar).toBeInTheDocument();
    });

    it('derives avatar initials from email when display name is empty', () => {
        mockUseAuth.mockReturnValue({
            user: {
                uid: 'user-1',
                display_name: '',
                email: 'john@example.com',
                plan: 'free',
            },
            isLoading: false,
            mode: 'webapp',
        });

        render(<SettingsPage />);
        const avatar = screen.getByText('J');
        expect(avatar).toBeInTheDocument();
    });

    it('shows webapp mode badge', () => {
        mockUseAuth.mockReturnValue({
            user: {
                uid: 'user-1',
                display_name: 'John Doe',
                email: 'john@example.com',
                plan: 'free',
            },
            isLoading: false,
            mode: 'webapp',
        });

        render(<SettingsPage />);
        expect(screen.getByText(/cloud authenticated/i)).toBeInTheDocument();
    });

    it('shows local mode badge', () => {
        mockUseAuth.mockReturnValue({
            user: {
                uid: 'user-1',
                display_name: 'John Doe',
                email: 'john@example.com',
                plan: 'free',
            },
            isLoading: false,
            mode: 'local',
        });

        render(<SettingsPage />);
        expect(screen.getByText(/local mode/i)).toBeInTheDocument();
    });

    it('renders plan link', () => {
        mockUseAuth.mockReturnValue({
            user: {
                uid: 'user-1',
                display_name: 'John Doe',
                email: 'john@example.com',
                plan: 'free',
            },
            isLoading: false,
            mode: 'webapp',
        });

        render(<SettingsPage />);
        const planLink = screen.getByText('Free');
        expect(planLink).toBeInTheDocument();
        expect(planLink.closest('a')).toHaveAttribute('href', 'https://www.app-whisper.com/pricing');
    });

    it('displays all profile details', () => {
        mockUseAuth.mockReturnValue({
            user: {
                uid: 'user-1',
                display_name: 'John Doe',
                email: 'john@example.com',
                plan: 'pro',
            },
            isLoading: false,
            mode: 'webapp',
        });

        render(<SettingsPage />);
        expect(screen.getByText(/display name/i)).toBeInTheDocument();
        expect(screen.getByText(/primary email/i)).toBeInTheDocument();
        expect(screen.getByText(/account id/i)).toBeInTheDocument();
        expect(screen.getByText(/current plan/i)).toBeInTheDocument();
        expect(screen.getByText(/sign-in method/i)).toBeInTheDocument();
        expect(screen.getByText(/data storage/i)).toBeInTheDocument();
    });

    it('shows correct sign-in method for webapp mode', () => {
        mockUseAuth.mockReturnValue({
            user: {
                uid: 'user-1',
                display_name: 'John Doe',
                email: 'john@example.com',
                plan: 'free',
            },
            isLoading: false,
            mode: 'webapp',
        });

        render(<SettingsPage />);
        const signInRow = screen.getByText(/sign-in method/i).closest('div');
        expect(signInRow).toBeTruthy();
        expect(within(signInRow as HTMLElement).getByText(/whisper web account/i)).toBeInTheDocument();
    });

    it('shows correct sign-in method for local mode', () => {
        mockUseAuth.mockReturnValue({
            user: {
                uid: 'user-1',
                display_name: 'John Doe',
                email: 'john@example.com',
                plan: 'free',
            },
            isLoading: false,
            mode: 'local',
        });

        render(<SettingsPage />);
        expect(screen.getByText(/local desktop session/i)).toBeInTheDocument();
    });
});

