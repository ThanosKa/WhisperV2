'use client';

import { useState, useEffect, useRef, Suspense, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { useRedirectIfNotAuth } from '@/utils/auth';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { UserProfile, SessionDetails, getSessionDetails, deleteSession, updateSessionTitle } from '@/utils/api';
import { useToast } from '@/hooks/use-toast';
import dynamic from 'next/dynamic';
import { Sparkles, Copy, Check, Calendar, Timer } from 'lucide-react';
import { TranscriptViewer } from '@/components/activity/TranscriptViewer';
import { TranscriptSidebar } from '@/components/activity/TranscriptSidebar';

const Markdown = dynamic(() => import('@/components/Markdown'), { ssr: false });

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <section className="mb-8 rounded-lg border border-slate-200 bg-white px-6 py-5">
        <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-medium text-slate-900">{title}</h2>
        </div>
        <div className="text-slate-600 space-y-4 text-sm leading-relaxed">{children}</div>
    </section>
);

function SessionDetailsContent() {
    const userInfo = useRedirectIfNotAuth() as UserProfile | null;
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
                    const details = await getSessionDetails(sessionId as string);
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
            toast({
                title: 'Activity deleted',
            });
            router.push('/activity');
        } catch (error) {
            toast({
                title: 'Error',
                variant: 'destructive',
            });
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
            await updateSessionTitle(sessionId, t);
            setSessionDetails(prev => (prev ? { ...prev, session: { ...prev.session, title: t } } : prev));
            setEditingTitle(false);

            window.dispatchEvent(
                new CustomEvent('sessionUpdated', {
                    detail: { sessionId, title: t },
                })
            );

            toast({
                title: 'Title updated',
            });
        } catch (e) {
            toast({
                title: 'Error',
                variant: 'destructive',
            });
            console.error(e);
        } finally {
            setSavingTitle(false);
        }
    };

    const handleCancelEdit = () => {
        setEditingTitle(false);
        setNewTitle(sessionDetails?.session.title || '');
    };

    const handleCopyToClipboard = async (text: string, messageId: string) => {
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

            toast({
                title: 'Copied to clipboard',
            });
        } catch (error) {
            toast({
                title: 'Error',
                variant: 'destructive',
            });
            console.error(error);
        }
    };

    const askMessages = sessionDetails?.ai_messages ?? [];
    const transcripts = sessionDetails?.transcripts ?? [];
    const userAskMessages = useMemo(() => askMessages.filter(message => message.role === 'user'), [askMessages]);
    
    // Check if session is active (not finished)
    const isActiveSession = sessionDetails?.session && !sessionDetails.session.ended_at;
    
    // Flatten insights for active sessions (like desktop SummaryView does)
    const flattenedInsights = useMemo(() => {
        if (!isActiveSession || !sessionDetails?.insights || sessionDetails.insights.length === 0) {
            return null;
        }
        
        const actions = new Set<string>();
        const summaryBullets = new Set<string>();
        
        sessionDetails.insights.forEach(insight => {
            if (insight.payload?.actions && Array.isArray(insight.payload.actions)) {
                insight.payload.actions.forEach((action: string) => actions.add(action));
            }
            if (insight.payload?.summary && Array.isArray(insight.payload.summary)) {
                insight.payload.summary.forEach((bullet: string) => summaryBullets.add(bullet));
            }
        });
        
        return {
            actions: Array.from(actions).reverse(),
            summary: Array.from(summaryBullets).reverse(),
        };
    }, [isActiveSession, sessionDetails?.insights]);

    if (!userInfo || isLoading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-600 mx-auto"></div>
                    <p className="mt-4 text-gray-600">Loading...</p>
                </div>
            </div>
        );
    }

    if (!sessionDetails) {
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

    return (
        <>
            <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-100 text-slate-900">
                <div className="mx-auto flex max-w-4xl flex-col gap-10 px-6 pb-16 pt-8">
                    <section className="rounded-lg border border-slate-200 bg-white px-6 py-6">
                        <div className="space-y-8">
                            {/* Session Header */}
                            <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
                                <div className="flex-1 space-y-4">
                                    <div>
                                        {editingTitle ? (
                                            <Input
                                                ref={titleInputRef}
                                                className="w-full border border-transparent bg-transparent p-0 !text-3xl font-semibold text-slate-900 focus-visible:outline-none focus-visible:ring-0"
                                                value={newTitle}
                                                onChange={event => setNewTitle(event.target.value)}
                                                placeholder="Untitled session"
                                                onKeyDown={event => {
                                                    if (event.key === 'Enter') handleSaveTitle();
                                                    if (event.key === 'Escape') handleCancelEdit();
                                                }}
                                                disabled={savingTitle}
                                            />
                                        ) : (
                                            <h1 className="text-3xl font-semibold leading-tight text-slate-900">
                                                {sessionDetails.session.title ||
                                                    new Date(sessionDetails.session.started_at * 1000).toLocaleDateString()}
                                            </h1>
                                        )}
                                    </div>

                                    <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
                                        <span className="rounded border border-slate-200 bg-[#f2f2f2] px-3 py-1 flex items-center gap-2">
                                            <Calendar className="h-3.5 w-3.5" />
                                            {new Date(sessionDetails.session.started_at * 1000).toLocaleDateString('en-US', {
                                                month: 'long',
                                                day: 'numeric',
                                                year: 'numeric',
                                            })}
                                        </span>
                                        <span className="rounded border border-slate-200 bg-[#f2f2f2] px-3 py-1 flex items-center gap-2">
                                            <Timer className="h-3.5 w-3.5" />
                                            {new Date(sessionDetails.session.started_at * 1000).toLocaleTimeString('en-US', {
                                                hour: 'numeric',
                                                minute: '2-digit',
                                                hour12: true,
                                            })}
                                        </span>
                                        <span
                                            className={`rounded border border-slate-200 bg-[#f2f2f2] px-3 py-1 flex items-center gap-2 ${
                                                sessionDetails.session.session_type === 'listen'
                                                    ? 'bg-blue-100 text-blue-800'
                                                    : 'bg-green-100 text-green-800'
                                            }`}
                                        >
                                            {sessionDetails.session.session_type === 'listen' ? 'Meeting' : 'Question'}
                                        </span>
                                    </div>
                                </div>

                                <div className="flex shrink-0 items-center gap-2">
                                    {editingTitle ? (
                                        <>
                                            <Button onClick={handleSaveTitle} size="sm" disabled={savingTitle || !newTitle.trim()}>
                                                {savingTitle ? 'Saving…' : 'Save'}
                                            </Button>
                                            <Button onClick={handleCancelEdit} variant="outline" size="sm" disabled={savingTitle}>
                                                Cancel
                                            </Button>
                                        </>
                                    ) : (
                                        <>
                                            <Button onClick={() => setEditingTitle(true)} variant="outline" size="sm">
                                                Edit
                                            </Button>
                                            <Button onClick={() => setShowDeleteConfirm(true)} variant="destructive" size="sm" disabled={deleting}>
                                                {deleting ? 'Deleting…' : 'Delete'}
                                            </Button>
                                        </>
                                    )}
                                </div>
                            </div>

                            {/* Transcript Viewer - Only for meetings */}
                            {sessionDetails.session.session_type === 'listen' && (transcripts.length > 0 || askMessages.length > 0) && (
                                <div>
                                    <TranscriptViewer
                                        onClick={() => setShowTranscriptSidebar(true)}
                                        transcriptCount={transcripts.length}
                                        messageCount={userAskMessages.length}
                                    />
                                </div>
                            )}

                            {/* Summary Section - Only for meetings */}
                            {sessionDetails.session.session_type === 'listen' && (
                                <div className="border-t border-slate-200 pt-6">
                                    <h2 className="text-lg font-medium text-slate-900 mb-4">Summary</h2>
                                    
                                    {/* Active session: show insights or placeholder */}
                                    {isActiveSession ? (
                                        flattenedInsights ? (
                                            <>
                                                {flattenedInsights.summary.length > 0 && (
                                                    <div className="mb-6">
                                                        <h3 className="text-sm font-semibold text-slate-900 mb-3">Key points</h3>
                                                        <ul className="my-4 ml-6 list-disc space-y-2 text-slate-900">
                                                            {flattenedInsights.summary.map((point: string, index: number) => (
                                                                <li key={index} className="leading-6">
                                                                    {point}
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                )}
                                                
                                                {flattenedInsights.actions.length > 0 && (
                                                    <div>
                                                        <h3 className="text-sm font-semibold text-slate-900 mb-3">Action items</h3>
                                                        <ul className="my-4 ml-6 list-disc space-y-2 text-slate-900">
                                                            {flattenedInsights.actions.map((action: string, index: number) => (
                                                                <li key={index} className="leading-6">
                                                                    {action}
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                )}
                                            </>
                                        ) : (
                                            <p className="text-slate-500 italic">Summary will appear here once the session is complete.</p>
                                        )
                                    ) : (
                                        /* Finished session: show final summary */
                                        sessionDetails.summary && (
                                            <>
                                                <p className="leading-7 text-slate-900 mb-6">{sessionDetails.summary.tldr}</p>

                                                {sessionDetails.summary.bullet_json && JSON.parse(sessionDetails.summary.bullet_json).length > 0 && (
                                                    <div className="mb-6">
                                                        <h3 className="text-sm font-semibold text-slate-900 mb-3">Key points</h3>
                                                        <ul className="my-4 ml-6 list-disc space-y-2 text-slate-900">
                                                            {JSON.parse(sessionDetails.summary.bullet_json).map((point: string, index: number) => (
                                                                <li key={index} className="leading-6">
                                                                    {point}
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                )}

                                                {sessionDetails.summary.action_json && JSON.parse(sessionDetails.summary.action_json).length > 0 && (
                                                    <div>
                                                        <h3 className="text-sm font-semibold text-slate-900 mb-3">Action items</h3>
                                                        <ul className="my-4 ml-6 list-disc space-y-2 text-slate-900">
                                                            {JSON.parse(sessionDetails.summary.action_json).map((action: string, index: number) => (
                                                                <li key={index} className="leading-6">
                                                                    {action}
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                )}
                                            </>
                                        )
                                    )}
                                </div>
                            )}

                            {/* Q&A Messages */}
                            {askMessages.length > 0 && (
                                <div className="border-t border-slate-200 pt-6">
                                    <h2 className="text-lg font-medium text-slate-900 mb-4">Q&A</h2>
                                    <div className="space-y-4">
                                        {askMessages.map((item, index) => {
                                            const nextItem = askMessages[index + 1];
                                            const isQuestion = item.role === 'user';
                                            const answer = isQuestion ? nextItem : null;

                                            // Skip if this is an answer (we handle it with the question)
                                            if (!isQuestion) return null;

                                            return (
                                                <div key={item.id} className="rounded-lg border border-slate-200 bg-white overflow-hidden shadow-sm">
                                                    {/* Question */}
                                                    <div className="p-4 bg-slate-50 border-b border-slate-200">
                                                        <div className="flex items-start justify-between mb-2">
                                                            <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                                                                Your Question
                                                            </p>
                                                            <Button
                                                                onClick={() => handleCopyToClipboard(item.content, item.id)}
                                                                variant="ghost"
                                                                size="sm"
                                                                className="h-6 w-6 p-0 text-slate-400 hover:text-slate-600"
                                                            >
                                                                {copiedMessages.has(item.id) ? (
                                                                    <Check className="h-4 w-4" />
                                                                ) : (
                                                                    <Copy className="h-4 w-4" />
                                                                )}
                                                            </Button>
                                                        </div>
                                                        <p className="text-slate-700 font-medium text-sm">{item.content}</p>
                                                    </div>

                                                    {/* Answer */}
                                                    {answer && (
                                                        <div className="p-4">
                                                            <div className="flex items-start justify-between mb-3">
                                                                <div className="flex items-center gap-2">
                                                                    <Sparkles className="h-4 w-4 text-blue-500" />
                                                                    <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                                                                        AI Response
                                                                    </p>
                                                                </div>
                                                                <Button
                                                                    onClick={() => handleCopyToClipboard(answer.content, answer.id)}
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    className="h-6 w-6 p-0 text-slate-400 hover:text-slate-600"
                                                                >
                                                                    {copiedMessages.has(answer.id) ? (
                                                                        <Check className="h-4 w-4" />
                                                                    ) : (
                                                                        <Copy className="h-4 w-4" />
                                                                    )}
                                                                </Button>
                                                            </div>
                                                            <Markdown
                                                                content={answer.content}
                                                                className="prose prose-sm max-w-none text-slate-700 prose-p:leading-relaxed prose-p:m-0"
                                                            />
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    </section>
                </div>
            </div>

            {/* Transcript Sidebar */}
            <TranscriptSidebar
                isOpen={showTranscriptSidebar}
                onClose={() => setShowTranscriptSidebar(false)}
                transcripts={transcripts}
                aiMessages={askMessages}
            />

            {/* Delete Confirmation Dialog */}
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
        <Suspense
            fallback={
                <div className="min-h-screen bg-[#FDFCF9] flex items-center justify-center">
                    <div className="text-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-600 mx-auto"></div>
                        <p className="mt-4 text-gray-600">Loading...</p>
                    </div>
                </div>
            }
        >
            <SessionDetailsContent />
        </Suspense>
    );
}
