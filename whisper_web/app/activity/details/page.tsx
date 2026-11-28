'use client';

import { useState, useEffect, useRef, Suspense, useMemo } from 'react';
import { useRedirectIfNotAuth } from '@/lib/auth';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { type SessionDetails, getSessionDetails, deleteSession, updateSessionTitle } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { TranscriptViewer } from '@/components/activity/TranscriptViewer';
import { TranscriptSidebar } from '@/components/activity/TranscriptSidebar';
import { SessionHeader } from '@/components/activity/SessionHeader';
import { SessionSummary } from '@/components/activity/SessionSummary';
import { QaList } from '@/components/activity/QaList';

function LoadingScreen({ background }: { background: string }) {
    return (
        <div className={`min-h-screen ${background} flex items-center justify-center`}>
            <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-600 mx-auto"></div>
                <p className="mt-4 text-gray-600">Loading...</p>
            </div>
        </div>
    );
}

function SessionNotFound() {
    return (
        <div className="min-h-screen bg-[#F4F5FA] flex items-center justify-center">
            <div className="max-w-xl rounded-3xl border border-slate-200/60 bg-white/90 px-8 py-10 text-center shadow-[0_30px_90px_-50px_rgba(15,23,42,0.45)] backdrop-blur-xl animate-in fade-in slide-in-from-bottom-4 duration-500">
                <h2 className="text-xl font-semibold text-slate-900">Session not found</h2>
                <p className="mt-3 text-sm text-slate-500">We couldn’t locate that session, it may have been removed.</p>
                <Link href="/activity" className="mt-6 inline-block text-sm font-medium text-[#3146FF] hover:text-[#1F2CF3]">
                    Return to activity
                </Link>
            </div>
        </div>
    );
}

