'use client';

import { ExternalLink } from 'lucide-react';
import { useRedirectIfNotAuth } from '@/utils/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import SettingsTabs from '@/components/settings/SettingsTabs';

export default function PrivacySettingsPage() {
    const userInfo = useRedirectIfNotAuth();

    if (!userInfo) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-600 mx-auto"></div>
                    <p className="mt-4 text-gray-600">Loading...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-stone-50 min-h-screen">
            <div className="px-8 py-8">
                <div className="mb-6">
                    <p className="text-xs text-gray-500 mb-1">Settings</p>
                    <h1 className="text-3xl font-bold text-gray-900">Data & Privacy</h1>
                </div>

                <SettingsTabs className="mb-8" />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Card className="flex flex-col">
                        <CardHeader className="flex-grow">
                            <CardTitle className="text-lg">Privacy Policy</CardTitle>
                            <CardDescription>Understand how we collect, use, and protect your personal information.</CardDescription>
                        </CardHeader>
                        <CardContent className="pt-0">
                            <Button
                                onClick={() => window.open('https://www.app-whisper.com/privacy', '_blank')}
                                variant="outline"
                                className="w-full"
                                rel="noopener noreferrer"
                            >
                                View Privacy Policy
                                <ExternalLink className="ml-2 h-4 w-4" />
                            </Button>
                        </CardContent>
                    </Card>

                    <Card className="flex flex-col">
                        <CardHeader className="flex-grow">
                            <CardTitle className="text-lg">Terms of Service</CardTitle>
                            <CardDescription>Understand your rights and responsibilities when using our platform.</CardDescription>
                        </CardHeader>
                        <CardContent className="pt-0">
                            <Button
                                onClick={() => window.open('https://www.app-whisper.com/terms', '_blank')}
                                variant="outline"
                                className="w-full"
                                rel="noopener noreferrer"
                            >
                                View Terms of Service
                                <ExternalLink className="ml-2 h-4 w-4" />
                            </Button>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
