'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/utils/auth';

interface AuthGuardProps {
    children: React.ReactNode;
    requireAuth?: boolean;
    redirectTo?: string;
}

export default function AuthGuard({ children, requireAuth = false, redirectTo = '/login' }: AuthGuardProps) {
    const { user, isLoading, mode } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (isLoading) return;

        const checkAuth = async () => {
            // Check if we're in Electron mode
            let isElectronMode = false;
            try {
                const response = await fetch('/runtime-config.json');
                if (response.ok) {
                    isElectronMode = true;
                }
            } catch (error) {
                // Web mode
            }

            // In Electron mode, prevent showing default user
            if (isElectronMode && user?.uid === 'default_user' && requireAuth) {
                console.log('🚫 AuthGuard: Blocking default user in Electron mode, redirecting to sync');
                router.push(redirectTo);
                return;
            }

            // Standard auth check
            if (requireAuth && (!user || !user.uid)) {
                router.push(redirectTo);
                return;
            }
        };

        checkAuth();
    }, [user, isLoading, mode, requireAuth, redirectTo, router]);

    // Show loading while checking auth
    if (isLoading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="mt-4 text-gray-600">Loading...</p>
                </div>
            </div>
        );
    }

    return <>{children}</>;
}
