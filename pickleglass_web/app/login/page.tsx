'use client';

import { useRouter } from 'next/navigation';
import { getUserProfile } from '@/utils/api';
import { RefreshCw, User, Check } from 'lucide-react';
import { useState, useEffect } from 'react';

export default function SyncPage() {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [isElectronMode, setIsElectronMode] = useState(false);
    const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle');
    const [errorMessage, setErrorMessage] = useState('');

    useEffect(() => {
        const checkElectronMode = async () => {
            try {
                const response = await fetch('/runtime-config.json');
                if (response.ok) {
                    setIsElectronMode(true);
                    console.log('🖥️ Detected Electron mode - attempting auto-sync');
                    // Auto-attempt sync in Electron mode
                    handleSyncWithDesktop();
                } else {
                    console.log('🌐 Detected Web mode');
                }
            } catch (error) {
                console.log('🌐 Detected Web mode (no runtime config)');
            }
        };

        checkElectronMode();
    }, []);

    const handleSyncWithDesktop = async () => {
        setIsSyncing(true);
        setSyncStatus('syncing');
        setErrorMessage('');

        try {
            console.log('🔄 Attempting to sync with desktop app user...');

            // Fetch user from desktop app backend via unified API util
            try {
                const user = await getUserProfile();
                console.log('✅ Successfully fetched user from desktop app:', user);

                // Store user in localStorage to sync with useAuth
                const userProfile = {
                    uid: user.uid,
                    display_name: user.display_name,
                    email: user.email,
                };

                localStorage.setItem('pickleglass_user', JSON.stringify(userProfile));
                window.dispatchEvent(new Event('userInfoChanged'));

                setSyncStatus('success');

                // Wait a moment to show success, then redirect
                setTimeout(() => {
                    router.push('/settings');
                }, 1000);
            } catch (err) {
                console.log('❌ Failed to fetch user:', err);
                setSyncStatus('error');
                setErrorMessage('Desktop app user not found. Please ensure you are logged in to the desktop app.');
            }
        } catch (error) {
            console.error('❌ Sync error:', error);
            setSyncStatus('error');
            setErrorMessage('Unable to connect to desktop app. Please ensure the desktop app is running.');
        } finally {
            setIsSyncing(false);
        }
    };

    // Removed local mode continue: site is protected, must sync

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center">
            <div className="text-center mb-8">
                <h1 className="text-3xl font-bold text-gray-900">Welcome to Pickle Glass</h1>
                {isElectronMode ? (
                    <>
                        <p className="text-gray-600 mt-2">Sync with your authenticated desktop app account.</p>
                        <p className="text-sm text-blue-600 mt-1 font-medium">🖥️ Desktop app detected</p>
                    </>
                ) : (
                    <>
                        <p className="text-gray-600 mt-2">Sign in with your account to sync your data across all devices.</p>
                        <p className="text-sm text-gray-500 mt-1">Local mode will run if you don't sign in.</p>
                    </>
                )}
            </div>

            <div className="w-full max-w-sm">
                <div className="bg-white p-8 rounded-lg shadow-md border border-gray-200">
                    {isElectronMode ? (
                        // Desktop App Sync UI
                        <>
                            <button
                                onClick={handleSyncWithDesktop}
                                disabled={isSyncing}
                                className={`w-full flex items-center justify-center gap-3 py-3 px-4 border rounded-md shadow-sm text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                                    syncStatus === 'success'
                                        ? 'border-green-300 text-green-700 bg-green-50'
                                        : syncStatus === 'error'
                                          ? 'border-red-300 text-red-700 bg-red-50'
                                          : 'border-blue-300 text-blue-700 bg-blue-50 hover:bg-blue-100 focus:ring-blue-500'
                                }`}
                            >
                                {syncStatus === 'syncing' ? (
                                    <RefreshCw className="h-5 w-5 animate-spin" />
                                ) : syncStatus === 'success' ? (
                                    <Check className="h-5 w-5" />
                                ) : (
                                    <User className="h-5 w-5" />
                                )}
                                <span>
                                    {syncStatus === 'syncing'
                                        ? 'Syncing with Desktop App...'
                                        : syncStatus === 'success'
                                          ? 'Sync Complete!'
                                          : syncStatus === 'error'
                                            ? 'Retry Sync'
                                            : 'Sync with Desktop App'}
                                </span>
                            </button>

                            {syncStatus === 'error' && (
                                <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-md">
                                    <p className="text-sm text-red-700">{errorMessage}</p>
                                </div>
                            )}
                        </>
                    ) : (
                        // Web Mode - Redirect to External Webapp
                        <button
                            onClick={() => {
                                window.location.href = 'http://localhost:3000/auth/sign-in?mode=electron';
                            }}
                            disabled={isLoading}
                            className="w-full flex items-center justify-center gap-3 py-3 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <User className="h-5 w-5" />
                            <span>{isLoading ? 'Redirecting...' : 'Sign in with Account'}</span>
                        </button>
                    )}

                    <div className="mt-4 text-center text-sm text-gray-500">Desktop app required for access. Please sync your session.</div>
                </div>

                <p className="text-center text-xs text-gray-500 mt-6">By using this app, you agree to our Terms of Service and Privacy Policy.</p>
            </div>
        </div>
    );
}
