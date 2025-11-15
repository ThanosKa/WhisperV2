import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ActivityPage from '@/app/activity/page';
import * as api from '@/utils/api';
import * as auth from '@/utils/auth';

jest.mock('@/utils/api');
jest.mock('@/utils/auth');

const mockGetMeetingsPage = api.getMeetingsPage as jest.MockedFunction<typeof api.getMeetingsPage>;
const mockGetQuestionsPage = api.getQuestionsPage as jest.MockedFunction<typeof api.getQuestionsPage>;
const mockGetConversationStats = api.getConversationStats as jest.MockedFunction<typeof api.getConversationStats>;
const mockDeleteSession = api.deleteSession as jest.MockedFunction<typeof api.deleteSession>;
const mockUseRedirectIfNotAuth = auth.useRedirectIfNotAuth as jest.MockedFunction<typeof auth.useRedirectIfNotAuth>;

describe('ActivityPage', () => {
    const mockUser = {
        uid: 'user-1',
        display_name: 'Test User',
        email: 'test@example.com',
    };

    const mockMeetings = [
        {
            id: 'meeting-1',
            uid: 'user-1',
            title: 'Team Sync',
            session_type: 'listen',
            started_at: Math.floor(Date.now() / 1000) - 3600,
            ended_at: Math.floor(Date.now() / 1000) - 1800,
            sync_state: 'clean' as const,
            updated_at: Math.floor(Date.now() / 1000) - 1800,
        },
        {
            id: 'meeting-2',
            uid: 'user-1',
            title: 'Product Review',
            session_type: 'listen',
            started_at: Math.floor(Date.now() / 1000) - 7200,
            ended_at: Math.floor(Date.now() / 1000) - 5400,
            sync_state: 'clean' as const,
            updated_at: Math.floor(Date.now() / 1000) - 5400,
        },
    ];

    const mockQuestions = [
        {
            id: 'question-1',
            uid: 'user-1',
            title: 'Question #1',
            session_type: 'ask',
            started_at: Math.floor(Date.now() / 1000) - 3600,
            sync_state: 'clean' as const,
            updated_at: Math.floor(Date.now() / 1000) - 3600,
        },
    ];

    beforeEach(() => {
        jest.clearAllMocks();
        mockUseRedirectIfNotAuth.mockReturnValue(mockUser);
        mockGetMeetingsPage.mockResolvedValue({
            items: mockMeetings,
            nextOffset: null,
            total: mockMeetings.length,
        });
        mockGetQuestionsPage.mockResolvedValue({
            items: mockQuestions,
            nextOffset: null,
            total: mockQuestions.length,
        });
        mockGetConversationStats.mockResolvedValue({
            totalMeetingSeconds: 3600,
            totalQuestions: 5,
        });
    });

    it('renders loading state initially', async () => {
        mockGetMeetingsPage.mockImplementation(() => new Promise(() => {}));
        mockGetQuestionsPage.mockImplementation(() => new Promise(() => {}));
        mockGetConversationStats.mockImplementation(() => new Promise(() => {}));

        render(<ActivityPage />);
        expect(screen.getByText(/loading your activity/i)).toBeInTheDocument();
    });

    it('renders greeting with user name', async () => {
        render(<ActivityPage />);
        await waitFor(() => {
            expect(screen.getByText(/test user/i)).toBeInTheDocument();
        });
    });

    it('renders stats cards', async () => {
        render(<ActivityPage />);
        await waitFor(() => {
            expect(screen.getByText(/total time in meetings/i)).toBeInTheDocument();
            expect(screen.getByText(/whisper uses/i)).toBeInTheDocument();
        });
    });

    it('displays meetings tab by default', async () => {
        render(<ActivityPage />);
        await waitFor(() => {
            expect(screen.getByText('Team Sync')).toBeInTheDocument();
            expect(screen.getByText('Product Review')).toBeInTheDocument();
        });
    });

    it('switches to questions tab', async () => {
        const user = userEvent.setup();
        render(<ActivityPage />);
        await screen.findByText('Team Sync');

        const questionsTab = screen.getByRole('button', { name: /questions/i });
        await user.click(questionsTab);

        await waitFor(() => {
            expect(screen.getByText('Question #1')).toBeInTheDocument();
            expect(screen.queryByText('Team Sync')).not.toBeInTheDocument();
        });
    });

    it('shows empty state when no meetings', async () => {
        mockGetMeetingsPage.mockResolvedValue({
            items: [],
            nextOffset: null,
            total: 0,
        });

        render(<ActivityPage />);
        await waitFor(() => {
            expect(screen.getByText(/no meetings yet/i)).toBeInTheDocument();
        });
    });

    it('shows empty state when no questions', async () => {
        mockGetQuestionsPage.mockResolvedValue({
            items: [],
            nextOffset: null,
            total: 0,
        });

        const user = userEvent.setup();
        render(<ActivityPage />);
        await screen.findByText('Team Sync');

        const questionsTab = screen.getByRole('button', { name: /questions/i });
        await user.click(questionsTab);

        await waitFor(() => {
            expect(screen.getByText(/no questions yet/i)).toBeInTheDocument();
        });
    });

    it('opens delete confirmation dialog', async () => {
        const user = userEvent.setup();
        render(<ActivityPage />);
        await screen.findByText('Team Sync');

        const deleteButtons = screen.getAllByRole('button', { name: /delete/i });
        await user.click(deleteButtons[0]);

        await waitFor(() => {
            expect(screen.getByText(/are you sure you want to delete/i)).toBeInTheDocument();
        });
    });

    it('deletes session on confirmation', async () => {
        mockDeleteSession.mockResolvedValue(undefined);
        mockGetMeetingsPage.mockResolvedValue({
            items: [mockMeetings[0]],
            nextOffset: null,
            total: 1,
        });

        const user = userEvent.setup();
        render(<ActivityPage />);
        await waitFor(() => {
            expect(screen.getByText('Team Sync')).toBeInTheDocument();
        });

        const deleteButtons = screen.getAllByRole('button', { name: /delete/i });
        await user.click(deleteButtons[0]);

        await waitFor(() => {
            expect(screen.getByText(/are you sure/i)).toBeInTheDocument();
        });

        const confirmButton = screen.getByRole('button', { name: /delete/i });
        await user.click(confirmButton);

        await waitFor(() => {
            expect(mockDeleteSession).toHaveBeenCalledWith('meeting-1');
        });
    });

    it('loads more meetings on scroll', async () => {
        const moreMeetings = [
            ...mockMeetings,
            {
                id: 'meeting-3',
                uid: 'user-1',
                title: 'Sprint Planning',
                session_type: 'listen',
                started_at: Math.floor(Date.now() / 1000) - 10800,
                ended_at: Math.floor(Date.now() / 1000) - 9000,
                sync_state: 'clean' as const,
                updated_at: Math.floor(Date.now() / 1000) - 9000,
            },
        ];

        const originalImplementation = mockGetMeetingsPage.getMockImplementation();
        mockGetMeetingsPage.mockImplementation((offset = 0) => {
            if (offset === 0) {
                return Promise.resolve({
                    items: mockMeetings,
                    nextOffset: 2,
                    total: 3,
                });
            }
            return Promise.resolve({
                items: [moreMeetings[2]],
                nextOffset: null,
                total: 3,
            });
        });

        const originalObserver = window.IntersectionObserver;
        let observerCallback: IntersectionObserverCallback | null = null;
        window.IntersectionObserver = jest.fn((cb: IntersectionObserverCallback) => {
            observerCallback = cb;
            return {
                observe: jest.fn(),
                disconnect: jest.fn(),
                unobserve: jest.fn(),
                takeRecords: jest.fn(),
                root: null,
                rootMargin: '',
                thresholds: [],
            } as IntersectionObserver;
        }) as unknown as typeof IntersectionObserver;

        render(<ActivityPage />);
        await screen.findByText('Team Sync');

        expect(observerCallback).toBeTruthy();
        const initialCallCount = mockGetMeetingsPage.mock.calls.length;
        if (observerCallback) {
            act(() => {
                observerCallback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
            });
        }

        await waitFor(() => {
            expect(mockGetMeetingsPage.mock.calls.length).toBeGreaterThan(initialCallCount);
            expect(mockGetMeetingsPage).toHaveBeenCalledWith(2, 10);
        }, { timeout: 3000 });

        window.IntersectionObserver = originalObserver;
        if (originalImplementation) {
            mockGetMeetingsPage.mockImplementation(originalImplementation);
        } else {
            mockGetMeetingsPage.mockReset();
        }
    });

    it('handles pagination correctly', async () => {
        mockGetMeetingsPage.mockResolvedValue({
            items: mockMeetings,
            nextOffset: 2,
            total: 5,
        });

        render(<ActivityPage />);
        await waitFor(() => {
            expect(screen.getByText('Team Sync')).toBeInTheDocument();
        });

        expect(mockGetMeetingsPage).toHaveBeenCalledWith(0, 10);
    });
});

