'use client';

import { useState } from 'react';
import { Check, Cloud, HardDrive } from 'lucide-react';
import { useRedirectIfNotAuth } from '@/utils/auth';
import { useAuth } from '@/utils/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import SettingsTabs from '@/components/settings/SettingsTabs';

type BillingCycle = 'monthly' | 'annually';

export default function BillingPage() {
    const userInfo = useRedirectIfNotAuth();
    const { mode } = useAuth();
    const [billingCycle, setBillingCycle] = useState<BillingCycle>('monthly');

    if (!userInfo) {
        return (
            <div className="min-h-screen bg-stone-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-600 mx-auto"></div>
                    <p className="mt-4 text-gray-600">Loading...</p>
                </div>
            </div>
        );
    }

    const isWebappMode = mode === 'webapp';

    return (
        <div className="bg-stone-50 min-h-screen">
            <div className="px-8 py-8">
                <div className="mb-6">
                    <p className="text-xs text-gray-500 mb-1">Settings</p>
                    <h1 className="text-3xl font-bold text-gray-900">Billing & Plans</h1>
                </div>

                <SettingsTabs className="mb-8" />

                <div className="space-y-8">
                    <div className="flex gap-2">
                        <Button onClick={() => setBillingCycle('monthly')} variant={billingCycle === 'monthly' ? 'default' : 'outline'} size="sm">
                            Monthly
                        </Button>
                        <Button onClick={() => setBillingCycle('annually')} variant={billingCycle === 'annually' ? 'default' : 'outline'} size="sm">
                            Annually
                        </Button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <Card className="relative">
                            <CardHeader>
                                <div className="flex items-center justify-between">
                                    <CardTitle className="text-xl">Free</CardTitle>
                                    <Badge variant="secondary">Current Plan</Badge>
                                </div>
                                <div className="text-3xl font-bold">
                                    $0<span className="text-lg font-normal text-muted-foreground">/month</span>
                                </div>
                                <CardDescription>Experience how Whisper works with unlimited responses.</CardDescription>
                            </CardHeader>

                            <CardContent className="space-y-4">
                                <ul className="space-y-3">
                                    <li className="flex items-center gap-3">
                                        <Check className="h-5 w-5 text-green-500" />
                                        <span className="text-sm">Daily unlimited responses</span>
                                    </li>
                                    <li className="flex items-center gap-3">
                                        <Check className="h-5 w-5 text-green-500" />
                                        <span className="text-sm">Unlimited access to free models</span>
                                    </li>
                                    <li className="flex items-center gap-3">
                                        <Check className="h-5 w-5 text-green-500" />
                                        <span className="text-sm">Unlimited text output</span>
                                    </li>
                                    <li className="flex items-center gap-3">
                                        <Check className="h-5 w-5 text-green-500" />
                                        <span className="text-sm">Screen viewing, audio listening</span>
                                    </li>
                                    <li className="flex items-center gap-3">
                                        <Check className="h-5 w-5 text-green-500" />
                                        <span className="text-sm">Custom system prompts</span>
                                    </li>
                                    <li className="flex items-center gap-3">
                                        <Check className="h-5 w-5 text-green-500" />
                                        <span className="text-sm">Community support only</span>
                                    </li>
                                </ul>

                                <Button className="w-full" variant="secondary" disabled>
                                    Current Plan
                                </Button>
                            </CardContent>
                        </Card>

                        <Card className="opacity-60">
                            <CardHeader>
                                <CardTitle className="text-xl">Pro</CardTitle>
                                <div className="text-3xl font-bold">
                                    $25<span className="text-lg font-normal text-muted-foreground">/month</span>
                                </div>
                                <CardDescription>Use latest models, get full response output, and work with custom prompts.</CardDescription>
                            </CardHeader>

                            <CardContent className="space-y-4">
                                <ul className="space-y-3">
                                    <li className="flex items-center gap-3">
                                        <Check className="h-5 w-5 text-green-500" />
                                        <span className="text-sm">Unlimited pro responses</span>
                                    </li>
                                    <li className="flex items-center gap-3">
                                        <Check className="h-5 w-5 text-green-500" />
                                        <span className="text-sm">Unlimited access to latest models</span>
                                    </li>
                                    <li className="flex items-center gap-3">
                                        <Check className="h-5 w-5 text-green-500" />
                                        <span className="text-sm">Full access to conversation dashboard</span>
                                    </li>
                                    <li className="flex items-center gap-3">
                                        <Check className="h-5 w-5 text-green-500" />
                                        <span className="text-sm">Priority support</span>
                                    </li>
                                    <li className="flex items-center gap-3">
                                        <Check className="h-5 w-5 text-green-500" />
                                        <span className="text-sm">All features from free plan</span>
                                    </li>
                                </ul>

                                <Button className="w-full" disabled>
                                    Coming Soon
                                </Button>
                            </CardContent>
                        </Card>

                        <Card className="opacity-60">
                            <CardHeader>
                                <CardTitle className="text-xl">Enterprise</CardTitle>
                                <div className="text-xl font-semibold">Custom</div>
                                <CardDescription>Specially crafted for teams that need complete customization.</CardDescription>
                            </CardHeader>

                            <CardContent className="space-y-4">
                                <ul className="space-y-3">
                                    <li className="flex items-center gap-3">
                                        <Check className="h-5 w-5 text-green-400" />
                                        <span className="text-sm">Custom integrations</span>
                                    </li>
                                    <li className="flex items-center gap-3">
                                        <Check className="h-5 w-5 text-green-400" />
                                        <span className="text-sm">User provisioning & role-based access</span>
                                    </li>
                                    <li className="flex items-center gap-3">
                                        <Check className="h-5 w-5 text-green-400" />
                                        <span className="text-sm">Advanced post-call analytics</span>
                                    </li>
                                    <li className="flex items-center gap-3">
                                        <Check className="h-5 w-5 text-green-400" />
                                        <span className="text-sm">Single sign-on</span>
                                    </li>
                                    <li className="flex items-center gap-3">
                                        <Check className="h-5 w-5 text-green-400" />
                                        <span className="text-sm">Advanced security features</span>
                                    </li>
                                    <li className="flex items-center gap-3">
                                        <Check className="h-5 w-5 text-green-400" />
                                        <span className="text-sm">Centralized billing</span>
                                    </li>
                                </ul>

                                <Button className="w-full" variant="secondary" disabled>
                                    Coming Soon
                                </Button>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </div>
        </div>
    );
}
