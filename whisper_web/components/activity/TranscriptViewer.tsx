'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowRight } from 'lucide-react';

interface TranscriptViewerProps {
    onClick: () => void;
    transcriptCount?: number;
    messageCount?: number;
}

export function TranscriptViewer({ onClick, transcriptCount = 0, messageCount = 0 }: TranscriptViewerProps) {
    return (
        <div className="flex flex-col gap-4">
            <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Session Activity</h2>

            <Card className="w-64 cursor-pointer hover:shadow-md transition-shadow" onClick={onClick}>
                <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center justify-between">
                        Timeline & Usage
                        <ArrowRight className="h-4 w-4" />
                    </CardTitle>
                </CardHeader>

                <CardContent>
                    <div className="space-y-3">
                        <p className="text-sm text-muted-foreground">Review transcript and usage insights</p>

                        {(transcriptCount > 0 || messageCount > 0) && (
                            <div className="flex gap-2 flex-wrap">
                                {transcriptCount > 0 && <Badge variant="secondary">{transcriptCount} transcripts</Badge>}
                                {messageCount > 0 && <Badge variant="secondary">{messageCount} usage</Badge>}
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
