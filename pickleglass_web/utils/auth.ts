import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { UserProfile, setUserInfo, findOrCreateUser } from './api';
// Removed Firebase imports - using webapp authentication

const defaultLocalUser: UserProfile = {
    uid: 'default_user',
    display_name: 'Default User',
    email: 'contact@pickle.com',
};

export const useAuth = () => {
    const [user, setUser] = useState<UserProfile | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [mode, setMode] = useState<'local' | 'webapp' | null>(null);
    const [retryCount, setRetryCount] = useState(0);

    useEffect(() => {
        // Prevent infinite loops
        if (retryCount > 3) {
            console.log('🛑 Too many retries, falling back to local mode');
            setMode('local');
            setUser(defaultLocalUser);
            setUserInfo(defaultLocalUser);
            setIsLoading(false);
            return;
        }

        // Check both localStorage and API for user info
        const checkStoredAuth = async () => {
            try {
                // First check if we're in electron mode by checking for runtime config
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

                // If in electron mode, prioritize API check
                if (isElectronMode) {
                    try {
                        const response = await fetch('/api/user/profile');
                        if (response.ok) {
                            const apiUser = await response.json();
                            console.log('🖥️ Electron mode activated from API:', apiUser.uid);
                            const profile: UserProfile = {
                                uid: apiUser.uid,
                                display_name: apiUser.display_name,
                                email: apiUser.email,
                            };
                            setMode('webapp');
                            setUser(profile);
                            setUserInfo(profile, true); // Sync to localStorage
                            setRetryCount(0); // Reset retry count on success
                            setIsLoading(false);
                            return;
                        } else {
                            console.log('📱 API returned status:', response.status, response.statusText);
                            setRetryCount(prev => prev + 1);
                        }
                    } catch (apiError) {
                        console.log('📱 API error:', apiError);
                        setRetryCount(prev => prev + 1);
                    }
                }

                // Check localStorage (for web mode or electron fallback)
                const storedUserInfo = localStorage.getItem('pickleglass_user');
                if (storedUserInfo) {
                    const profile = JSON.parse(storedUserInfo);
                    // Only use localStorage if it's not the default user, or if we're not in electron mode
                    if (!isElectronMode || profile.uid !== 'default_user') {
                        console.log('🌐 Webapp mode activated from localStorage:', profile.uid);
                        setMode('webapp');
                        setUser(profile);
                        setRetryCount(0);
                        setIsLoading(false);
                        return;
                    } else {
                        console.log('🗑️ Clearing default user from localStorage in electron mode');
                        localStorage.removeItem('pickleglass_user');
                    }
                }

                // Fallback to local mode
                console.log('🏠 Local mode activated');
                setMode('local');
                setUser(defaultLocalUser);
                setUserInfo(defaultLocalUser);
                setRetryCount(0);
            } catch (error) {
                console.error('Error checking stored auth:', error);
                setMode('local');
                setUser(defaultLocalUser);
                setUserInfo(defaultLocalUser);
                setRetryCount(0);
            }
            setIsLoading(false);
        };

        checkStoredAuth();

        // Listen for storage changes (e.g., from authentication in another tab)
        const handleStorageChange = (e: StorageEvent) => {
            if (e.key === 'pickleglass_user') {
                setRetryCount(0); // Reset retry count on external changes
                checkStoredAuth();
            }
        };

        window.addEventListener('storage', handleStorageChange);
        window.addEventListener('userInfoChanged', () => {
            setRetryCount(0);
            checkStoredAuth();
        });

        return () => {
            window.removeEventListener('storage', handleStorageChange);
            window.removeEventListener('userInfoChanged', checkStoredAuth);
        };
    }, [retryCount]);

    return { user, isLoading, mode };
};

export const useRedirectIfNotAuth = () => {
    const { user, isLoading } = useAuth();
    const router = useRouter();

    useEffect(() => {
        // This hook is now simplified. It doesn't redirect for local mode.
        // If you want to force login for hosting mode, you'd add logic here.
        // For example: if (!isLoading && !user) router.push('/login');
        // But for now, we allow both modes.
    }, [user, isLoading, router]);

    return user;
};