function SessionDetailsContent() {
    const userInfo = useRedirectIfNotAuth();
    const [sessionDetails, setSessionDetails] = useState<SessionDetails | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const searchParams = useSearchParams();
    const sessionId = searchParams.get('sessionId');
    const router = useRouter();
    const [deleting, setDeleting] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [editingTitle, setEditingTitle] = useState(false);
    const [savingTitle, setSavingTitle] = useState(false);
    const [newTitle, setNewTitle] = useState('');
    const [copiedMessages, setCopiedMessages] = useState<Set<string>>(new Set());
    const [showTranscriptSidebar, setShowTranscriptSidebar] = useState(false);
    const titleInputRef = useRef<HTMLInputElement>(null);
    const { toast } = useToast();

    useEffect(() => {
        if (userInfo && sessionId) {
            const fetchDetails = async () => {
                setIsLoading(true);
                try {
                    const details = await getSessionDetails(sessionId);
                    setSessionDetails(details);
                    setNewTitle(details.session.title || '');
                } catch (error) {
                    console.error('Failed to load session details:', error);
                } finally {
                    setIsLoading(false);
                }
            };
            fetchDetails();
        }
    }, [userInfo, sessionId]);

    useEffect(() => {
        if (editingTitle && titleInputRef.current) {
            titleInputRef.current.focus();
            // Put cursor at the end of the text
            const input = titleInputRef.current;
            const len = input.value.length;
            input.setSelectionRange(len, len);
        }
    }, [editingTitle]);

    const handleDelete = async () => {
        if (!sessionId) return;
        setDeleting(true);
        try {
            await deleteSession(sessionId);
            toast({ title: 'Activity deleted' });
            router.push('/activity');
        } catch (error) {
            toast({ title: 'Error', variant: 'destructive' });
            setDeleting(false);
            console.error(error);
        }
    };

    const handleSaveTitle = async () => {
        if (!sessionId || savingTitle) return;
        const t = (newTitle || '').trim();
        if (!t) return;

        setSavingTitle(true);
        try {
            await updateSessionTitle({ sessionId, title: t });
            setSessionDetails(prev => (prev ? { ...prev, session: { ...prev.session, title: t } } : prev));
            setEditingTitle(false);
            window.dispatchEvent(new CustomEvent('sessionUpdated', { detail: { sessionId, title: t } }));
            toast({ title: 'Title updated' });
        } catch (e) {
            toast({ title: 'Error', variant: 'destructive' });
            console.error(e);
        } finally {
            setSavingTitle(false);
        }
    };

    const handleCancelEdit = () => {
        setEditingTitle(false);
        setNewTitle(sessionDetails?.session.title || '');
    };

    const handleCopyToClipboard = async ({ text, messageId }: { text: string; messageId: string }) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopiedMessages(prev => new Set(prev).add(messageId));

            setTimeout(() => {
                setCopiedMessages(prev => {
                    const newSet = new Set(prev);
                    newSet.delete(messageId);
                    return newSet;
                });
            }, 2000);

            toast({ title: 'Copied to clipboard' });
        } catch (error) {
            toast({ title: 'Error', variant: 'destructive' });
            console.error(error);
        }
    };

    const askMessages = useMemo(() => sessionDetails?.ai_messages ?? [], [sessionDetails?.ai_messages]);
    const transcripts = useMemo(() => sessionDetails?.transcripts ?? [], [sessionDetails?.transcripts]);
    const userAskMessages = useMemo(() => askMessages.filter(message => message.role === 'user'), [askMessages]);

    if (!userInfo || isLoading) {
        return <LoadingScreen background="bg-gray-50" />;
    }

    if (!sessionDetails) {
        return <SessionNotFound />;
    }

    const isMeeting = sessionDetails.session.session_type === 'listen';
    // A session that has not ended is still running.
    const isActiveSession = !sessionDetails.session.ended_at;

    return (
        <>
            <div className="min-h-screen bg-linear-to-br from-slate-50 via-blue-50/30 to-slate-100 text-slate-900">
                <div className="mx-auto flex max-w-4xl flex-col gap-10 px-6 pb-16 pt-8">
                    <section className="rounded-lg border border-slate-200 bg-white px-6 py-6">
                        <div className="space-y-8">
                            <SessionHeader
                                session={sessionDetails.session}
                                editingTitle={editingTitle}
                                savingTitle={savingTitle}
                                deleting={deleting}
                                newTitle={newTitle}
                                titleInputRef={titleInputRef}
                                onTitleChange={setNewTitle}
                                onStartEdit={() => setEditingTitle(true)}
                                onSaveTitle={handleSaveTitle}
                                onCancelEdit={handleCancelEdit}
                                onDelete={() => setShowDeleteConfirm(true)}
                            />

                            {isMeeting && (transcripts.length > 0 || askMessages.length > 0) && (
                                <div>
                                    <TranscriptViewer
                                        onClick={() => setShowTranscriptSidebar(true)}
                                        transcriptCount={transcripts.length}
                                        messageCount={userAskMessages.length}
                                    />
                                </div>
                            )}

                            {isMeeting && (
                                <SessionSummary
                                    isActiveSession={isActiveSession}
                                    insights={sessionDetails.insights}
                                    summary={sessionDetails.summary}
                                />
                            )}

                            {askMessages.length > 0 && (
                                <QaList messages={askMessages} copiedMessages={copiedMessages} onCopy={handleCopyToClipboard} />
                            )}
                        </div>
                    </section>
                </div>
            </div>

            <TranscriptSidebar
                isOpen={showTranscriptSidebar}
                onClose={() => setShowTranscriptSidebar(false)}
                transcripts={transcripts}
                aiMessages={askMessages}
            />

            <ConfirmDialog
                open={showDeleteConfirm}
                onOpenChange={setShowDeleteConfirm}
                title="Delete"
                description="Are you sure you want to delete this activity? This cannot be undone."
                confirmLabel={deleting ? 'Deleting...' : 'Delete'}
                cancelLabel="Cancel"
                variant="destructive"
                loading={deleting}
                onConfirm={() => {
                    void handleDelete();
                    setShowDeleteConfirm(false);
                }}
            />
        </>
    );
}

export default function SessionDetailsPage() {
    return (
        <Suspense fallback={<LoadingScreen background="bg-[#FDFCF9]" />}>
            <SessionDetailsContent />
        </Suspense>
    );
}
