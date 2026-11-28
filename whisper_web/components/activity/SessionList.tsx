'use client';

import { type RefObject } from 'react';
import { Loader2 } from 'lucide-react';
import { type Session } from '@/lib/api';
import { SessionCard } from './SessionCard';

export type ActivityTab = 'meetings' | 'questions';

const EMPTY_STATES = {
    meetings: {
        title: 'No meetings yet',
        description: 'Start a meeting in the desktop app using the Listen feature to see your meeting transcripts and summaries here.',
    },
    questions: {
        title: 'No questions yet',
        description: 'Ask questions in the desktop app to see your Q&A history here.',
    },
} satisfies Record<ActivityTab, { title: string; description: string }>;

function EmptyState({ type }: { type: ActivityTab }) {
    const content = EMPTY_STATES[type];

    return (
        <div className="text-center bg-white rounded-lg p-12">
            <h3 className="text-2xl font-semibold text-gray-900 mb-3">{content.title}</h3>
            <p className="text-gray-500">{content.description}</p>
        </div>
    );
}

interface SessionListProps {
    type: ActivityTab;
    sessions: Session[];
    isLoadingMore: boolean;
    hasMore: boolean;
    sentinelRef: RefObject<HTMLDivElement | null>;
    deletingId: string | null;
    onDelete: (id: string) => void;
    onTitleUpdate: () => void;
}

export function SessionList({ type, sessions, isLoadingMore, hasMore, sentinelRef, deletingId, onDelete, onTitleUpdate }: SessionListProps) {
    if (sessions.length === 0) return <EmptyState type={type} />;

    return (
        <div className="space-y-4">
            {sessions.map(session => (
                <SessionCard key={session.id} session={session} onDelete={onDelete} deletingId={deletingId} onTitleUpdate={onTitleUpdate} />
            ))}
            {isLoadingMore && (
                <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 text-gray-400 animate-spin" />
                </div>
            )}
            {hasMore ? (
                <div data-testid={`${type}-sentinel`} ref={sentinelRef} />
            ) : (
                <div className="text-center py-8 text-gray-500 text-sm">End.</div>
            )}
        </div>
    );
}
