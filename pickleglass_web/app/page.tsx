'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/utils/auth';

export default function Home() {
    const router = useRouter();
    const { user, isLoading, mode } = useAuth();
    const [hasChecked, setHasChecked] = useState(false);

    useEffect(() => {
        if (isLoading || hasChecked) return;

        const checkAuthAndRedirect = async () => {
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

            console.log('🔍 Home page auth check:', {
                isElectronMode,
                user: user ? user.uid : 'none',
                mode,
                isLoading,
            });

            if (isElectronMode) {
                // In Electron mode
                if (user && user.uid !== 'default_user' && mode === 'webapp') {
                    // We have a real authenticated user, go to main app
                    console.log('✅ Authenticated user found, redirecting to personalize');
                    router.push('/personalize');
                } else {
                    // No user or default user, go to sync page
                    console.log('🔄 No authenticated user, redirecting to sync page');
                    router.push('/login');
                }
            } else {
                // Web mode - always redirect to personalize for now
                router.push('/personalize');
            }

            setHasChecked(true);
        };

        checkAuthAndRedirect();
    }, [user, isLoading, mode, router, hasChecked]);

    return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
            <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                <p className="mt-4 text-gray-600">Loading...</p>
            </div>
        </div>
    );
}
