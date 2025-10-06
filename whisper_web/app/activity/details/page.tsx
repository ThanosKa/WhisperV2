'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRedirectIfNotAuth } from '@/utils/auth';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { UserProfile, SessionDetails, Transcript, AiMessage, getSessionDetails, deleteSession, updateSessionTitle } from '@/utils/api';
import { useToast } from '@/hooks/use-toast';
import dynamic from 'next/dynamic';

const Markdown = dynamic(() => import('@/components/Markdown'), { ssr: false });

type ConversationItem = (Transcript & { type: 'transcript' }) | (AiMessage & { type: 'ai_message' });

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="mb-8">
        <h2 className="text-lg font-semibold text-gray-800 mb-3">{title}</h2>
        <div className="text-gray-700 space-y-2">{children}</div>
    </div>
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

            // Dispatch custom event to notify parent components of session update
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

    const handleCopyToClipboard = async (text: string, role: string, messageId: string) => {
        try {
            await navigator.clipboard.writeText(text);

            // Track this message as copied
            setCopiedMessages(prev => new Set(prev).add(messageId));

            // Reset the copied state after 2 seconds
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

    if (!userInfo || isLoading) {
        return (
            <div className="min-h-screen bg-[#FDFCF9] flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-600 mx-auto"></div>
                    <p className="mt-4 text-gray-600">Loading session details...</p>
                </div>
            </div>
        );
    }

    if (!sessionDetails) {
        return (
            <div className="min-h-screen bg-[#FDFCF9] flex items-center justify-center">
                <div className="max-w-4xl mx-auto px-8 py-12 text-center">
                    <h2 className="text-2xl font-semibold text-gray-900 mb-8">Session Not Found</h2>
                    <p className="text-gray-600">The requested session could not be found.</p>
                    <Link href="/activity" className="mt-4 inline-block text-blue-600 hover:text-blue-800">
                        &larr; Back to Activity
                    </Link>
                </div>
            </div>
        );
    }

    const askMessages = sessionDetails.ai_messages || [];

    return (
        <>
            <div className="min-h-screen bg-[#FDFCF9] text-gray-800">
                <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
                    <div className="mb-8">
                        <Link href="/activity" className="text-sm text-gray-500 hover:text-gray-700 flex items-center">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                            Back
                        </Link>
                    </div>

                    <div className="bg-white p-8 rounded-xl shadow-md border border-gray-100">
                        <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                            <div className="flex-1 min-w-0">
                                <div className="flex justify-between items-start">
                                    <div className="flex-1 min-w-0">
                                        {editingTitle ? (
                                            <Input
                                                className="w-full bg-transparent border border-transparent p-0 h-auto text-2xl font-bold focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-none md:text-2xl"
                                                value={newTitle}
                                                onChange={e => setNewTitle(e.target.value)}
                                                placeholder="Enter title..."
                                                onKeyDown={e => {
                                                    if (e.key === 'Enter') handleSaveTitle();
                                                    if (e.key === 'Escape') handleCancelEdit();
                                                }}
                                                disabled={savingTitle}
                                            />
                                        ) : (
                                            <h1 className="text-2xl font-bold text-gray-900 mb-2 truncate">
                                                {sessionDetails.session.title ||
                                                    `Conversation on ${new Date(sessionDetails.session.started_at * 1000).toLocaleDateString()}`}
                                            </h1>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2 ml-4 shrink-0">
                                        {editingTitle ? (
                                            <>
                                                <Button onClick={handleSaveTitle} size="sm" disabled={savingTitle || !newTitle.trim()}>
                                                    {savingTitle ? 'Saving...' : 'Save'}
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
                                                <Button
                                                    onClick={() => setShowDeleteConfirm(true)}
                                                    variant="destructive"
                                                    size="sm"
                                                    disabled={deleting}
                                                >
                                                    {deleting ? 'Deleting...' : 'Delete Activity'}
                                                </Button>
                                            </>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center text-sm text-gray-500 space-x-4">
                                    <span>
                                        {new Date(sessionDetails.session.started_at * 1000).toLocaleDateString('en-US', {
                                            month: 'long',
                                            day: 'numeric',
                                            year: 'numeric',
                                        })}
                                    </span>
                                    <span>
                                        {new Date(sessionDetails.session.started_at * 1000).toLocaleTimeString('en-US', {
                                            hour: 'numeric',
                                            minute: '2-digit',
                                            hour12: true,
                                        })}
                                    </span>
                                    <span
                                        className={`capitalize px-2 py-0.5 rounded-full text-xs font-medium ${sessionDetails.session.session_type === 'listen' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}`}
                                    >
                                        {sessionDetails.session.session_type}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {sessionDetails.summary && (
                            <Section title="Summary">
                                <p className="text-lg italic text-gray-600 mb-4">"{sessionDetails.summary.tldr}"</p>

                                {sessionDetails.summary.bullet_json && JSON.parse(sessionDetails.summary.bullet_json).length > 0 && (
                                    <div className="mt-4">
                                        <h3 className="font-semibold text-gray-700 mb-2">Key Points:</h3>
                                        <ul className="list-disc list-inside space-y-1 text-gray-600">
                                            {JSON.parse(sessionDetails.summary.bullet_json).map((point: string, index: number) => (
                                                <li key={index}>{point}</li>
                                            ))}
                                        </ul>
                                    </div>
                                )}

                                {sessionDetails.summary.action_json && JSON.parse(sessionDetails.summary.action_json).length > 0 && (
                                    <div className="mt-4">
                                        <h3 className="font-semibold text-gray-700 mb-2">Action Items:</h3>
                                        <ul className="list-disc list-inside space-y-1 text-gray-600">
                                            {JSON.parse(sessionDetails.summary.action_json).map((action: string, index: number) => (
                                                <li key={index}>{action}</li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </Section>
                        )}

                        {sessionDetails.transcripts && sessionDetails.transcripts.length > 0 && (
                            <Section title="Listen: Transcript">
                                <div className="space-y-3">
                                    {sessionDetails.transcripts.map(item => (
                                        <p key={item.id} className="text-gray-700">
                                            <span className="font-semibold capitalize">{item.speaker}: </span>
                                            {item.text}
                                        </p>
                                    ))}
                                </div>
                            </Section>
                        )}

                        {askMessages.length > 0 && (
                            <Section title="Ask: Q&A">
                                <div className="space-y-4">
                                    {askMessages.map(item => (
                                        <div key={item.id} className={`p-3 rounded-lg ${item.role === 'user' ? 'bg-gray-100' : 'bg-blue-50'}`}>
                                            <div className="flex justify-between items-start mb-1">
                                                <p className="font-semibold capitalize text-sm text-gray-600">
                                                    {item.role === 'user' ? 'You' : 'AI'}
                                                </p>
                                                <Button
                                                    onClick={() => handleCopyToClipboard(item.content, item.role === 'user' ? 'User' : 'AI', item.id)}
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-6 w-6 p-0 text-gray-700 hover:text-gray-900"
                                                >
                                                    {copiedMessages.has(item.id) ? (
                                                        <svg
                                                            xmlns="http://www.w3.org/2000/svg"
                                                            width="12"
                                                            height="12"
                                                            viewBox="0 0 24 24"
                                                            fill="none"
                                                            stroke="currentColor"
                                                            strokeWidth="2.5"
                                                            strokeLinecap="round"
                                                            strokeLinejoin="round"
                                                        >
                                                            <path d="M20 6L9 17l-5-5" />
                                                        </svg>
                                                    ) : (
                                                        <svg
                                                            xmlns="http://www.w3.org/2000/svg"
                                                            width="12"
                                                            height="12"
                                                            viewBox="0 0 24 24"
                                                            fill="none"
                                                            stroke="currentColor"
                                                            strokeWidth="2"
                                                            strokeLinecap="round"
                                                            strokeLinejoin="round"
                                                        >
                                                            <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
                                                            <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                                                        </svg>
                                                    )}
                                                </Button>
                                            </div>
                                            {item.role === 'assistant' ? (
                                                <Markdown
                                                    content={item.content}
                                                    className="prose prose-sm max-w-none prose-headings:mt-0 prose-p:my-2"
                                                />
                                            ) : (
                                                <p className="text-gray-800 whitespace-pre-wrap">{item.content}</p>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </Section>
                        )}
                    </div>
                </div>
            </div>

            <ConfirmDialog
                open={showDeleteConfirm}
                onOpenChange={setShowDeleteConfirm}
                title="Delete Activity"
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
