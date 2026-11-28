'use client';

import dynamic from 'next/dynamic';
import { Sparkles, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { type AiMessage } from '@/lib/api';

const Markdown = dynamic(() => import('@/components/activity/Markdown'), { ssr: false });

interface CopyButtonProps {
    copied: boolean;
    onCopy: () => void;
}

function CopyButton({ copied, onCopy }: CopyButtonProps) {
    return (
        <Button onClick={onCopy} variant="ghost" size="sm" className="h-6 w-6 p-0 text-slate-400 hover:text-slate-600">
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </Button>
    );
}

interface QaListProps {
    messages: AiMessage[];
    copiedMessages: Set<string>;
    onCopy: (args: { text: string; messageId: string }) => void;
}

export function QaList({ messages, copiedMessages, onCopy }: QaListProps) {
    return (
        <div className="border-t border-slate-200 pt-6">
            <h2 className="text-lg font-medium text-slate-900 mb-4">Q&A</h2>
            <div className="space-y-4">
                {messages.map((item, index) => {
                    // An answer is shown with its question, so only questions start a card.
                    if (item.role !== 'user') return null;
                    const answer = messages[index + 1];

                    return (
                        <div key={item.id} className="rounded-lg border border-slate-200 bg-white overflow-hidden shadow-xs">
                            <div className="p-4 bg-slate-50 border-b border-slate-200">
                                <div className="flex items-start justify-between mb-2">
                                    <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Your Question</p>
                                    <CopyButton
                                        copied={copiedMessages.has(item.id)}
                                        onCopy={() => onCopy({ text: item.content, messageId: item.id })}
                                    />
                                </div>
                                <p className="text-slate-700 font-medium text-sm">{item.content}</p>
                            </div>

                            {answer && (
                                <div className="p-4">
                                    <div className="flex items-start justify-between mb-3">
                                        <div className="flex items-center gap-2">
                                            <Sparkles className="h-4 w-4 text-blue-500" />
                                            <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">AI Response</p>
                                        </div>
                                        <CopyButton
                                            copied={copiedMessages.has(answer.id)}
                                            onCopy={() => onCopy({ text: answer.content, messageId: answer.id })}
                                        />
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
    );
}
