'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X } from 'lucide-react';
import { searchConversationsPage, type Session, type PagedResult } from '@/lib/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { SearchResults } from './SearchResults';
import { SearchShortcutHint, useActiveShortcut } from './SearchShortcutHint';

interface SearchPopupProps {
    isOpen: boolean;
    onClose: () => void;
}

/** A query starting with '#' searches the summaries too; anything else searches the titles. */
const parseQuery = (rawQuery: string) => {
    const trimmed = rawQuery.trim();
    const isSummaryScope = trimmed.startsWith('#');
    const scope: 'all' | 'title' = isSummaryScope ? 'all' : 'title';
    return { trimmed, query: isSummaryScope ? trimmed.slice(1).trim() : trimmed, scope };
};

export default function SearchPopup({ isOpen, onClose }: SearchPopupProps) {
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<Session[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState<boolean>(false);
    const [nextOffset, setNextOffset] = useState<number | null>(0);
    const [sentinel, setSentinel] = useState<HTMLDivElement | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const router = useRouter();
    const { activeShortcut, setActiveShortcut } = useActiveShortcut({ isOpen, inputRef });

    useEffect(() => {
        if (isOpen && inputRef.current) {
            inputRef.current.focus();
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

    const handleSearch = async (query: string) => {
        const { trimmed, query: q, scope } = parseQuery(query || '');

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
                scope,
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

    const loadMore = useCallback(async () => {
        if (isLoadingMore || !hasMore || nextOffset === null) return;
        const { trimmed, query: q, scope } = parseQuery(searchQuery || '');
        if (!trimmed) return;

        setIsLoadingMore(true);
        try {
            const page = await searchConversationsPage({
                query: q,
                scope,
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
    }, [isLoadingMore, hasMore, nextOffset, searchQuery]);

    // Every query change resets pagination; an empty query (or a lone '?') also clears the results.
    const updateQuery = (query: string) => {
        setSearchQuery(query);
        setHasMore(false);
        setNextOffset(0);
        const trimmedQuery = query.trim();
        if (!trimmedQuery || trimmedQuery === '?') {
            setIsLoading(false);
            setSearchResults([]);
        }
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        updateQuery(e.target.value);
    };

    // Debounce search
    useEffect(() => {
        const trimmedQuery = searchQuery.trim();

        if (!trimmedQuery || trimmedQuery === '?') {
            return;
        }

        const id = setTimeout(() => {
            handleSearch(searchQuery);
        }, 300);

        return () => clearTimeout(id);
    }, [searchQuery]);

    // Intersection Observer for infinite scroll inside the dialog content
    useEffect(() => {
        if (!sentinel) return;
        const observer = new IntersectionObserver(
            entries => {
                const first = entries[0];
                if (first?.isIntersecting) {
                    loadMore();
                }
            },
            { root: null, rootMargin: '200px', threshold: 0 }
        );
        observer.observe(sentinel);
        return () => observer.disconnect();
    }, [sentinel, loadMore]);

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
                            updateQuery('');
                            setActiveShortcut(null);
                        }}
                    >
                        <X className="h-4 w-4" />
                    </Button>
                </div>


                {searchQuery && (
                    <SearchResults
                        searchQuery={searchQuery}
                        results={searchResults}
                        isLoading={isLoading}
                        isLoadingMore={isLoadingMore}
                        hasMore={hasMore}
                        setSentinel={setSentinel}
                        onSelect={sessionId => {
                            router.push(`/activity/details?sessionId=${sessionId}`);
                            onClose();
                        }}
                    />
                )}

                <SearchShortcutHint activeShortcut={activeShortcut} />
            </DialogContent>
        </Dialog>
    );
}
