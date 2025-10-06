'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X, MessageSquare, HelpCircle } from 'lucide-react';
import { searchConversations, searchConversationsPage, Session, PagedResult } from '@/utils/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface SearchPopupProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function SearchPopup({ isOpen, onClose }: SearchPopupProps) {
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<Session[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState<boolean>(false);
    const [nextOffset, setNextOffset] = useState<number | null>(0);
    const sentinelRef = useRef<HTMLDivElement | null>(null);
    const [activeShortcut, setActiveShortcut] = useState<'#' | '?' | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const router = useRouter();

    useEffect(() => {
        if (isOpen && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isOpen]);

    // Clear active shortcut when popup closes
    useEffect(() => {
        if (!isOpen) {
            setActiveShortcut(null);
        }
    }, [isOpen]);

    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) {
                onClose();
            }
        };

        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [isOpen, onClose]);

    // Handle shortcut key highlighting (only when first character is '#' or '?')
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!isOpen) return;
            // Only activate when input is focused and caret is at position 0 and key is '#' or '?'
            if (!inputRef.current) return;
            const isAtStart = inputRef.current.selectionStart === 0 && inputRef.current.selectionEnd === 0;
            if ((e.key === '#' || e.key === '?') && isAtStart) {
                setActiveShortcut(e.key as '#' | '?');
            } else if (e.key.length === 1) {
                // Any character input that changes the first char should reset highlight unless it remains '#' or '?'
                const nextFirstChar = e.key;
                if (nextFirstChar !== '#' && nextFirstChar !== '?') {
                    setActiveShortcut(null);
                }
            } else if (e.key === 'Backspace' || e.key === 'Delete') {
                // Recompute from current value after deletion on next tick
                setTimeout(() => {
                    const val = inputRef.current?.value || '';
                    const first = val.charAt(0);
                    setActiveShortcut(first === '#' || first === '?' ? (first as '#' | '?') : null);
                }, 0);
            } else if (e.key === 'Escape') {
                // Keep existing escape close behavior via separate effect
                return;
            } else {
                // For navigation keys etc., do nothing
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isOpen]);

    const handleSearch = async (query: string) => {
        const raw = query || '';
        const trimmed = raw.trim();
        const isSummaryScope = trimmed.startsWith('#');
        const q = isSummaryScope ? trimmed.slice(1).trim() : trimmed;

        if (!trimmed) {
            setIsLoading(false);
            setSearchResults([]);
            setHasMore(false);
            setNextOffset(0);
            return;
        }

        setIsLoading(true);
        try {
            // Use paged API for both title and summary scopes to support infinite scroll
            const page: PagedResult<Session> = await searchConversationsPage({
                query: q,
                scope: isSummaryScope ? 'all' : 'title',
                offset: 0,
                limit: 10,
            });
            setSearchResults(page.items);
            setHasMore(page.nextOffset !== null);
            setNextOffset(page.nextOffset);
        } catch (error) {
            console.error('Search failed:', error);
            setSearchResults([]);
            setHasMore(false);
            setNextOffset(0);
        } finally {
            setIsLoading(false);
        }
    };

    const loadMore = async () => {
        if (isLoadingMore || !hasMore || nextOffset === null) return;
        const raw = searchQuery || '';
        const trimmed = raw.trim();
        const isSummaryScope = trimmed.startsWith('#');
        const q = isSummaryScope ? trimmed.slice(1).trim() : trimmed;
        if (!trimmed) return;

        setIsLoadingMore(true);
        try {
            const page = await searchConversationsPage({
                query: q,
                scope: isSummaryScope ? 'all' : 'title',
                offset: nextOffset || 0,
                limit: 10,
            });
            setSearchResults(prev => [...prev, ...page.items]);
            setHasMore(page.nextOffset !== null);
            setNextOffset(page.nextOffset);
        } catch (e) {
            console.error('Failed to load more search results', e);
        } finally {
            setIsLoadingMore(false);
        }
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const query = e.target.value;
        setSearchQuery(query);
    };

    // Debounce search
    useEffect(() => {
        const trimmedQuery = searchQuery.trim();

        if (!trimmedQuery) {
            setIsLoading(false);
            setSearchResults([]);
            setHasMore(false);
            setNextOffset(0);
            return;
        }

        if (trimmedQuery === '?') {
            setIsLoading(false);
            setSearchResults([]);
            setHasMore(false);
            setNextOffset(0);
            return;
        }

        const id = setTimeout(() => {
            handleSearch(searchQuery);
        }, 300);

        return () => clearTimeout(id);
    }, [searchQuery]);

    // Reset pagination state when query changes
    useEffect(() => {
        setHasMore(false);
        setNextOffset(0);
    }, [searchQuery]);

    // Intersection Observer for infinite scroll inside the dialog content
    useEffect(() => {
        const sentinel = sentinelRef.current;
        if (!sentinel) return;
        const observer = new IntersectionObserver(
            entries => {
                const first = entries[0];
                if (first.isIntersecting) {
                    loadMore();
                }
            },
            { root: null, rootMargin: '200px', threshold: 0 }
        );
        observer.observe(sentinel);
        return () => observer.disconnect();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sentinelRef.current, hasMore, nextOffset, isLoadingMore, searchQuery]);

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Search className="h-5 w-5" />
                        Search Conversations
                    </DialogTitle>
                </DialogHeader>

                <div className="flex items-center space-x-2">
                    <div className="relative flex-1">
                        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            ref={inputRef}
                            type="text"
                            placeholder="Search conversations..."
                            value={searchQuery}
                            onChange={handleInputChange}
                            className="pl-8"
                        />
                    </div>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                            setSearchQuery('');
                            setActiveShortcut(null);
                        }}
                    >
                        <X className="h-4 w-4" />
                    </Button>
                </div>

                {searchQuery && (
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
                        ) : searchResults.length > 0 ? (
                            <div className="divide-y">
                                {searchResults.map(result => {
                                    const timestamp = new Date(result.started_at * 1000).toLocaleString();
                                    const typeLabel = result.session_type === 'listen' ? 'Meeting' : 'Question';
                                    const typeColor = result.session_type === 'listen' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800';

                                    return (
                                        <div
                                            key={result.id}
                                            className="p-3 hover:bg-muted/50 cursor-pointer transition-colors rounded-sm"
                                            onClick={() => {
                                                router.push(`/activity/details?sessionId=${result.id}`);
                                                onClose();
                                            }}
                                        >
                                            <div className="flex items-start gap-3">
                                                <MessageSquare className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center justify-between gap-2 mb-1">
                                                        <h3 className="text-sm font-medium truncate">{result.title || 'Untitled Conversation'}</h3>
                                                        <span
                                                            className={`capitalize inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${typeColor}`}
                                                        >
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
                                })}
                                {isLoadingMore && (
                                    <div className="p-4 text-center">
                                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary mx-auto mb-2"></div>
                                        <p className="text-muted-foreground text-xs">Loading more...</p>
                                    </div>
                                )}
                                {hasMore ? <div ref={sentinelRef} /> : <div className="text-center py-4 text-muted-foreground text-xs">End.</div>}
                            </div>
                        ) : (
                            <div className="p-6 text-center">
                                <Search className="h-8 w-8 text-muted-foreground/50 mx-auto mb-3" />
                                <p className="text-muted-foreground text-sm">No results found for "{searchQuery}"</p>
                            </div>
                        )}
                    </div>
                )}

                <div className="px-3 py-2 bg-muted/50 rounded-md">
                    <div className="flex items-center text-sm text-muted-foreground">
                        <span>Type</span>
                        <span
                            className={`mx-2 px-1.5 py-0.5 rounded text-xs font-mono transition-all duration-200 ${
                                activeShortcut === '#' ? 'bg-primary text-primary-foreground border-primary shadow-md' : 'bg-background border'
                            }`}
                        >
                            #
                        </span>
                        <span>to access summaries,</span>
                        <span
                            className={`mx-2 px-1.5 py-0.5 rounded text-xs font-mono transition-all duration-200 ${
                                activeShortcut === '?' ? 'bg-primary text-primary-foreground border-primary shadow-md' : 'bg-background border'
                            }`}
                        >
                            ?
                        </span>
                        <span>for help.</span>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
