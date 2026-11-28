'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { type Session, deleteSession, getConversationStats, getMeetingsPage, getQuestionsPage } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { type ActivityTab } from './SessionList';

const PAGE_SIZE = 10;

/** The activity page's data: both session lists with infinite scroll, the stats, and deleting a session. */
export function useActivitySessions() {
    const [meetings, setMeetings] = useState<Session[]>([]);
    const [questions, setQuestions] = useState<Session[]>([]);
    const [activeTab, setActiveTab] = useState<ActivityTab>('meetings');
    const [isLoading, setIsLoading] = useState(true);
    const [isLoadingMoreMeetings, setIsLoadingMoreMeetings] = useState(false);
    const [isLoadingMoreQuestions, setIsLoadingMoreQuestions] = useState(false);
    const [meetingsOffset, setMeetingsOffset] = useState<number>(0);
    const [questionsOffset, setQuestionsOffset] = useState<number>(0);
    const [hasMoreMeetings, setHasMoreMeetings] = useState<boolean>(true);
    const [hasMoreQuestions, setHasMoreQuestions] = useState<boolean>(true);
    const meetingsSentinelRef = useRef<HTMLDivElement | null>(null);
    const questionsSentinelRef = useRef<HTMLDivElement | null>(null);

    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
    const [totalMeetingSeconds, setTotalMeetingSeconds] = useState<number>(0);
    const [totalQuestions, setTotalQuestions] = useState<number>(0);
    const [isStatsLoading, setIsStatsLoading] = useState(true);
    const { toast } = useToast();

    const fetchSessions = useCallback(async () => {
        try {
            const [meetingsPage, questionsPage] = await Promise.all([
                getMeetingsPage({ offset: 0, limit: PAGE_SIZE }),
                getQuestionsPage({ offset: 0, limit: PAGE_SIZE }),
            ]);
            setMeetings(meetingsPage.items);
            setQuestions(questionsPage.items);
            setMeetingsOffset(meetingsPage.nextOffset ?? meetingsPage.items.length);
            setQuestionsOffset(questionsPage.nextOffset ?? questionsPage.items.length);
            setHasMoreMeetings(meetingsPage.nextOffset !== null);
            setHasMoreQuestions(questionsPage.nextOffset !== null);
        } catch (error) {
            console.error('Failed to fetch conversations:', error);
        } finally {
            setIsLoading(false);
        }
    }, []);

    const fetchStats = useCallback(async () => {
        try {
            const stats = await getConversationStats();
            setTotalMeetingSeconds(stats.totalMeetingSeconds || 0);
            setTotalQuestions(stats.totalQuestions || 0);
        } catch (error) {
            console.error('Failed to fetch stats:', error);
        } finally {
            setIsStatsLoading(false);
        }
    }, []);

    useEffect(() => {
        const loadInitialData = async () => {
            await Promise.all([fetchSessions(), fetchStats()]);
        };
        void loadInitialData();

        // Listen for session updates from other pages
        const handleSessionUpdate = () => {
            setIsStatsLoading(true);
            fetchSessions();
            fetchStats();
        };

        window.addEventListener('sessionUpdated', handleSessionUpdate);

        return () => {
            window.removeEventListener('sessionUpdated', handleSessionUpdate);
        };
    }, [fetchSessions, fetchStats]);

    const loadMoreMeetings = useCallback(async () => {
        if (isLoadingMoreMeetings || !hasMoreMeetings) return;
        setIsLoadingMoreMeetings(true);
        try {
            const page = await getMeetingsPage({ offset: meetingsOffset, limit: PAGE_SIZE });
            setMeetings(prev => [...prev, ...page.items]);
            setMeetingsOffset(page.nextOffset ?? meetingsOffset + page.items.length);
            setHasMoreMeetings(page.nextOffset !== null);
        } catch (e) {
            console.error('Failed to load more meetings', e);
        } finally {
            setIsLoadingMoreMeetings(false);
        }
    }, [isLoadingMoreMeetings, hasMoreMeetings, meetingsOffset]);

    const loadMoreQuestions = useCallback(async () => {
        if (isLoadingMoreQuestions || !hasMoreQuestions) return;
        setIsLoadingMoreQuestions(true);
        try {
            const page = await getQuestionsPage({ offset: questionsOffset, limit: PAGE_SIZE });
            setQuestions(prev => [...prev, ...page.items]);
            setQuestionsOffset(page.nextOffset ?? questionsOffset + page.items.length);
            setHasMoreQuestions(page.nextOffset !== null);
        } catch (e) {
            console.error('Failed to load more questions', e);
        } finally {
            setIsLoadingMoreQuestions(false);
        }
    }, [isLoadingMoreQuestions, hasMoreQuestions, questionsOffset]);

    // Intersection Observers for infinite scroll
    useEffect(() => {
        const sentinel = activeTab === 'meetings' ? meetingsSentinelRef.current : questionsSentinelRef.current;
        if (!sentinel) return;
        const observer = new IntersectionObserver(
            entries => {
                const first = entries[0];
                if (first?.isIntersecting) {
                    if (activeTab === 'meetings') {
                        loadMoreMeetings();
                    } else {
                        loadMoreQuestions();
                    }
                }
            },
            { root: null, rootMargin: '200px', threshold: 0 }
        );
        observer.observe(sentinel);
        return () => observer.disconnect();
    }, [activeTab, loadMoreMeetings, loadMoreQuestions]);

    const handleDelete = async (sessionId: string) => {
        setDeletingId(sessionId);
        try {
            await deleteSession(sessionId);
            // Remove from both lists
            setMeetings(meetings => meetings.filter(s => s.id !== sessionId));
            setQuestions(questions => questions.filter(s => s.id !== sessionId));

            // Refresh stats after deletion
            await fetchSessions();

            toast({ title: 'Activity deleted' });
        } catch (error) {
            toast({ title: 'Error', variant: 'destructive' });
            console.error(error);
        } finally {
            setDeletingId(null);
            setDeleteConfirmId(null);
        }
    };

    return {
        activeTab,
        setActiveTab,
        isLoading,
        isStatsLoading,
        totalMeetingSeconds,
        totalQuestions,
        meetings: { sessions: meetings, isLoadingMore: isLoadingMoreMeetings, hasMore: hasMoreMeetings, sentinelRef: meetingsSentinelRef },
        questions: { sessions: questions, isLoadingMore: isLoadingMoreQuestions, hasMore: hasMoreQuestions, sentinelRef: questionsSentinelRef },
        deletingId,
        deleteConfirmId,
        setDeleteConfirmId,
        handleDelete,
        fetchSessions,
    };
}
