'use client';

import { useState, useEffect } from 'react';
import { Check, Cloud, HardDrive } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useAuth } from '@/utils/auth';
import { checkApiKeyStatus, saveApiKey, logout } from '@/utils/api';
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
    const [hasApiKey, setHasApiKey] = useState(false);
    const [apiKeyInput, setApiKeyInput] = useState('');
    const [isSaving, setIsSaving] = useState(false);
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

        fetchApiKeyStatus();

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

    // Display name and account deletion are disabled in the localhost webapp

    // Logout is desktop-only; UI removed in localhost webapp

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
                            {/* Logout button removed in localhost webapp */}
                        </div>
                    </div>

                    {/* Display Name section intentionally removed in localhost webapp */}

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

                    {/* Delete Account section intentionally removed in localhost webapp */}
                </div>
            </div>
        </div>
    );
}
