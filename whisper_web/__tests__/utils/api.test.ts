import * as api from '@/utils/api';
import { __resetApiTestState } from '@/utils/api';
import * as devMock from '@/utils/devMock';

jest.mock('@/utils/devMock');

const mockIsDevMockEnabled = devMock.isDevMockEnabled as jest.MockedFunction<typeof devMock.isDevMockEnabled>;
const mockGetSessionsMock = devMock.getSessionsMock as jest.MockedFunction<typeof devMock.getSessionsMock>;
const mockGetPresetsMock = devMock.getPresetsMock as jest.MockedFunction<typeof devMock.getPresetsMock>;
const mockGetMockUser = devMock.getMockUser as jest.MockedFunction<typeof devMock.getMockUser>;
const mockEnsureMockData = devMock.ensureMockData as jest.MockedFunction<typeof devMock.ensureMockData>;

describe('api utilities', () => {
    beforeEach(() => {
        __resetApiTestState();
        jest.clearAllMocks();
        global.fetch = jest.fn();
        localStorage.clear();
        mockIsDevMockEnabled.mockReturnValue(false);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('getMeetingsPage', () => {
        it('falls back to dev mock when enabled', async () => {
            mockIsDevMockEnabled.mockReturnValue(true);
            mockEnsureMockData.mockImplementation(() => {});
            mockGetSessionsMock.mockReturnValue([
                {
                    id: 'sess-1',
                    uid: 'user-1',
                    title: 'Meeting 1',
                    session_type: 'listen',
                    started_at: Math.floor(Date.now() / 1000),
                    sync_state: 'clean' as const,
                    updated_at: Math.floor(Date.now() / 1000),
                },
            ]);

            const result = await api.getMeetingsPage(0, 10);

            expect(result.items).toHaveLength(1);
            expect(result.items[0].session_type).toBe('listen');
        });

        it('calls API when dev mock disabled', async () => {
            mockIsDevMockEnabled.mockReturnValue(false);
            // runtime-config fetch
            (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false });

            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    items: [],
                    nextOffset: null,
                    total: 0,
                }),
            });

            await api.getMeetingsPage(0, 10);

            expect(global.fetch).toHaveBeenCalledTimes(2);
        });

        it('handles pagination correctly', async () => {
            mockIsDevMockEnabled.mockReturnValue(true);
            mockEnsureMockData.mockImplementation(() => {});
            const sessions = Array.from({ length: 15 }, (_, i) => ({
                id: `sess-${i}`,
                uid: 'user-1',
                title: `Meeting ${i}`,
                session_type: 'listen',
                started_at: Math.floor(Date.now() / 1000) - i * 3600,
                sync_state: 'clean' as const,
                updated_at: Math.floor(Date.now() / 1000) - i * 3600,
            }));
            mockGetSessionsMock.mockReturnValue(sessions);

            const result = await api.getMeetingsPage(0, 10);

            expect(result.items).toHaveLength(10);
            expect(result.nextOffset).toBe(10);
        });
    });

    describe('getQuestionsPage', () => {
        it('falls back to dev mock when enabled', async () => {
            mockIsDevMockEnabled.mockReturnValue(true);
            mockEnsureMockData.mockImplementation(() => {});
            mockGetSessionsMock.mockReturnValue([
                {
                    id: 'sess-1',
                    uid: 'user-1',
                    title: 'Question 1',
                    session_type: 'ask',
                    started_at: Math.floor(Date.now() / 1000),
                    sync_state: 'clean' as const,
                    updated_at: Math.floor(Date.now() / 1000),
                },
            ]);

            const result = await api.getQuestionsPage(0, 10);

            expect(result.items).toHaveLength(1);
            expect(result.items[0].session_type).toBe('ask');
        });
    });

    describe('getConversationStats', () => {
        it('calculates stats from mock data', async () => {
            mockIsDevMockEnabled.mockReturnValue(true);
            mockEnsureMockData.mockImplementation(() => {});
            mockGetSessionsMock.mockReturnValue([
                {
                    id: 'sess-1',
                    uid: 'user-1',
                    title: 'Meeting 1',
                    session_type: 'listen',
                    started_at: Math.floor(Date.now() / 1000) - 3600,
                    ended_at: Math.floor(Date.now() / 1000) - 1800,
                    sync_state: 'clean' as const,
                    updated_at: Math.floor(Date.now() / 1000) - 1800,
                },
            ]);

            const result = await api.getConversationStats();

            expect(result.totalMeetingSeconds).toBeGreaterThan(0);
        });
    });

    describe('getUserProfile', () => {
        it('returns mock user in dev mode', async () => {
            mockIsDevMockEnabled.mockReturnValue(true);
            mockEnsureMockData.mockImplementation(() => {});
            mockGetMockUser.mockReturnValue({
                uid: 'dev_user',
                display_name: 'Dev User',
                email: 'dev@example.com',
            });

            const result = await api.getUserProfile();

            expect(result).toEqual({
                uid: 'dev_user',
                display_name: 'Dev User',
                email: 'dev@example.com',
            });
        });

        it('calls API when dev mock disabled', async () => {
            mockIsDevMockEnabled.mockReturnValue(false);
            (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false }).mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    uid: 'user-1',
                    display_name: 'Test User',
                    email: 'test@example.com',
                }),
            });

            const result = await api.getUserProfile();

            expect(result).toEqual({
                uid: 'user-1',
                display_name: 'Test User',
                email: 'test@example.com',
            });
        });
    });

    describe('apiCall', () => {
        it('throws error in dev mock mode', async () => {
            mockIsDevMockEnabled.mockReturnValue(true);

            await expect(api.apiCall('/test')).rejects.toThrow('apiCall not available in dev mock mode');
        });

        it('includes user headers when user info exists', async () => {
            mockIsDevMockEnabled.mockReturnValue(false);
            localStorage.setItem(
                'whisper_user',
                JSON.stringify({
                    uid: 'user-1',
                    display_name: 'Test User',
                    email: 'test@example.com',
                })
            );

            (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false }).mockResolvedValueOnce({
                ok: true,
                json: async () => ({}),
            });

            await api.apiCall('/test', { method: 'GET' });

            const lastCall = (global.fetch as jest.Mock).mock.calls[(global.fetch as jest.Mock).mock.calls.length - 1];
            const headers = lastCall[1]?.headers;
            expect(headers['X-User-ID']).toBe('user-1');
        });

        it('handles API errors', async () => {
            mockIsDevMockEnabled.mockReturnValue(false);
            (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false }).mockResolvedValueOnce({
                ok: false,
                status: 500,
                text: async () => 'Internal Server Error',
            });

            const response = await api.apiCall('/test');

            expect(response.ok).toBe(false);
            expect(response.status).toBe(500);
        });
    });

    describe('deleteSession', () => {
        it('removes session from mock data', async () => {
            mockIsDevMockEnabled.mockReturnValue(true);
            mockEnsureMockData.mockImplementation(() => {});
            const sessions = [
                {
                    id: 'sess-1',
                    uid: 'user-1',
                    title: 'Meeting 1',
                    session_type: 'listen',
                    started_at: Math.floor(Date.now() / 1000),
                    sync_state: 'clean' as const,
                    updated_at: Math.floor(Date.now() / 1000),
                },
            ];
            mockGetSessionsMock.mockReturnValue(sessions);

            await api.deleteSession('sess-1');

            expect(mockGetSessionsMock).toHaveBeenCalled();
        });
    });
});
