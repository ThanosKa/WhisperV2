'use client';

import { Search, MessageSquare, HelpCircle } from 'lucide-react';
import { type Session } from '@/lib/api';

function SearchResultRow({ result, onSelect }: { result: Session; onSelect: (sessionId: string) => void }) {
    const timestamp = new Date(result.started_at * 1000).toLocaleString();
    const typeLabel = result.session_type === 'listen' ? 'Meeting' : 'Question';
    const typeColor = result.session_type === 'listen' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800';

    return (
        <div className="p-3 hover:bg-muted/50 cursor-pointer transition-colors rounded-sm" onClick={() => onSelect(result.id)}>
            <div className="flex items-start gap-3">
                <MessageSquare className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                        <h3 className="text-sm font-medium truncate">{result.title || 'Untitled Conversation'}</h3>
                        <span className={`capitalize inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${typeColor}`}>
                            {typeLabel}
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{timestamp}</span>
                    </div>
                </div>
            </div>
        </div>
    );
}

interface SearchResultsProps {
    searchQuery: string;
    results: Session[];
    isLoading: boolean;
    isLoadingMore: boolean;
    hasMore: boolean;
    setSentinel: (node: HTMLDivElement | null) => void;
    onSelect: (sessionId: string) => void;
}

/** What the popup shows under the input: the help text, a spinner, the results or an empty message. */
export function SearchResults({ searchQuery, results, isLoading, isLoadingMore, hasMore, setSentinel, onSelect }: SearchResultsProps) {
    return (
        <div className="max-h-[400px] overflow-y-auto">
            {searchQuery.trim() === '?' ? (
                <div className="p-6 text-center">
                    <HelpCircle className="h-8 w-8 text-muted-foreground/60 mx-auto mb-3" />
                    <h3 className="font-medium text-base mb-2">Help with searching</h3>
                    <p className="text-muted-foreground text-sm">Use this tool to quickly search for activity across Whisper.</p>
                </div>
            ) : isLoading ? (
                <div className="p-6 text-center">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto mb-3"></div>
                    <p className="text-muted-foreground text-sm">Searching...</p>
                </div>
            ) : results.length > 0 ? (
                <div className="divide-y">
                    {results.map(result => (
                        <SearchResultRow key={result.id} result={result} onSelect={onSelect} />
                    ))}
                    {isLoadingMore && (
                        <div className="p-4 text-center">
                            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary mx-auto mb-2"></div>
                            <p className="text-muted-foreground text-xs">Loading more...</p>
                        </div>
                    )}
                    {hasMore ? <div ref={setSentinel} /> : <div className="text-center py-4 text-muted-foreground text-xs">End.</div>}
                </div>
            ) : (
                <div className="p-6 text-center">
                    <Search className="h-8 w-8 text-muted-foreground/50 mx-auto mb-3" />
                    <p className="text-muted-foreground text-sm">No results found for &quot;{searchQuery}&quot;</p>
                </div>
            )}
        </div>
    );
}
