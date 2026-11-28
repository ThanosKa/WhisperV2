'use client';

import { useState, useEffect, type RefObject } from 'react';

export type SearchShortcut = '#' | '?';

const toShortcut = (char: string): SearchShortcut | null => {
    if (char === '#') return '#';
    if (char === '?') return '?';
    return null;
};

/** Which of the '#' and '?' shortcuts the first character of the input is, so the hint can light it up. */
export function useActiveShortcut({ isOpen, inputRef }: { isOpen: boolean; inputRef: RefObject<HTMLInputElement | null> }) {
    const [activeShortcut, setActiveShortcut] = useState<SearchShortcut | null>(null);

    // Clear active shortcut when popup closes
    if (!isOpen && activeShortcut !== null) {
        setActiveShortcut(null);
    }

    // Handle shortcut key highlighting (only when first character is '#' or '?')
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!isOpen) return;
            // Only activate when input is focused and caret is at position 0 and key is '#' or '?'
            if (!inputRef.current) return;
            const isAtStart = inputRef.current.selectionStart === 0 && inputRef.current.selectionEnd === 0;
            const pressedShortcut = toShortcut(e.key);
            if (pressedShortcut && isAtStart) {
                setActiveShortcut(pressedShortcut);
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
                    setActiveShortcut(toShortcut(first));
                }, 0);
            }
            // Escape keeps its close behavior in the popup; navigation keys do nothing.
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, inputRef]);

    return { activeShortcut, setActiveShortcut };
}

function ShortcutKey({ shortcut, activeShortcut }: { shortcut: SearchShortcut; activeShortcut: SearchShortcut | null }) {
    return (
        <span
            className={`mx-2 px-1.5 py-0.5 rounded text-xs font-mono transition-all duration-200 ${
                activeShortcut === shortcut ? 'bg-primary text-primary-foreground border-primary shadow-md' : 'bg-background border'
            }`}
        >
            {shortcut}
        </span>
    );
}

export function SearchShortcutHint({ activeShortcut }: { activeShortcut: SearchShortcut | null }) {
    return (
        <div className="px-3 py-2 bg-muted/50 rounded-md">
            <div className="flex items-center text-sm text-muted-foreground">
                <span>Type</span>
                <ShortcutKey shortcut="#" activeShortcut={activeShortcut} />
                <span>to access summaries,</span>
                <ShortcutKey shortcut="?" activeShortcut={activeShortcut} />
                <span>for help.</span>
            </div>
        </div>
    );
}
