'use client';

import { motion, type Variants } from 'framer-motion';
import { cn } from '@/lib/utils';

const bubbleVariants: Variants = {
    hidden: { opacity: 0, y: 14, scale: 0.98 },
    visible: {
        opacity: 1,
        y: 0,
        scale: 1,
        transition: {
            duration: 0.28,
            ease: [0.16, 1, 0.3, 1],
        },
    },
};

interface MessageBubbleProps {
    content: string;
    role?: 'user' | 'assistant' | 'speaker';
    speaker?: string;
    timestamp?: number;
    isTranscript?: boolean;
}

export function MessageBubble({ content, role = 'assistant', speaker, timestamp, isTranscript = false }: MessageBubbleProps) {
    const isUser = role === 'user' || (speaker && speaker.toLowerCase() === 'me');
    const isSpeaker = isTranscript && speaker;

    return (
        <motion.div
            variants={bubbleVariants}
            initial="hidden"
            animate="visible"
            className={cn('flex gap-3 mb-4', isUser ? 'justify-end' : 'justify-start')}
        >
            {!isUser && isSpeaker && (
                <motion.div
                    key={`${speaker}-avatar`}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.18, ease: 'easeOut' }}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[conic-gradient(from_160deg_at_50%_50%,#E3EAFF,#F5F7FF)] text-xs font-semibold text-[#1E3A8A] shadow-[0_10px_30px_-18px_rgba(37,99,235,0.8)]"
                >
                    {speaker?.charAt(0).toUpperCase() || 'U'}
                </motion.div>
            )}
            <div
                className={cn(
                    'group/bubble relative max-w-[clamp(16rem,38vw,28rem)] rounded-3xl px-5 py-4 text-sm shadow-[0_24px_60px_-32px_rgba(15,23,42,0.55)] transition-[box-shadow,transform] duration-300',
                    isUser
                        ? 'bg-[conic-gradient(from_120deg_at_50%_50%,#3146FF,#8C4DFF)] text-white ring-1 ring-white/10 hover:shadow-[0_30px_80px_-36px_rgba(79,70,229,0.75)] hover:-translate-y-0.5'
                        : isSpeaker
                          ? 'bg-white/90 text-slate-900 border border-slate-200/70 backdrop-blur-sm hover:shadow-[0_25px_70px_-40px_rgba(15,23,42,0.4)] hover:-translate-y-0.5'
                          : 'bg-slate-900 text-slate-50 border border-slate-800/60 shadow-[0_25px_70px_-45px_rgba(15,23,42,0.8)] hover:-translate-y-0.5'
                )}
            >
                {isSpeaker && speaker && speaker.toLowerCase() !== 'me' && (
                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">{speaker}</p>
                )}
                <p className="whitespace-pre-wrap break-words leading-relaxed text-[0.95rem]">{content}</p>
                {timestamp && (
                    <p className={cn('mt-3 text-xs font-medium', isUser ? 'text-white/70' : isSpeaker ? 'text-slate-500' : 'text-slate-400')}>
                        {new Date(timestamp * 1000).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                )}
            </div>
            {isUser && !isSpeaker && (
                <motion.div
                    key="user-avatar"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.18, ease: 'easeOut' }}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[conic-gradient(from_180deg_at_50%_50%,#3146FF,#8C4DFF)] text-xs font-semibold text-white shadow-[0_18px_45px_-25px_rgba(79,70,229,0.85)]"
                >
                    Y
                </motion.div>
            )}
        </motion.div>
    );
}
