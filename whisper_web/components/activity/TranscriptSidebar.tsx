'use client';

import { useMemo, useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MessageBubble } from './MessageBubble';
import { Transcript, AiMessage } from '@/utils/api';

interface TranscriptSidebarProps {
    isOpen: boolean;
    onClose: () => void;
    transcripts: Transcript[];
    aiMessages: AiMessage[];
}

export function TranscriptSidebar({ isOpen, onClose, transcripts, aiMessages }: TranscriptSidebarProps) {
    const [speakerFilter, setSpeakerFilter] = useState<string>('all');

    const speakerOptions = useMemo(() => {
        const uniqueSpeakers = Array.from(new Set(transcripts.map(t => t.speaker).filter(Boolean)));
        return ['all', ...uniqueSpeakers] as string[];
    }, [transcripts]);

    const filteredTranscripts = useMemo(() => {
        if (speakerFilter === 'all') return transcripts;
        return transcripts.filter(item => item.speaker?.toLowerCase() === speakerFilter.toLowerCase());
    }, [transcripts, speakerFilter]);

    return (
        <Sheet open={isOpen} onOpenChange={onClose}>
            <SheetContent side="right" className="w-full sm:w-[600px] flex flex-col gap-0 p-0">
                <SheetHeader className="border-b border-slate-200 px-6 py-4">
                    <div>
                        <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Session</p>
                        <SheetTitle className="text-base font-semibold text-slate-900 mt-1">Activity Timeline</SheetTitle>
                    </div>
                </SheetHeader>

                <Tabs defaultValue="transcript" className="flex flex-col flex-1 overflow-hidden">
                    <div className="border-b border-slate-200 px-6 flex items-center justify-between gap-4">
                        <TabsList className="bg-transparent rounded-none border-0 p-0 h-auto gap-0">
                            <TabsTrigger
                                value="transcript"
                                className="rounded-none px-0 py-3 text-sm font-medium text-slate-600 data-[state=active]:text-slate-900 data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-slate-900 border-b-2 border-transparent mr-6"
                            >
                                Transcript ({transcripts.length})
                            </TabsTrigger>
                            <TabsTrigger
                                value="usage"
                                className="rounded-none px-0 py-3 text-sm font-medium text-slate-600 data-[state=active]:text-slate-900 data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-slate-900 border-b-2 border-transparent"
                            >
                                Usage ({aiMessages.length})
                            </TabsTrigger>
                        </TabsList>

                        <TabsContent value="transcript" className="m-0">
                            {speakerOptions.length > 1 && (
                                <Select value={speakerFilter} onValueChange={setSpeakerFilter}>
                                    <SelectTrigger className="w-[140px] h-8 text-xs border-slate-200">
                                        <SlidersHorizontal className="h-3.5 w-3.5 mr-1.5" />
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {speakerOptions.map(option => (
                                            <SelectItem key={option} value={option} className="text-xs">
                                                {option === 'all' ? 'All speakers' : option}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            )}
                        </TabsContent>
                    </div>

                    <div className="flex-1 overflow-y-auto">
                        <TabsContent value="transcript" className="m-0 p-6 space-y-3">
                            {filteredTranscripts.length > 0 ? (
                                filteredTranscripts.map(item => (
                                    <MessageBubble key={item.id} content={item.text} speaker={item.speaker} timestamp={item.start_at} isTranscript />
                                ))
                            ) : (
                                <p className="text-center text-sm text-slate-400 py-8">No transcript entries for this selection.</p>
                            )}
                        </TabsContent>

                        <TabsContent value="usage" className="m-0 p-6 space-y-3">
                            {aiMessages.length > 0 ? (
                                aiMessages.map(item => (
                                    <MessageBubble key={item.id} content={item.content} role={item.role} timestamp={item.sent_at} />
                                ))
                            ) : (
                                <p className="text-center text-sm text-slate-400 py-8">No usage events recorded.</p>
                            )}
                        </TabsContent>
                    </div>
                </Tabs>
            </SheetContent>
        </Sheet>
    );
}
