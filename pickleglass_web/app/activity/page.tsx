'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useRedirectIfNotAuth } from '@/utils/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { UserProfile, Session, deleteSession, getConversationStats, updateSessionTitle, getMeetingsPage, getQuestionsPage } from '@/utils/api';
import { Loader2 } from 'lucide-react';

export default function ActivityPage() {
    const userInfo = useRedirectIfNotAuth() as UserProfile | null;
    const [sessions, setSessions] = useState<Session[]>([]);
    const [meetings, setMeetings] = useState<Session[]>([]);
    const [questions, setQuestions] = useState<Session[]>([]);
    const [activeTab, setActiveTab] = useState<'meetings' | 'questions'>('meetings');
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
    const [totalMeetingSeconds, setTotalMeetingSeconds] = useState<number>(0);
    const [totalQuestions, setTotalQuestions] = useState<number>(0);
    const [isStatsLoading, setIsStatsLoading] = useState(true);

    const PAGE_SIZE = 10;

    const fetchSessions = async () => {
        try {
            const [meetingsPage, questionsPage] = await Promise.all([getMeetingsPage(0, PAGE_SIZE), getQuestionsPage(0, PAGE_SIZE)]);
            setMeetings(meetingsPage.items);
            setQuestions(questionsPage.items);
            setSessions([...meetingsPage.items, ...questionsPage.items]);
            setMeetingsOffset(meetingsPage.nextOffset ?? meetingsPage.items.length);
            setQuestionsOffset(questionsPage.nextOffset ?? questionsPage.items.length);
            setHasMoreMeetings(meetingsPage.nextOffset !== null);
            setHasMoreQuestions(questionsPage.nextOffset !== null);
        } catch (error) {
            console.error('Failed to fetch conversations:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const fetchStats = async () => {
        try {
            setIsStatsLoading(true);
            const stats = await getConversationStats();
            setTotalMeetingSeconds(stats.totalMeetingSeconds || 0);
            setTotalQuestions(stats.totalQuestions || 0);
        } catch (error) {
            console.error('Failed to fetch stats:', error);
        } finally {
            setIsStatsLoading(false);
        }
    };

    useEffect(() => {
        fetchSessions();
        fetchStats();

        // Listen for session updates from other pages
        const handleSessionUpdate = () => {
            fetchSessions();
            fetchStats();
        };

        window.addEventListener('sessionUpdated', handleSessionUpdate);

        return () => {
            window.removeEventListener('sessionUpdated', handleSessionUpdate);
        };
    }, []);

    const loadMoreMeetings = useCallback(async () => {
        if (isLoadingMoreMeetings || !hasMoreMeetings) return;
        setIsLoadingMoreMeetings(true);
        try {
            const page = await getMeetingsPage(meetingsOffset, PAGE_SIZE);
            setMeetings(prev => [...prev, ...page.items]);
            setSessions(prev => [...prev, ...page.items]);
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
            const page = await getQuestionsPage(questionsOffset, PAGE_SIZE);
            setQuestions(prev => [...prev, ...page.items]);
            setSessions(prev => [...prev, ...page.items]);
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
                if (first.isIntersecting) {
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

    if (!userInfo) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-600 mx-auto"></div>
                    <p className="mt-4 text-gray-600">Loading...</p>
                </div>
            </div>
        );
    }

    const getGreeting = () => {
        const hour = new Date().getHours();
        if (hour < 12) return 'Good morning';
        if (hour < 18) return 'Good afternoon';
        return 'Good evening';
    };

    const handleDelete = async (sessionId: string) => {
        if (!window.confirm('Are you sure you want to delete this activity? This cannot be undone.')) return;
        setDeletingId(sessionId);
        try {
            await deleteSession(sessionId);
            // Remove from both state arrays
            setMeetings(meetings => meetings.filter(s => s.id !== sessionId));
            setQuestions(questions => questions.filter(s => s.id !== sessionId));
            setSessions(sessions => sessions.filter(s => s.id !== sessionId));

            // Refresh stats after deletion
            await fetchSessions();
        } catch (error) {
            alert('Failed to delete activity.');
            console.error(error);
        } finally {
            setDeletingId(null);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="max-w-4xl mx-auto px-8 py-12">
                <div className="text-center mb-12">
                    <h1 className="text-2xl text-gray-600">
                        {getGreeting()}, {userInfo.display_name}
                    </h1>
                </div>
                {/* Quick stats */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10">
                    {isStatsLoading ? (
                        <>
                            <SkeletonStatsCard />
                            <SkeletonStatsCard />
                        </>
                    ) : (
                        <>
                            <div className="bg-white rounded-lg p-5 border border-gray-200">
                                <div className="text-sm text-gray-500 mb-1">Total time in meetings</div>
                                <div className="text-2xl font-semibold text-gray-900">{formatDuration(totalMeetingSeconds)}</div>
                            </div>
                            <div className="bg-white rounded-lg p-5 border border-gray-200">
                                <div className="text-sm text-gray-500 mb-1">Total questions</div>
                                <div className="text-2xl font-semibold text-gray-900">{totalQuestions}</div>
                            </div>
                        </>
                    )}
                </div>
                <div>
                    <h2 className="text-2xl font-semibold text-gray-900 mb-8 text-center">Your Past Activity</h2>

                    {/* Tab Navigation */}
                    <div className="flex justify-center mb-8">
                        <div className="bg-gray-100 p-1 rounded-lg">
                            <button
                                onClick={() => setActiveTab('meetings')}
                                className={`px-6 py-2 rounded-md font-medium transition-colors ${
                                    activeTab === 'meetings' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                                }`}
                            >
                                Meetings
                            </button>
                            <button
                                onClick={() => setActiveTab('questions')}
                                className={`px-6 py-2 rounded-md font-medium transition-colors ${
                                    activeTab === 'questions' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                                }`}
                            >
                                Questions
                            </button>
                        </div>
                    </div>

                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center py-16">
                            <Loader2 className="h-8 w-8 text-gray-400 animate-spin mb-4" />
                            <p className="text-gray-600">Loading your activity...</p>
                        </div>
                    ) : (
                        <div>
                            {activeTab === 'meetings' ? (
                                meetings.length > 0 ? (
                                    <div className="space-y-4">
                                        {meetings.map(session => (
                                            <SessionCard
                                                key={session.id}
                                                session={session}
                                                onDelete={handleDelete}
                                                deletingId={deletingId}
                                                onTitleUpdate={fetchSessions}
                                            />
                                        ))}
                                        {isLoadingMoreMeetings && (
                                            <div className="flex justify-center py-8">
                                                <Loader2 className="h-6 w-6 text-gray-400 animate-spin" />
                                            </div>
                                        )}
                                        {hasMoreMeetings ? (
                                            <div ref={meetingsSentinelRef} />
                                        ) : (
                                            <div className="text-center py-8 text-gray-500 text-sm">End.</div>
                                        )}
                                    </div>
                                ) : (
                                    <EmptyState type="meetings" />
                                )
                            ) : questions.length > 0 ? (
                                <div className="space-y-4">
                                    {questions.map(session => (
                                        <SessionCard
                                            key={session.id}
                                            session={session}
                                            onDelete={handleDelete}
                                            deletingId={deletingId}
                                            onTitleUpdate={fetchSessions}
                                        />
                                    ))}
                                    {isLoadingMoreQuestions && (
                                        <div className="flex justify-center py-8">
                                            <Loader2 className="h-6 w-6 text-gray-400 animate-spin" />
                                        </div>
                                    )}
                                    {hasMoreQuestions ? (
                                        <div ref={questionsSentinelRef} />
                                    ) : (
                                        <div className="text-center py-8 text-gray-500 text-sm">End.</div>
                                    )}
                                </div>
                            ) : (
                                <EmptyState type="questions" />
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// Helper components
function SessionCard({
    session,
    onDelete,
    deletingId,
    onTitleUpdate,
}: {
    session: Session;
    onDelete: (id: string) => void;
    deletingId: string | null;
    onTitleUpdate?: () => void;
}) {
    const typeLabel = session.session_type === 'listen' ? 'Meeting' : 'Question';
    const typeColor = session.session_type === 'listen' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800';
    const [isEditing, setIsEditing] = useState(false);
    const [title, setTitle] = useState(session.title || '');
    const [saving, setSaving] = useState(false);
    const [optimisticTitle, setOptimisticTitle] = useState(session.title || '');
    const inputRef = useRef<HTMLInputElement | null>(null);

    const save = async () => {
        const t = (title || '').trim();
        if (!t || saving) return;

        const previousTitle = optimisticTitle;
        setOptimisticTitle(t); // Optimistic update
        setSaving(true);

        try {
            await updateSessionTitle(session.id, t);
            setIsEditing(false);
            // Trigger parent refresh
            if (onTitleUpdate) onTitleUpdate();
        } catch (e) {
            // Revert optimistic update on error
            setOptimisticTitle(previousTitle);
            alert('Failed to save');
            console.error(e);
        } finally {
            setSaving(false);
        }
    };

    const cancelEdit = () => {
        setIsEditing(false);
        setTitle(optimisticTitle);
    };

    // Update local state when session prop changes
    useEffect(() => {
        setOptimisticTitle(session.title || '');
        setTitle(session.title || '');
    }, [session.title]);

    // Focus input when entering edit mode
    useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isEditing]);

    return (
        <div className="block bg-white rounded-lg p-6 shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start mb-3">
                <div className="min-w-0 flex-1">
                    <div className="relative">
                        {isEditing ? (
                            <Input
                                ref={inputRef}
                                className="w-full bg-transparent border border-transparent p-0 h-auto text-lg font-medium focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-none"
                                value={title}
                                onChange={e => setTitle(e.target.value)}
                                placeholder="Enter title..."
                                onKeyDown={e => {
                                    if (e.key === 'Enter') save();
                                    if (e.key === 'Escape') cancelEdit();
                                }}
                            />
                        ) : (
                            <Link
                                href={`/activity/details?sessionId=${session.id}`}
                                className="text-lg font-medium text-gray-900 hover:underline truncate block"
                            >
                                {optimisticTitle || `${typeLabel} - ${new Date(session.started_at * 1000).toLocaleDateString()}`}
                            </Link>
                        )}
                        {isEditing && (
                            <div className="absolute right-0 top-0 flex items-center gap-2">
                                <Button onClick={save} size="sm" disabled={saving || !title.trim()}>
                                    {saving ? 'Saving...' : 'Save'}
                                </Button>
                                <Button onClick={cancelEdit} variant="outline" size="sm" disabled={saving}>
                                    Cancel
                                </Button>
                            </div>
                        )}
                    </div>
                    <div className="text-sm text-gray-500">{new Date(session.started_at * 1000).toLocaleString()}</div>
                </div>
                {!isEditing && (
                    <div className="flex items-center gap-2 ml-4 shrink-0">
                        <Button onClick={() => setIsEditing(true)} variant="outline" size="sm" disabled={saving}>
                            Edit
                        </Button>
                        <Button onClick={() => onDelete(session.id)} variant="destructive" size="sm" disabled={deletingId === session.id}>
                            {deletingId === session.id ? 'Deleting...' : 'Delete'}
                        </Button>
                    </div>
                )}
            </div>
            <span className={`capitalize inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${typeColor}`}>{typeLabel}</span>
        </div>
    );
}

function EmptyState({ type }: { type: 'meetings' | 'questions' }) {
    const content =
        type === 'meetings'
            ? {
                  title: 'No meetings yet',
                  description: 'Start a meeting in the desktop app using the Listen feature to see your meeting transcripts and summaries here.',
                  tip: '💡 Tip: Click the Listen button in the desktop app during a meeting to automatically capture and summarize conversations.',
              }
            : {
                  title: 'No questions yet',
                  description: 'Ask questions in the desktop app to see your Q&A history here.',
                  tip: '💡 Tip: Use the Ask feature in the desktop app to get AI-powered answers to your questions.',
              };

    return (
        <div className="text-center bg-white rounded-lg p-12">
            <p className="text-gray-500 mb-4">{content.description}</p>
            <div className="text-sm text-gray-400">{content.tip}</div>
        </div>
    );
}

// utils
function formatDuration(totalSeconds: number) {
    if (!totalSeconds || totalSeconds <= 0) return '0h 00m';
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    return `${hours}h ${String(minutes).padStart(2, '0')}m`;
}

function SkeletonStatsCard() {
    return (
        <div className="bg-white rounded-lg p-5 border border-gray-200 animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-1/2 mb-2" />
            <div className="h-8 bg-gray-100 rounded w-1/3" />
        </div>
    );
}

function SkeletonSessionCard() {
    return (
        <div className="bg-white rounded-lg p-6 border border-gray-200 shadow-sm animate-pulse">
            <div className="flex justify-between items-start mb-3">
                <div className="min-w-0 flex-1">
                    <div className="h-5 bg-gray-200 rounded w-2/3 mb-2" />
                    <div className="h-4 bg-gray-100 rounded w-1/3" />
                </div>
                <div className="flex items-center gap-2 ml-4 shrink-0">
                    <div className="h-8 w-16 bg-gray-100 rounded" />
                    <div className="h-8 w-16 bg-gray-100 rounded" />
                </div>
            </div>
            <div className="h-5 w-20 bg-gray-100 rounded" />
        </div>
    );
}
