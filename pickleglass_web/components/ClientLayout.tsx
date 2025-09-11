'use client';

import { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import SearchPopup from '@/components/SearchPopup';
import AuthGuard from '@/components/AuthGuard';
import { usePathname } from 'next/navigation';

export default function ClientLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const isAuthBypass = pathname === '/login';
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    const [isSearchOpen, setIsSearchOpen] = useState(false);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                setIsSearchOpen(true);
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, []);

    return (
        <div className="flex h-screen">
            <Sidebar isCollapsed={isSidebarCollapsed} onToggle={setIsSidebarCollapsed} onSearchClick={() => setIsSearchOpen(true)} />
            <main className="flex-1 overflow-auto bg-white">
                {isAuthBypass ? (
                    children
                ) : (
                    <AuthGuard requireAuth redirectTo="/login">
                        {children}
                    </AuthGuard>
                )}
            </main>

            <SearchPopup isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />
        </div>
    );
}
