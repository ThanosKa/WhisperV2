'use client';

import { useState, useEffect } from 'react';
import { Check, Cloud, HardDrive } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useAuth } from '@/utils/auth';
import { UserProfile, getUserProfile, updateUserProfile, checkApiKeyStatus, saveApiKey, deleteAccount, logout } from '@/utils/api';
import { useRouter } from 'next/navigation';

declare global {
    interface Window {
        ipcRenderer?: any;
    }
}

type BillingCycle = 'monthly' | 'annually';

export default function SettingsPage() {
    const { user: userInfo, isLoading, mode } = useAuth();
    const [billingCycle, setBillingCycle] = useState<BillingCycle>('monthly');
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [hasApiKey, setHasApiKey] = useState(false);
    const [apiKeyInput, setApiKeyInput] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [displayNameInput, setDisplayNameInput] = useState('');
    const router = useRouter();

    const fetchApiKeyStatus = async () => {
        try {
            const apiKeyStatus = await checkApiKeyStatus();
            setHasApiKey(apiKeyStatus.hasApiKey);
        } catch (error) {
            console.error('Failed to fetch API key status:', error);
        }
    };

    useEffect(() => {
        if (!userInfo) return;

        const fetchProfileData = async () => {
            try {
                const userProfile = await getUserProfile();
                setProfile(userProfile);
                setDisplayNameInput(userProfile.display_name);
                await fetchApiKeyStatus();
            } catch (error) {
                console.error('Failed to fetch profile data:', error);
            }
        };
        fetchProfileData();

        if (window.ipcRenderer) {
            window.ipcRenderer.on('api-key-updated', () => {
                console.log('Received api-key-updated event from main process.');
                fetchApiKeyStatus();
            });
        }

        return () => {
            if (window.ipcRenderer) {
                window.ipcRenderer.removeAllListeners('api-key-updated');
            }
        };
    }, [userInfo]);

    if (isLoading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-600 mx-auto"></div>
                    <p className="mt-4 text-gray-600">Loading...</p>
                </div>
            </div>
        );
    }

    if (!userInfo) {
        router.push('/login');
        return null;
    }

    const isWebappMode = mode === 'webapp';

    const tabs = [
        { id: 'profile', name: 'Personal Profile', href: '/settings' },
        { id: 'privacy', name: 'Data & Privacy', href: '/settings/privacy' },
        { id: 'billing', name: 'Billing', href: '/settings/billing' },
    ];

    const handleSaveApiKey = async () => {
        setIsSaving(true);
        try {
            await saveApiKey(apiKeyInput);
            setHasApiKey(true);
            setApiKeyInput('');
            if (window.ipcRenderer) {
                window.ipcRenderer.invoke('save-api-key', apiKeyInput);
            }
        } catch (error) {
            console.error('Failed to save API key:', error);
        } finally {
            setIsSaving(false);
        }
    };

    const handleUpdateDisplayName = async () => {
        if (!profile || displayNameInput === profile.display_name) return;
        setIsSaving(true);
        try {
            await updateUserProfile({ displayName: displayNameInput });
            setProfile(prev => (prev ? { ...prev, display_name: displayNameInput } : null));
        } catch (error) {
            console.error('Failed to update display name:', error);
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteAccount = async () => {
        const confirmMessage = isWebappMode
            ? 'Are you sure you want to delete your account? This action cannot be undone and all local data will be cleared.'
            : 'Are you sure you want to delete your account? This action cannot be undone and all data will be deleted.';

        if (window.confirm(confirmMessage)) {
            try {
                await deleteAccount();
                router.push('/login');
            } catch (error) {
                console.error('Failed to delete account:', error);
            }
        }
    };

    const handleLogout = async () => {
        try {
            await logout();
        } catch (error) {
            console.error('Logout failed:', error);
        }
    };

    return (
        <div className="bg-stone-50 min-h-screen">
            <div className="px-8 py-8">
                <div className="mb-6">
                    <p className="text-xs text-gray-500 mb-1">Settings</p>
                    <h1 className="text-3xl font-bold text-gray-900">Personal Settings</h1>
                </div>

                <div className="mb-8">
                    <nav className="flex space-x-10">
                        {tabs.map(tab => (
                            <a
                                key={tab.id}
                                href={tab.href}
                                className={`pb-4 px-2 border-b-2 font-medium text-sm transition-colors ${
                                    tab.id === 'profile'
                                        ? 'border-gray-900 text-gray-900'
                                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                                }`}
                            >
                                {tab.name}
                            </a>
                        ))}
                    </nav>
                </div>

                <div className="space-y-6">
                    <div className={`p-4 rounded-lg border ${isWebappMode ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-200'}`}>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                {isWebappMode ? <Cloud className="h-5 w-5 text-blue-600" /> : <HardDrive className="h-5 w-5 text-gray-600" />}
                                <div>
                                    <h3 className={`font-semibold ${isWebappMode ? 'text-blue-900' : 'text-gray-900'}`}>
                                        {isWebappMode ? 'Webapp Authenticated Mode' : 'Local Execution Mode'}
                                    </h3>
                                    <p className={`text-sm ${isWebappMode ? 'text-blue-700' : 'text-gray-700'} mb-2`}>
                                        {isWebappMode ? `Logged in with webapp account (${userInfo.email})` : 'Running as local user'}
                                    </p>
                                    <Badge variant={isWebappMode ? 'default' : 'secondary'}>{isWebappMode ? 'Cloud Auth' : 'Local Mode'}</Badge>
                                </div>
                            </div>
                            {isWebappMode && (
                                <Button onClick={handleLogout} variant="ghost" size="sm" className="text-blue-600 hover:text-blue-700">
                                    Logout
                                </Button>
                            )}
                        </div>
                    </div>

                    <div className="bg-white border border-gray-200 rounded-lg p-6">
                        <h3 className="text-lg font-semibold text-gray-900 mb-1">Display Name</h3>
                        <p className="text-sm text-gray-600 mb-4">Enter your full name or a display name you're comfortable using.</p>
                        <div className="max-w-sm">
                            <Input
                                type="text"
                                id="display-name"
                                value={displayNameInput}
                                onChange={e => setDisplayNameInput(e.target.value)}
                                maxLength={32}
                            />
                            <p className="text-xs text-muted-foreground mt-2">You can use up to 32 characters.</p>
                        </div>
                        <div className="mt-4 pt-4 border-t border-gray-200 flex justify-end">
                            <Button
                                onClick={handleUpdateDisplayName}
                                disabled={isSaving || !displayNameInput || displayNameInput === profile?.display_name}
                            >
                                Update
                            </Button>
                        </div>
                    </div>

                    {!isWebappMode && (
                        <div className="bg-white border border-gray-200 rounded-lg p-6">
                            <h3 className="text-lg font-semibold text-gray-900 mb-1">API Key</h3>
                            <p className="text-sm text-gray-600 mb-4">
                                If you want to use your own LLM API key, you can add it here. It will be used for all requests made by the local
                                application.
                            </p>

                            <div className="max-w-sm">
                                <label htmlFor="api-key" className="block text-sm font-medium text-gray-700 mb-1">
                                    API Key
                                </label>
                                <div className="flex gap-2">
                                    <Input
                                        type="password"
                                        id="api-key"
                                        value={apiKeyInput}
                                        onChange={e => setApiKeyInput(e.target.value)}
                                        placeholder="Enter new API key or existing API key"
                                        className="flex-1"
                                    />
                                </div>
                                <div className="mt-2">
                                    <Badge variant={hasApiKey ? 'default' : 'secondary'}>{hasApiKey ? 'API Key Set' : 'Using Free System'}</Badge>
                                </div>
                            </div>

                            <div className="mt-4 pt-4 border-t border-gray-200 flex justify-end">
                                <Button onClick={handleSaveApiKey} disabled={isSaving || !apiKeyInput}>
                                    {isSaving ? 'Saving...' : 'Save'}
                                </Button>
                            </div>
                        </div>
                    )}

                    {(isWebappMode || (!isWebappMode && !hasApiKey)) && (
                        <div className="bg-white border border-red-300 rounded-lg p-6">
                            <h3 className="text-lg font-semibold text-gray-900 mb-1">Delete Account</h3>
                            <p className="text-sm text-gray-600 mb-4">
                                {isWebappMode
                                    ? 'Permanently remove your webapp account and all content. This action cannot be undone, so please proceed carefully.'
                                    : 'Permanently remove your personal account and all content from the Pickle Glass platform. This action cannot be undone, so please proceed carefully.'}
                            </p>
                            <div className="mt-4 pt-4 border-t border-gray-200 flex justify-end">
                                <Button onClick={handleDeleteAccount} variant="destructive">
                                    Delete
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
