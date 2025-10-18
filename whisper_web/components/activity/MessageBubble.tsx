'use client';

import { useState } from 'react';
import { Copy, Check, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import Markdown from '@/components/Markdown';

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
    const [copied, setCopied] = useState(false);

    const formatTime = (timestamp?: number) => {
        if (!timestamp) return '';
        return new Date(timestamp * 1000).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    const handleCopy = async () => {
        await navigator.clipboard.writeText(content);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className={cn('flex gap-3 mb-4 group/msg', isUser ? 'justify-end' : 'justify-start')}>
            <div className={cn('flex items-end gap-2.5', isUser ? 'flex-row-reverse' : 'flex-row')}>
                <div className="flex flex-col items-start gap-1">
                    <div
                        className={cn(
                            'relative max-w-xs rounded-2xl px-5 py-3 text-sm leading-relaxed',
                            isUser ? 'bg-[#007AFF] text-white' : 'bg-[#E5E5EA] text-gray-900'
                        )}
                    >
                        {isSpeaker && speaker && speaker.toLowerCase() !== 'me' && (
                            <p className="mb-1 text-xs font-semibold text-gray-600">{speaker}</p>
                        )}
                        {!isUser && !isSpeaker && (
                            <div className="mb-1 flex items-center gap-1">
                                <Sparkles className="h-3 w-3 text-gray-500" />
                                <p className="text-xs font-semibold text-gray-600">Whisper</p>
                            </div>
                        )}
                        {role === 'assistant' ? (
                            <Markdown content={content} className="prose-sm prose-gray max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0" />
                        ) : (
                            <p className="whitespace-pre-wrap break-words">{content}</p>
                        )}
                    </div>
                    {timestamp && (
                        <p className={cn('text-xs font-medium text-gray-500', isUser ? 'self-end' : 'self-start')}>{formatTime(timestamp)}</p>
                    )}
                </div>

                <button
                    onClick={handleCopy}
                    className={cn(
                        'opacity-0 transition-all duration-200 p-1.5 rounded-lg shrink-0',
                        'group-hover/msg:opacity-100',
                        copied ? 'bg-green-100 text-green-600' : 'hover:bg-gray-100 text-gray-400 hover:text-gray-600'
                    )}
                    title="Copy message"
                >
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </button>
            </div>
        </div>
    );
}
