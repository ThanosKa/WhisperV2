import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LoginPage from '@/app/login/page';
import * as api from '@/utils/api';
import * as devMock from '@/utils/devMock';

jest.mock('@/utils/api');
jest.mock('@/utils/devMock');
jest.mock('next/navigation', () => ({
    useRouter: () => ({
        push: jest.fn(),
    }),
}));

const mockGetUserProfile = api.getUserProfile as jest.MockedFunction<typeof api.getUserProfile>;
const mockIsDevMockEnabled = devMock.isDevMockEnabled as jest.MockedFunction<typeof devMock.isDevMockEnabled>;

describe('LoginPage', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        global.fetch = jest.fn();
        (global.fetch as jest.Mock).mockRejectedValue(new Error('Not found'));
        mockIsDevMockEnabled.mockReturnValue(false);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('renders welcome message', () => {
        render(<LoginPage />);
        expect(screen.getByText(/welcome to whisper/i)).toBeInTheDocument();
    });

    it('skips runtime-config fetch in dev mock mode', () => {
        mockIsDevMockEnabled.mockReturnValue(true);
        render(<LoginPage />);
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it('detects Electron mode via runtime-config', async () => {
        (global.fetch as jest.Mock).mockResolvedValueOnce({
            ok: true,
            json: async () => ({ API_URL: 'http://localhost:9001' }),
        });

        render(<LoginPage />);
        await waitFor(() => {
            expect(screen.getByText(/desktop app detected/i)).toBeInTheDocument();
        });
    });

    it('shows web mode when runtime-config not found', async () => {
        (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Not found'));

        render(<LoginPage />);
        await waitFor(() => {
            expect(screen.getByText(/sign in with your account/i)).toBeInTheDocument();
        });
    });

    it('handles sync success', async () => {
        (global.fetch as jest.Mock).mockResolvedValueOnce({
            ok: true,
            json: async () => ({ API_URL: 'http://localhost:9001' }),
        });

        mockGetUserProfile.mockResolvedValue({
            uid: 'user-1',
            display_name: 'Test User',
            email: 'test@example.com',
        });

        render(<LoginPage />);

        await waitFor(() => {
            expect(mockGetUserProfile).toHaveBeenCalledTimes(1);
        });

        await waitFor(() => {
            expect(screen.getByRole('button', { name: /sync complete/i })).toBeInTheDocument();
        });
    });

    it('shows error message on sync failure', async () => {
        (global.fetch as jest.Mock).mockResolvedValueOnce({
            ok: true,
            json: async () => ({ API_URL: 'http://localhost:9001' }),
        });

        mockGetUserProfile.mockRejectedValue(new Error('Failed to fetch'));

        render(<LoginPage />);

        await waitFor(() => {
            expect(mockGetUserProfile).toHaveBeenCalledTimes(1);
        });

        await waitFor(() => {
            expect(screen.getByText(/desktop app user not found/i)).toBeInTheDocument();
            expect(screen.getByRole('button', { name: /retry sync/i })).toBeInTheDocument();
        });
    });

    it('shows retry button after error', async () => {
        (global.fetch as jest.Mock).mockResolvedValueOnce({
            ok: true,
            json: async () => ({ API_URL: 'http://localhost:9001' }),
        });

        mockGetUserProfile
            .mockRejectedValueOnce(new Error('Failed to fetch'))
            .mockResolvedValueOnce({
                uid: 'user-1',
                display_name: 'Retry User',
                email: 'retry@example.com',
            });

        const user = userEvent.setup();
        render(<LoginPage />);

        await waitFor(() => {
            expect(screen.getByRole('button', { name: /retry sync/i })).toBeInTheDocument();
        });

        const syncButton = screen.getByRole('button', { name: /retry sync/i });
        await user.click(syncButton);

        await waitFor(() => {
            expect(mockGetUserProfile).toHaveBeenCalledTimes(2);
            expect(screen.getByRole('button', { name: /sync complete/i })).toBeInTheDocument();
        });
    });
});

