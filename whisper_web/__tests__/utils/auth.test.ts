import { renderHook, waitFor } from '@testing-library/react';
import { useAuth, useRedirectIfNotAuth } from '@/utils/auth';
import * as api from '@/utils/api';
import * as devMock from '@/utils/devMock';

const mockPush = jest.fn();

jest.mock('@/utils/api');
jest.mock('@/utils/devMock');
jest.mock('next/navigation', () => ({
    useRouter: () => ({
        push: mockPush,
    }),
}));

const mockGetUserProfile = api.getUserProfile as jest.MockedFunction<typeof api.getUserProfile>;
const mockIsDevMockEnabled = devMock.isDevMockEnabled as jest.MockedFunction<typeof devMock.isDevMockEnabled>;
const mockGetMockUser = devMock.getMockUser as jest.MockedFunction<typeof devMock.getMockUser>;
const mockEnsureMockData = devMock.ensureMockData as jest.MockedFunction<typeof devMock.ensureMockData>;

describe('useAuth', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        global.fetch = jest.fn();
        localStorage.clear();
        (global.fetch as jest.Mock).mockRejectedValue(new Error('Not found'));
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('short-circuits in dev mock mode', async () => {
        mockIsDevMockEnabled.mockReturnValue(true);
        mockGetMockUser.mockReturnValue({
            uid: 'dev_user',
            display_name: 'Dev User',
            email: 'dev@example.com',
        });
        mockEnsureMockData.mockImplementation(() => {});

        const { result } = renderHook(() => useAuth());

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });

        expect(result.current.user).toEqual({
            uid: 'dev_user',
            display_name: 'Dev User',
            email: 'dev@example.com',
        });
        expect(result.current.mode).toBe('webapp');
    });

    it('fetches user from API in Electron mode', async () => {
        mockIsDevMockEnabled.mockReturnValue(false);
        (global.fetch as jest.Mock).mockResolvedValueOnce({
            ok: true,
            json: async () => ({ API_URL: 'http://localhost:9001' }),
        });

        mockGetUserProfile.mockResolvedValue({
            uid: 'user-1',
            display_name: 'Test User',
            email: 'test@example.com',
        });

        const { result } = renderHook(() => useAuth());

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        }, { timeout: 3000 });

        expect(mockGetUserProfile).toHaveBeenCalled();
        expect(result.current.user).toEqual({
            uid: 'user-1',
            display_name: 'Test User',
            email: 'test@example.com',
        });
    });

    it('uses localStorage in web mode', async () => {
        mockIsDevMockEnabled.mockReturnValue(false);
        (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Not found'));

        const userProfile = {
            uid: 'user-1',
            display_name: 'Test User',
            email: 'test@example.com',
        };
        localStorage.setItem('whisper_user', JSON.stringify(userProfile));

        const { result } = renderHook(() => useAuth());

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        }, { timeout: 3000 });

        expect(result.current.user).toEqual(userProfile);
        expect(result.current.mode).toBe('webapp');
    });

    it('returns null user when not authenticated', async () => {
        mockIsDevMockEnabled.mockReturnValue(false);
        (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Not found'));

        const { result } = renderHook(() => useAuth());

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        }, { timeout: 3000 });

        expect(result.current.user).toBeNull();
        expect(result.current.mode).toBeNull();
    });

    it('handles retry limit', async () => {
        mockIsDevMockEnabled.mockReturnValue(false);
        (global.fetch as jest.Mock).mockRejectedValue(new Error('Not found'));

        const { result } = renderHook(() => useAuth());

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        }, { timeout: 5000 });

        expect(result.current.user).toBeNull();
    });

    it('debounces userInfoChanged events', async () => {
        mockIsDevMockEnabled.mockReturnValue(false);
        (global.fetch as jest.Mock).mockRejectedValue(new Error('Not found'));

        const { result } = renderHook(() => useAuth());

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });

        const initialCallCount = (global.fetch as jest.Mock).mock.calls.length;

        // Fire multiple events rapidly
        window.dispatchEvent(new Event('userInfoChanged'));
        window.dispatchEvent(new Event('userInfoChanged'));
        window.dispatchEvent(new Event('userInfoChanged'));

        await waitFor(() => {
            // Should not trigger excessive calls due to debounce
            const newCallCount = (global.fetch as jest.Mock).mock.calls.length;
            expect(newCallCount).toBeLessThanOrEqual(initialCallCount + 2);
        }, { timeout: 1000 });
    });
});

describe('useRedirectIfNotAuth', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockPush.mockClear();
    });

    it('redirects when user is not authenticated', async () => {
        mockIsDevMockEnabled.mockReturnValue(false);
        (global.fetch as jest.Mock).mockRejectedValue(new Error('Not found'));

        renderHook(() => useRedirectIfNotAuth());

        await waitFor(() => {
            expect(mockPush).toHaveBeenCalledWith('/login');
        }, { timeout: 3000 });
    });

    it('returns user when authenticated', async () => {
        mockIsDevMockEnabled.mockReturnValue(true);
        mockGetMockUser.mockReturnValue({
            uid: 'dev_user',
            display_name: 'Dev User',
            email: 'dev@example.com',
        });
        mockEnsureMockData.mockImplementation(() => {});

        const { result } = renderHook(() => useRedirectIfNotAuth());

        await waitFor(() => {
            expect(result.current).not.toBeNull();
        });

        expect(result.current).toEqual({
            uid: 'dev_user',
            display_name: 'Dev User',
            email: 'dev@example.com',
        });
    });
});

