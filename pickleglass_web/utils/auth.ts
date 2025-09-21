import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { UserProfile, setUserInfo, findOrCreateUser, getUserProfile } from './api';
import { isDevMockEnabled, getMockUser, ensureMockData } from './devMock';
// Removed Firebase imports - using webapp authentication

export const useAuth = () => {
    const [user, setUser] = useState<UserProfile | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [mode, setMode] = useState<'local' | 'webapp' | null>(null);
    const [retryCount, setRetryCount] = useState(0);
    const [lastSyncTime, setLastSyncTime] = useState(0); // Debounce mechanism

    useEffect(() => {
        // Dev mock mode: short-circuit auth and return a fake user
        if (isDevMockEnabled()) {
            try {
                ensureMockData();
                const profile = getMockUser();
                setUserInfo(profile, true);
                setMode('webapp');
                setUser(profile);
                setRetryCount(0);
                setIsLoading(false);
                return;
            } catch (e) {
                console.log('⚠️ Dev mock mode initialization error:', e);
            }
        }

        // Prevent infinite loops
        if (retryCount > 3) {
            console.log('🛑 Too many retries, staying unauthenticated');
            setMode(null);
            setUser(null);
            setUserInfo(null);
            setIsLoading(false);
            return;
        }

        // Check both localStorage and API for user info
        const checkStoredAuth = async () => {
            try {
                // Detect electron mode via runtime config
                let isElectronMode = false;
                try {
                    const response = await fetch('/runtime-config.json');
                    if (response.ok) {
                        isElectronMode = true;
                        console.log('🖥️ Detected Electron mode');
                    }
                } catch (error) {
                    console.log('🌐 Detected Web mode');
                }

                if (isElectronMode) {
                    // In Electron mode, SERVER IS AUTHORITATIVE
                    try {
                        console.log('🔍 Fetching server-authoritative user profile...');
                        const apiUser = await getUserProfile();
                        if (apiUser && apiUser.uid) {
                            const profile: UserProfile = {
                                uid: apiUser.uid,
                                display_name: apiUser.display_name,
                                email: apiUser.email,
                            };
                            // Overwrite localStorage to ensure headers match server user
                            setUserInfo(profile, true);
                            setMode('webapp');
                            setUser(profile);
                            setRetryCount(0);
                            setIsLoading(false);
                            return;
                        }
                    } catch (apiError) {
                        console.log('📱 API error (server-authoritative):', apiError);
                        // Treat as logged out in Electron mode
                        setMode(null);
                        setUser(null);
                        setUserInfo(null);
                        setRetryCount(0);
                        setIsLoading(false);
                        return;
                    }
                } else {
                    // Web mode: Check localStorage for webapp authentication
                    const storedUserInfo = localStorage.getItem('pickleglass_user');
                    if (storedUserInfo) {
                        const profile = JSON.parse(storedUserInfo);
                        if (profile.uid && profile.uid !== 'default_user') {
                            console.log('🌐 Webapp mode activated from localStorage:', profile.uid);
                            setMode('webapp');
                            setUser(profile);
                            setRetryCount(0);
                            setIsLoading(false);
                            return;
                        }
                    }
                }

                // Remain unauthenticated; protected routes will redirect
                console.log('🚫 No authenticated user detected');
                setMode(null);
                setUser(null);
                setUserInfo(null);
                setRetryCount(0);
            } catch (error) {
                console.error('Error checking stored auth:', error);
                setMode(null);
                setUser(null);
                setUserInfo(null);
                setRetryCount(0);
            }
            setIsLoading(false);
        };

        checkStoredAuth();

        // Listen for storage changes (e.g., from authentication in another tab)
        const handleStorageChange = (e: StorageEvent) => {
            if (e.key === 'pickleglass_user') {
                console.log('🔄 localStorage change detected, rechecking auth...');
                setRetryCount(0); // Reset retry count on external changes
                checkStoredAuth();
            }
        };

        const handleUserInfoChanged = () => {
            const now = Date.now();
            // Debounce: Only trigger if at least 100ms have passed since last sync
            if (now - lastSyncTime < 100) {
                console.log('🔄 userInfoChanged debounced (too frequent)');
                return;
            }
            setLastSyncTime(now);
            console.log('🔄 userInfoChanged event detected, rechecking auth...');
            setRetryCount(0);
            checkStoredAuth();
        };

        window.addEventListener('storage', handleStorageChange);
        window.addEventListener('userInfoChanged', handleUserInfoChanged);

        // 🔥 Additional listener for desktop app sync
        const handleBeforeUnload = () => {
            // Final sync check before page unload
            const storedUser = localStorage.getItem('pickleglass_user');
            if (storedUser && JSON.parse(storedUser).uid && JSON.parse(storedUser).uid !== 'default_user') {
                console.log('🔄 Page unload - ensuring user sync is complete');
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);

        return () => {
            window.removeEventListener('storage', handleStorageChange);
            window.removeEventListener('userInfoChanged', handleUserInfoChanged);
            window.removeEventListener('beforeunload', handleBeforeUnload);
        };
    }, [retryCount, lastSyncTime]);

    return { user, isLoading, mode };
};

export const useRedirectIfNotAuth = () => {
    const { user, isLoading } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (!isLoading && (!user || !user.uid)) {
            router.push('/login');
        }
    }, [user, isLoading, router]);

    return user;
};
