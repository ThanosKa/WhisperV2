import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useAuth } from '@/lib/auth';
import { API_URL, sentRequests } from '../support/desktop';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

const profileRequests = () => sentRequests.filter(request => request === `GET ${API_URL}/api/user/profile`).length;

describe('useAuth', () => {
    it('checks the desktop user again once for a burst of userInfoChanged events', async () => {
        const { result } = renderHook(() => useAuth());
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(profileRequests()).toBe(1);

        window.dispatchEvent(new Event('userInfoChanged'));
        window.dispatchEvent(new Event('userInfoChanged'));
        window.dispatchEvent(new Event('userInfoChanged'));
        await waitFor(() => expect(profileRequests()).toBe(2));
        await new Promise(resolve => setTimeout(resolve, 150));

        expect(profileRequests()).toBe(2);
    });
});
