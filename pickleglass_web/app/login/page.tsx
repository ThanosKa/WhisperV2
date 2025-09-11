'use client';

import { useRouter } from 'next/navigation';
import { Chrome } from 'lucide-react';
import { useState, useEffect } from 'react';

// Webapp configuration
const WEBAPP_CONFIG = {
    loginUrl: 'http://localhost:3000/auth/sign-in?mode=electron',
};

export default function LoginPage() {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);
    const [isElectronMode, setIsElectronMode] = useState(false);

    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const mode = urlParams.get('mode');
        setIsElectronMode(mode === 'electron');
    }, []);

    const handleWebappSignIn = async () => {
        setIsLoading(true);

        try {
            // Redirect to the deployed webapp for authentication
            console.log('🔗 Redirecting to webapp for authentication:', WEBAPP_CONFIG.loginUrl);
            window.location.href = WEBAPP_CONFIG.loginUrl;
        } catch (error) {
            console.error('❌ Failed to redirect to webapp:', error);
            alert('Failed to open authentication page. Please try again.');
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center">
            <div className="text-center mb-8">
                <h1 className="text-3xl font-bold text-gray-900">Welcome to Pickle Glass</h1>
                <p className="text-gray-600 mt-2">Sign in with your account to sync your data across all devices.</p>
                {isElectronMode ? (
                    <p className="text-sm text-blue-600 mt-1 font-medium">🔗 Login requested from Electron app</p>
                ) : (
                    <p className="text-sm text-gray-500 mt-1">Local mode will run if you don't sign in.</p>
                )}
            </div>

            <div className="w-full max-w-sm">
                <div className="bg-white p-8 rounded-lg shadow-md border border-gray-200">
                    <button
                        onClick={handleWebappSignIn}
                        disabled={isLoading}
                        className="w-full flex items-center justify-center gap-3 py-3 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Chrome className="h-5 w-5" />
                        <span>{isLoading ? 'Redirecting...' : 'Sign in with Whisper Account'}</span>
                    </button>

                    <div className="mt-4 text-center">
                        <button
                            onClick={() => {
                                if (isElectronMode) {
                                    window.location.href =
                                        'pickleglass://auth-success?sessionUuid=local&uid=default_user&email=contact@pickle.com&displayName=Default%20User';
                                } else {
                                    router.push('/settings');
                                }
                            }}
                            className="text-sm text-gray-500 hover:text-gray-700 underline"
                        >
                            Continue in local mode
                        </button>
                    </div>
                </div>

                <p className="text-center text-xs text-gray-500 mt-6">By signing in, you agree to our Terms of Service and Privacy Policy.</p>
            </div>
        </div>
    );
}
