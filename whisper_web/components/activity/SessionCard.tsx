'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { Mic, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { type Session, updateSessionTitle } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';

interface SessionCardProps {
    session: Session;
    onDelete: (id: string) => void;
    deletingId: string | null;
    onTitleUpdate?: () => void;
}

/** A button inside the card's link: it must not follow the link. */
const withoutNavigation = (action: () => void) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    action();
};

export function SessionCard({ session, onDelete, deletingId, onTitleUpdate }: SessionCardProps) {
    const { toast } = useToast();
    const typeLabel = session.session_type === 'listen' ? 'Meeting' : 'Question';
    const TypeIcon = session.session_type === 'listen' ? Mic : MessageSquare;
    const typeColor =
        session.session_type === 'listen'
            ? 'bg-blue-100 text-blue-800' // Meetings: light blue bg + dark blue text
            : 'bg-green-100 text-green-800'; // Questions: light green bg + dark green text
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
            await updateSessionTitle({ sessionId: session.id, title: t });
            setIsEditing(false);
            // Trigger parent refresh
            if (onTitleUpdate) onTitleUpdate();

            toast({ title: 'Title updated' });
        } catch (e) {
            // Revert optimistic update on error
            setOptimisticTitle(previousTitle);
            toast({ title: 'Error', variant: 'destructive' });
            console.error(e);
        } finally {
            setSaving(false);
        }
    };

    const cancelEdit = () => {
        setIsEditing(false);
        setTitle(optimisticTitle);
    };

    // Update local state when session prop changes (adjusted while rendering, not in an effect)
    const [seenTitle, setSeenTitle] = useState(session.title);
    if (seenTitle !== session.title) {
        setSeenTitle(session.title);
        setOptimisticTitle(session.title || '');
        setTitle(session.title || '');
    }

    // Focus input when entering edit mode
    useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isEditing]);

    return (
        <Link
            href={`/activity/details?sessionId=${session.id}`}
            className="relative block bg-white p-6 shadow-xs border border-gray-200 hover:bg-gray-50 transition-colors cursor-pointer group"
        >
            <div className="flex justify-between items-start mb-3">
                <div className="min-w-0 flex-1">
                    <div className="flex justify-between items-start">
                        <div className="flex-1 min-w-0">
                            {isEditing ? (
                                <Input
                                    ref={inputRef}
                                    className="w-full bg-transparent border border-transparent p-0 h-auto text-lg font-medium text-gray-900 hover:underline truncate block focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-hidden md:text-lg"
                                    value={title}
                                    onChange={e => setTitle(e.target.value)}
                                    placeholder="Enter title..."
                                    onKeyDown={e => {
                                        if (e.key === 'Enter') save();
                                        if (e.key === 'Escape') cancelEdit();
                                    }}
                                    onClick={e => e.preventDefault()}
                                />
                            ) : (
                                <div className="text-lg font-medium text-gray-900 hover:underline truncate block">
                                    {optimisticTitle || `${typeLabel} - ${new Date(session.started_at * 1000).toLocaleDateString()}`}
                                </div>
                            )}
                        </div>
                        <div className="flex items-center gap-2 ml-4 shrink-0">
                            {isEditing ? (
                                <>
                                    <Button onClick={withoutNavigation(save)} size="sm" disabled={saving || !title.trim()}>
                                        {saving ? 'Saving...' : 'Save'}
                                    </Button>
                                    <Button onClick={withoutNavigation(cancelEdit)} variant="outline" size="sm" disabled={saving}>
                                        Cancel
                                    </Button>
                                </>
                            ) : (
                                <>
                                    <Button onClick={withoutNavigation(() => setIsEditing(true))} variant="outline" size="sm" disabled={saving}>
                                        Edit
                                    </Button>
                                    <Button
                                        onClick={withoutNavigation(() => onDelete(session.id))}
                                        variant="destructive"
                                        size="sm"
                                        disabled={deletingId === session.id}
                                    >
                                        {deletingId === session.id ? 'Deleting...' : 'Delete'}
                                    </Button>
                                </>
                            )}
                        </div>
                    </div>
                    <div className="text-sm text-gray-500">{new Date(session.started_at * 1000).toLocaleString()}</div>
                </div>
            </div>
            <span className={`capitalize inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${typeColor}`}>
                <TypeIcon className="h-3 w-3" />
                {typeLabel}
            </span>
        </Link>
    );
}
