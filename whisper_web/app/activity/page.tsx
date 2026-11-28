'use client';

import { useRedirectIfNotAuth } from '@/lib/auth';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { type UserProfile } from '@/lib/api';
import { Loader2 } from 'lucide-react';
import { SessionList, type ActivityTab } from '@/components/activity/SessionList';
import { StatsCards } from '@/components/activity/StatsCards';
import { useActivitySessions } from '@/components/activity/useActivitySessions';

const TABS = [
    { id: 'meetings', label: 'Meetings' },
    { id: 'questions', label: 'Questions' },
] satisfies { id: ActivityTab; label: string }[];

const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
};

export default function ActivityPage() {
    const userInfo = useRedirectIfNotAuth();
    // A new user remounts the page, so nothing from the previous user is kept and everything is fetched again.
    return <ActivityContent key={userInfo?.uid ?? ''} userInfo={userInfo} />;
}

function ActivityContent({ userInfo }: { userInfo: UserProfile | null }) {
    const activity = useActivitySessions();
    const { activeTab, deletingId, deleteConfirmId } = activity;

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

    const list = activity[activeTab];

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="max-w-4xl mx-auto px-8 py-12">
                <div className="text-center mb-12">
                    <h1 className="text-2xl text-gray-600">
                        {getGreeting()}, {userInfo.display_name}
                    </h1>
                </div>
                <StatsCards
                    isLoading={activity.isStatsLoading}
                    totalMeetingSeconds={activity.totalMeetingSeconds}
                    totalQuestions={activity.totalQuestions}
                />
                <div>
                    <h2 className="text-2xl font-semibold text-gray-900 mb-8 text-center">Your Past Activity</h2>

                    <div className="flex justify-center mb-8">
                        <div className="bg-gray-100 p-1 rounded-lg">
                            {TABS.map(tab => (
                                <button
                                    key={tab.id}
                                    onClick={() => activity.setActiveTab(tab.id)}
                                    className={`px-6 py-2 rounded-md font-medium transition-colors ${
                                        activeTab === tab.id ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-600 hover:text-gray-900'
                                    }`}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {activity.isLoading ? (
                        <div className="flex flex-col items-center justify-center py-16">
                            <Loader2 className="h-8 w-8 text-gray-400 animate-spin mb-4" />
                            <p className="text-gray-600">Loading your activity...</p>
                        </div>
                    ) : (
                        <div>
                            <SessionList
                                type={activeTab}
                                sessions={list.sessions}
                                isLoadingMore={list.isLoadingMore}
                                hasMore={list.hasMore}
                                sentinelRef={list.sentinelRef}
                                deletingId={deletingId}
                                onDelete={activity.setDeleteConfirmId}
                                onTitleUpdate={activity.fetchSessions}
                            />
                        </div>
                    )}
                </div>
            </div>

            <ConfirmDialog
                open={!!deleteConfirmId}
                onOpenChange={open => activity.setDeleteConfirmId(open ? deleteConfirmId : null)}
                title="Delete"
                description="Are you sure you want to delete this activity? This cannot be undone."
                confirmLabel={deletingId && deleteConfirmId === deletingId ? 'Deleting...' : 'Delete'}
                cancelLabel="Cancel"
                variant="destructive"
                loading={!!deletingId && deleteConfirmId === deletingId}
                onConfirm={() => {
                    if (deleteConfirmId) void activity.handleDelete(deleteConfirmId);
                }}
            />
        </div>
    );
}
