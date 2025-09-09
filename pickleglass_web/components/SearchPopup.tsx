'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X } from 'lucide-react';
import { searchConversations, Session } from '@/utils/api';
import { MessageSquare } from 'lucide-react';
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
    const inputRef = useRef<HTMLInputElement>(null);
    const router = useRouter();

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
        if (!query.trim()) {
            setSearchResults([]);
            return;
        }

        setIsLoading(true);
        try {
            const results = await searchConversations(query);
            setSearchResults(results);
        } catch (error) {
            console.error('Search failed:', error);
            setSearchResults([]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const query = e.target.value;
        setSearchQuery(query);
    };

    // Debounce search
    useEffect(() => {
        const id = setTimeout(() => {
            if (searchQuery.trim()) {
                handleSearch(searchQuery);
            } else {
                setSearchResults([]);
            }
        }, 300);
        return () => clearTimeout(id);
    }, [searchQuery]);

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
                    <Button variant="ghost" size="sm" onClick={onClose}>
                        <X className="h-4 w-4" />
                    </Button>
                </div>

                <div className="px-3 py-2 bg-muted/50 rounded-md">
                    <div className="flex items-center text-sm text-muted-foreground">
                        <span>Type</span>
                        <span className="mx-2 px-1.5 py-0.5 bg-background border rounded text-xs font-mono">#</span>
                        <span>to access summaries,</span>
                        <span className="mx-2 px-1.5 py-0.5 bg-background border rounded text-xs font-mono">?</span>
                        <span>for help.</span>
                    </div>
                </div>

                {searchQuery && (
                    <div className="max-h-[400px] overflow-y-auto">
                        {isLoading ? (
                            <div className="p-6 text-center">
                                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto mb-3"></div>
                                <p className="text-muted-foreground text-sm">Searching...</p>
                            </div>
                        ) : searchResults.length > 0 ? (
                            <div className="divide-y">
                                {searchResults.map(result => {
                                    const timestamp = new Date(result.started_at * 1000).toLocaleString();

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
                                                    <h3 className="text-sm font-medium mb-1 truncate">{result.title || 'Untitled Conversation'}</h3>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-xs text-muted-foreground">{timestamp}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="p-6 text-center">
                                <Search className="h-8 w-8 text-muted-foreground/50 mx-auto mb-3" />
                                <p className="text-muted-foreground text-sm">No results found for "{searchQuery}"</p>
                            </div>
                        )}
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
