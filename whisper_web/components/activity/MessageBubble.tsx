'use client';

import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

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
            minute: '2-digit' 
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
                <div
                    className={cn(
                        'relative max-w-xs rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
                        isUser
                            ? 'bg-blue-500 text-white'
                            : isSpeaker
                            ? 'bg-gray-300 text-gray-900'
                            : 'bg-gray-200 text-gray-900'
                    )}
                >
                    {isSpeaker && speaker && speaker.toLowerCase() !== 'me' && (
                        <p className="mb-1 text-xs font-semibold text-gray-600">{speaker}</p>
                    )}
                    <p className="whitespace-pre-wrap break-words">{content}</p>
                    {timestamp && (
                        <p className={cn('mt-1.5 text-xs font-medium', isUser ? 'text-blue-100' : 'text-gray-600')}>
                            {formatTime(timestamp)}
                        </p>
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
                    {copied ? (
                        <Check className="h-4 w-4" />
                    ) : (
                        <Copy className="h-4 w-4" />
                    )}
                </button>
            </div>
        </div>
    );
}
