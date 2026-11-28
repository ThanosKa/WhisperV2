import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { type UserProfile, setUserInfo, findOrCreateUser, getUserProfile } from './api';
import { isDevMockEnabled, getMockUser, ensureMockData } from './devMock';
// Removed Firebase imports - using webapp authentication

// Dev mock mode is read once per page: it does not change while the page is open.
const subscribeToDevMock = () => () => {};
// The static export renders with only the env flag; the browser also reads `?dev=1` and localStorage.
const devMockOnServer = () => process.env.NEXT_PUBLIC_DEV_MOCK === '1';

type AuthState = { user: UserProfile | null; isLoading: boolean; mode: 'local' | 'webapp' | null };

export const useAuth = (): AuthState => {
    const [user, setUser] = useState<UserProfile | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [mode, setMode] = useState<AuthState['mode']>(null);
    const lastSyncTimeRef = useRef(0); // Debounce mechanism shared across events
    // Dev mock mode: auth is short-circuited to a fake user, derived here rather than set in the effect
    const devMock = useSyncExternalStore(subscribeToDevMock, isDevMockEnabled, devMockOnServer);
    const [mockUser] = useState(getMockUser);

    useEffect(() => {
        // The effect reads the browser's value, also while the page hydrates with the server's
        if (isDevMockEnabled()) {
            ensureMockData();
            setUserInfo({ userInfo: mockUser, skipEvents: true });
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
                                plan: apiUser.plan,
                            };
                            // Overwrite localStorage to ensure headers match server user
                            setUserInfo({ userInfo: profile, skipEvents: true });
                            setMode('webapp');
                            setUser(profile);
                            setIsLoading(false);
                            return;
                        }
                    } catch (apiError) {
                        console.log('📱 API error (server-authoritative):', apiError);
                        // Treat as logged out in Electron mode
                        setMode(null);
                        setUser(null);
                        setUserInfo({ userInfo: null });
                        setIsLoading(false);
                        return;
                    }
                } else {
                    // Web mode: Check localStorage for webapp authentication
                    const storedUserInfo = localStorage.getItem('whisper_user');
                    if (storedUserInfo) {
                        const profile = JSON.parse(storedUserInfo);
                        if (profile.uid && profile.uid !== 'default_user') {
                            console.log('🌐 Webapp mode activated from localStorage:', profile.uid);
                            setMode('webapp');
                            setUser(profile);
                            setIsLoading(false);
                            return;
                        }
                    }
                }

                // Remain unauthenticated; protected routes will redirect
                console.log('🚫 No authenticated user detected');
                setMode(null);
                setUser(null);
                setUserInfo({ userInfo: null });
            } catch (error) {
                console.error('Error checking stored auth:', error);
                setMode(null);
                setUser(null);
                setUserInfo({ userInfo: null });
            }
            setIsLoading(false);
        };

        checkStoredAuth();

        // Listen for storage changes (e.g., from authentication in another tab)
        const handleStorageChange = (e: StorageEvent) => {
            if (e.key === 'whisper_user') {
                console.log('🔄 localStorage change detected, rechecking auth...');
                checkStoredAuth();
            }
        };

        const handleUserInfoChanged = () => {
            const now = Date.now();
            // Debounce: Only trigger if at least 100ms have passed since last sync
            if (now - lastSyncTimeRef.current < 100) {
                console.log('🔄 userInfoChanged debounced (too frequent)');
                return;
            }
            lastSyncTimeRef.current = now;
            console.log('🔄 userInfoChanged event detected, rechecking auth...');
            checkStoredAuth();
        };

        window.addEventListener('storage', handleStorageChange);
        window.addEventListener('userInfoChanged', handleUserInfoChanged);

        // 🔥 Additional listener for desktop app sync
        const handleBeforeUnload = () => {
            // Final sync check before page unload
            const storedUser = localStorage.getItem('whisper_user');
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
    }, [mockUser]);

    return devMock ? { user: mockUser, isLoading: false, mode: 'webapp' } : { user, isLoading, mode };
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
