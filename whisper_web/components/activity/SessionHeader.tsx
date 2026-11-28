'use client';

import { type RefObject } from 'react';
import { Calendar, Timer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { type Session } from '@/lib/api';

interface SessionHeaderProps {
    session: Session;
    editingTitle: boolean;
    savingTitle: boolean;
    deleting: boolean;
    newTitle: string;
    titleInputRef: RefObject<HTMLInputElement | null>;
    onTitleChange: (title: string) => void;
    onStartEdit: () => void;
    onSaveTitle: () => void;
    onCancelEdit: () => void;
    onDelete: () => void;
}

export function SessionHeader({
    session,
    editingTitle,
    savingTitle,
    deleting,
    newTitle,
    titleInputRef,
    onTitleChange,
    onStartEdit,
    onSaveTitle,
    onCancelEdit,
    onDelete,
}: SessionHeaderProps) {
    return (
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
            <div className="flex-1 space-y-4">
                <div>
                    {editingTitle ? (
                        <Input
                            ref={titleInputRef}
                            className="w-full border border-transparent bg-transparent p-0 text-3xl! font-semibold text-slate-900 focus-visible:outline-hidden focus-visible:ring-0"
                            value={newTitle}
                            onChange={event => onTitleChange(event.target.value)}
                            placeholder="Untitled session"
                            onKeyDown={event => {
                                if (event.key === 'Enter') onSaveTitle();
                                if (event.key === 'Escape') onCancelEdit();
                            }}
                            disabled={savingTitle}
                        />
                    ) : (
                        <h1 className="text-3xl font-semibold leading-tight text-slate-900">
                            {session.title || new Date(session.started_at * 1000).toLocaleDateString()}
                        </h1>
                    )}
                </div>

                <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
                    <span className="rounded border border-slate-200 bg-[#f2f2f2] px-3 py-1 flex items-center gap-2">
                        <Calendar className="h-3.5 w-3.5" />
                        {new Date(session.started_at * 1000).toLocaleDateString('en-US', {
                            month: 'long',
                            day: 'numeric',
                            year: 'numeric',
                        })}
                    </span>
                    <span className="rounded border border-slate-200 bg-[#f2f2f2] px-3 py-1 flex items-center gap-2">
                        <Timer className="h-3.5 w-3.5" />
                        {new Date(session.started_at * 1000).toLocaleTimeString('en-US', {
                            hour: 'numeric',
                            minute: '2-digit',
                            hour12: true,
                        })}
                    </span>
                    <span
                        className={`rounded border border-slate-200 bg-[#f2f2f2] px-3 py-1 flex items-center gap-2 ${
                            session.session_type === 'listen' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'
                        }`}
                    >
                        {session.session_type === 'listen' ? 'Meeting' : 'Question'}
                    </span>
                </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
                {editingTitle ? (
                    <>
                        <Button onClick={onSaveTitle} size="sm" disabled={savingTitle || !newTitle.trim()}>
                            {savingTitle ? 'Saving…' : 'Save'}
                        </Button>
                        <Button onClick={onCancelEdit} variant="outline" size="sm" disabled={savingTitle}>
                            Cancel
                        </Button>
                    </>
                ) : (
                    <>
                        <Button onClick={onStartEdit} variant="outline" size="sm">
                            Edit
                        </Button>
                        <Button onClick={onDelete} variant="destructive" size="sm" disabled={deleting}>
                            {deleting ? 'Deleting…' : 'Delete'}
                        </Button>
                    </>
                )}
            </div>
        </div>
    );
}
