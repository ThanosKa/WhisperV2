'use client';

import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Filter, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MessageBubble } from './MessageBubble';
import { Transcript, AiMessage } from '@/utils/api';
import { cn } from '@/lib/utils';

interface TranscriptSidebarProps {
    isOpen: boolean;
    onClose: () => void;
    transcripts: Transcript[];
    aiMessages: AiMessage[];
}

export function TranscriptSidebar({ isOpen, onClose, transcripts, aiMessages }: TranscriptSidebarProps) {
    const [activeTab, setActiveTab] = useState<'transcript' | 'usage'>('transcript');
    const [speakerFilter, setSpeakerFilter] = useState<string>('all');

    const speakerOptions = useMemo(() => {
        const uniqueSpeakers = Array.from(new Set(transcripts.map(t => t.speaker).filter(Boolean)));
        return ['all', ...uniqueSpeakers];
    }, [transcripts]);

    const filteredTranscripts = useMemo(() => {
        if (speakerFilter === 'all') return transcripts;
        return transcripts.filter(item => item.speaker?.toLowerCase() === speakerFilter.toLowerCase());
    }, [transcripts, speakerFilter]);

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    <motion.div
                        key="backdrop"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-sm"
                        onClick={onClose}
                        aria-hidden="true"
                    />

                    <motion.aside
                        key="sidebar"
                        initial={{ x: '100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '100%' }}
                        transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
                        className="fixed right-0 top-0 z-50 flex h-screen w-full max-w-[420px] flex-col overflow-hidden rounded-l-3xl border-l border-slate-200/40 bg-white/85 shadow-[0_35px_120px_-40px_rgba(15,23,42,0.65)] backdrop-blur-xl"
                    >
                        <div className="flex items-center justify-between border-b border-slate-200/70 px-6 py-5">
                            <div>
                                <p className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">Session</p>
                                <h2 className="text-lg font-semibold text-slate-900">Activity Timeline</h2>
                            </div>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={onClose}
                                className="h-9 w-9 rounded-2xl text-slate-500 transition-all hover:bg-slate-100 hover:text-slate-900"
                            >
                                <X className="h-5 w-5" />
                            </Button>
                        </div>

                        <div className="flex items-center justify-between border-b border-slate-200/60 px-6">
                            <nav className="flex gap-1 py-3">
                                {(
                                    [
                                        { id: 'transcript', label: `Transcript (${transcripts.length})` },
                                        { id: 'usage', label: `Usage (${aiMessages.length})` },
                                    ] as const
                                ).map(tab => (
                                    <button
                                        key={tab.id}
                                        onClick={() => setActiveTab(tab.id)}
                                        className={cn(
                                            'rounded-2xl px-4 py-2 text-sm font-medium transition-all',
                                            activeTab === tab.id
                                                ? 'bg-slate-900 text-white shadow-[0_18px_45px_-30px_rgba(15,23,42,0.55)]'
                                                : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
                                        )}
                                    >
                                        {tab.label}
                                    </button>
                                ))}
                            </nav>

                            {activeTab === 'transcript' && speakerOptions.length > 1 && (
                                <div className="flex items-center gap-2 rounded-2xl border border-slate-200/60 bg-white px-3 py-2 text-xs text-slate-500 shadow-[0_15px_35px_-28px_rgba(15,23,42,0.4)]">
                                    <Filter className="h-4 w-4" />
                                    <select
                                        value={speakerFilter}
                                        onChange={event => setSpeakerFilter(event.target.value)}
                                        className="bg-transparent text-slate-600 focus:outline-none"
                                    >
                                        {speakerOptions.map(option => (
                                            <option key={option} value={option}>
                                                {option === 'all' ? 'All speakers' : option}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}
                        </div>

                        <div className="flex-1 overflow-y-auto px-6 py-6">
                            <AnimatePresence mode="wait">
                                {activeTab === 'transcript' ? (
                                    <motion.div
                                        key="transcript"
                                        initial={{ opacity: 0, x: 16 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: -16 }}
                                        transition={{ duration: 0.24, ease: 'easeOut' }}
                                        className="space-y-3 pr-2"
                                    >
                                        {filteredTranscripts.length > 0 ? (
                                            filteredTranscripts.map(item => (
                                                <MessageBubble
                                                    key={item.id}
                                                    content={item.text}
                                                    speaker={item.speaker}
                                                    timestamp={item.start_at}
                                                    isTranscript
                                                />
                                            ))
                                        ) : (
                                            <motion.p
                                                initial={{ opacity: 0 }}
                                                animate={{ opacity: 1 }}
                                                className="rounded-3xl border border-dashed border-slate-200/80 bg-white/70 px-4 py-8 text-center text-sm text-slate-400"
                                            >
                                                No transcript entries for this selection.
                                            </motion.p>
                                        )}
                                    </motion.div>
                                ) : (
                                    <motion.div
                                        key="usage"
                                        initial={{ opacity: 0, x: 16 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: -16 }}
                                        transition={{ duration: 0.24, ease: 'easeOut' }}
                                        className="space-y-3 pr-2"
                                    >
                                        {aiMessages.length > 0 ? (
                                            aiMessages.map(item => (
                                                <MessageBubble key={item.id} content={item.content} role={item.role} timestamp={item.sent_at} />
                                            ))
                                        ) : (
                                            <motion.p
                                                initial={{ opacity: 0 }}
                                                animate={{ opacity: 1 }}
                                                className="rounded-3xl border border-dashed border-slate-200/80 bg-white/70 px-4 py-8 text-center text-sm text-slate-400"
                                            >
                                                No usage events recorded.
                                            </motion.p>
                                        )}
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>

                        <div className="border-t border-slate-200/60 bg-white/80 px-6 py-5 text-xs text-slate-400">
                            <p>Sessions update in real-time. Transcript segments display speaker, timing, and captured context.</p>
                        </div>
                    </motion.aside>
                </>
            )}
        </AnimatePresence>
    );
}
