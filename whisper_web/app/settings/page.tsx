'use client';

import { useState, useEffect } from 'react';
import { Cloud, HardDrive } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/utils/auth';
import { checkApiKeyStatus, saveApiKey } from '@/utils/api';
import SettingsTabs from '@/components/settings/SettingsTabs';
import { useRouter } from 'next/navigation';

declare global {
    interface Window {
        ipcRenderer?: any;
    }
}

export default function SettingsPage() {
    const { user: userInfo, isLoading, mode } = useAuth();
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

    const deriveInitials = (value: string) => {
        const trimmedValue = value.trim();
        if (!trimmedValue) {
            return '?';
        }

        const parts = trimmedValue.split(/\s+/).filter(Boolean);

        if (parts.length === 1) {
            const cleaned = parts[0].replace(/[^a-zA-Z0-9]/g, '');
            if (cleaned.length >= 1) {
                return cleaned.slice(0, 1).toUpperCase();
            }
            return parts[0].slice(0, 1).toUpperCase();
        }

        return parts
            .slice(0, 1)
            .map(part => part.charAt(0))
            .join('')
            .toUpperCase();
    };

    const normalizedDisplayName = userInfo.display_name.trim();
    const profileName = normalizedDisplayName.length > 0 ? normalizedDisplayName : userInfo.email;
    const profileInitials = deriveInitials(profileName);
    const modeBadgeLabel = isWebappMode ? 'Cloud authenticated' : 'Local mode';
    const modeSummary = isWebappMode ? 'Signed in with your Whisper web account.' : 'Running locally without cloud authentication.';
    const modeDetails = isWebappMode
        ? `All activity and settings sync with ${userInfo.email}.`
        : 'Everything stays on this device. Add a personal API key if you prefer using your own provider.';
    const pricingUrl = 'https://www.app-whisper.com/pricing';
    const planValue = (userInfo.plan || 'free').toLowerCase();
    const normalizedPlan = planValue.slice(0, 1).toUpperCase() + planValue.slice(1);
    const profileDetails: Array<{ label: string; value: string; href?: string }> = [
        { label: 'Display Name', value: profileName },
        { label: 'Primary Email', value: userInfo.email },
        { label: 'Account ID', value: userInfo.uid },
        { label: 'Current Plan', value: normalizedPlan, href: pricingUrl },
        { label: 'Sign-in Method', value: isWebappMode ? 'Whisper web account' : 'Local desktop session' },
        { label: 'Data Storage', value: isWebappMode ? 'Synced securely with Whisper services' : 'Stored locally on this device' },
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

                <SettingsTabs className="mb-8" />

                <div className="space-y-8 max-w-5xl">
                    <Card className="overflow-hidden">
                        <CardHeader className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex items-center gap-4">
                                <Avatar className="h-16 w-16 border border-border">
                                    <AvatarFallback className="text-lg font-semibold uppercase text-white">{profileInitials}</AvatarFallback>
                                </Avatar>
                                <div>
                                    <CardTitle className="text-2xl">{profileName}</CardTitle>
                                    <CardDescription>{modeSummary}</CardDescription>
                                </div>
                            </div>
                            <Badge variant={isWebappMode ? 'default' : 'secondary'} className="self-start sm:self-auto">
                                {modeBadgeLabel}
                            </Badge>
                        </CardHeader>
                        <CardContent className="pt-0">
                            <div className="grid gap-6 border-t border-border pt-6 sm:grid-cols-2">
                                {profileDetails.map(detail => {
                                    const isPlanDetail = detail.label === 'Current Plan' && detail.href;
                                    return (
                                        <div key={detail.label} className="space-y-1">
                                            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{detail.label}</p>
                                            {isPlanDetail ? (
                                                <a
                                                    href={detail.href}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-sm font-medium text-primary break-all cursor-pointer hover:underline"
                                                >
                                                    {detail.value}
                                                </a>
                                            ) : (
                                                <p className="text-sm font-medium text-foreground break-all">{detail.value}</p>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
