'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { normalizePathname } from '@/utils/path';
import { cn } from '@/lib/utils';

export type MatchStrategy = 'exact' | 'startsWith';

type SettingsTab = {
    id: string;
    name: string;
    href: string;
    matchStrategy?: MatchStrategy;
};

const withTrailingSlash = (href: string) => (href.endsWith('/') ? href : `${href}/`);

export const SETTINGS_TABS: SettingsTab[] = [
    { id: 'profile', name: 'Personal Profile', href: '/settings', matchStrategy: 'exact' },
    { id: 'privacy', name: 'Data & Privacy', href: '/settings/privacy' },
    { id: 'billing', name: 'Billing', href: '/settings/billing' },
];

export default function SettingsTabs({ className }: { className?: string }) {
    const pathname = usePathname();
    const normalizedPath = normalizePathname(pathname);

    return (
        <nav className={cn('flex space-x-10', className)}>
            {SETTINGS_TABS.map(tab => {
                const normalizedHref = normalizePathname(tab.href);
                const shouldMatch = tab.matchStrategy === 'exact';
                const matchesExact = normalizedPath === normalizedHref;
                const matchesNested = !shouldMatch && normalizedPath.startsWith(`${normalizedHref}/`);
                const isActive = matchesExact || matchesNested;

                return (
                    <Link
                        key={tab.id}
                        href={withTrailingSlash(tab.href)}
                        className={cn(
                            'pb-4 px-2 border-b-2 font-medium text-sm transition-colors',
                            isActive
                                ? 'border-gray-900 text-gray-900'
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                        )}
                        aria-current={isActive ? 'page' : undefined}
                    >
                        {tab.name}
                    </Link>
                );
            })}
        </nav>
    );
}
