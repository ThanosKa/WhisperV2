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

    useEffect(() => {
        // Check for stored user info from localStorage
        const checkStoredAuth = () => {
            try {
                const storedUserInfo = localStorage.getItem('pickleglass_user');
                if (storedUserInfo) {
                    const profile = JSON.parse(storedUserInfo);
                    console.log('🌐 Webapp mode activated:', profile.uid);
                    setMode('webapp');
                    setUser(profile);
                } else {
                    console.log('🏠 Local mode activated');
                    setMode('local');
                    setUser(defaultLocalUser);
                    setUserInfo(defaultLocalUser);
                }
            } catch (error) {
                console.error('Error checking stored auth:', error);
                setMode('local');
                setUser(defaultLocalUser);
                setUserInfo(defaultLocalUser);
            }
            setIsLoading(false);
        };

        checkStoredAuth();

        // Listen for storage changes (e.g., from authentication in another tab)
        const handleStorageChange = (e: StorageEvent) => {
            if (e.key === 'pickleglass_user') {
                checkStoredAuth();
            }
        };

        window.addEventListener('storage', handleStorageChange);
        window.addEventListener('userInfoChanged', checkStoredAuth);

        return () => {
            window.removeEventListener('storage', handleStorageChange);
            window.removeEventListener('userInfoChanged', checkStoredAuth);
        };
    }, []);

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
