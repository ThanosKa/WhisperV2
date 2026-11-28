'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { LogOut } from 'lucide-react';
import { normalizePathname } from '@/lib/path';
import { type MatchStrategy, SETTINGS_TABS } from '@/components/settings/SettingsTabs';
import { SidebarIcon } from './SidebarIcon';
import { ANIMATION_DURATION } from './useSidebarAnimation';

interface SubmenuItem {
    name: string;
    href: string;
    icon: string;
    ariaLabel?: string | undefined;
    matchStrategy?: MatchStrategy | undefined;
}

const ICON_BY_ID: Record<string, string> = {
    profile: '/user.svg',
    privacy: '/privacy.svg',
};

const ARIA_BY_ID: Record<string, string> = {
    profile: 'Personal profile settings',
    privacy: 'Data and privacy settings',
};

interface SidebarSettingsMenuProps {
    normalizedPath: string;
    isAuthenticatedUser: boolean;
    style: React.CSSProperties;
}

/** The settings pages under the Settings item, plus a login link for a guest. `style` animates its height. */
export function SidebarSettingsMenu({ normalizedPath, isAuthenticatedUser, style }: SidebarSettingsMenuProps) {
    const items = useMemo<SubmenuItem[]>(
        () =>
            SETTINGS_TABS.map(tab => ({
                name: tab.name,
                href: tab.href,
                icon: ICON_BY_ID[tab.id] ?? '/user.svg',
                ariaLabel: ARIA_BY_ID[tab.id],
                matchStrategy: tab.matchStrategy,
            })),
        []
    );

    return (
        <div id="settings-submenu" className="overflow-hidden" style={style} role="region" aria-labelledby="settings-button">
            <ul className="mt-[4px] space-y-0 pl-[22px]" role="menu">
                {items.map(subItem => {
                    const normalizedHref = normalizePathname(subItem.href);
                    const shouldMatch = subItem.matchStrategy === 'exact';
                    const matchesExact = normalizedPath === normalizedHref;
                    const matchesNested = !shouldMatch && normalizedPath.startsWith(`${normalizedHref}/`);
                    const isSubItemActive = matchesExact || matchesNested;

                    return (
                        <li key={subItem.name} role="none">
                            <Link
                                href={subItem.href}
                                className={`
                                  group flex items-center rounded-lg px-[12px] py-[8px] text-[13px] gap-x-[9px]
                      focus:outline-hidden
                                  ${isSubItemActive ? 'bg-[#f2f2f2] text-[#282828]' : 'text-[#282828] hover:text-[#282828] hover:bg-[#f7f7f7]'}
                      transition-colors duration-${ANIMATION_DURATION.COLOR_TRANSITION} ease-out
                                `}
                                style={{ willChange: 'background-color, color' }}
                                role="menuitem"
                                aria-label={subItem.ariaLabel || subItem.name}
                                aria-current={isSubItemActive ? 'page' : undefined}
                            >
                                <SidebarIcon icon={subItem.icon} alt={`${subItem.name} icon`} className="h-4 w-4 shrink-0" />
                                <span className="whitespace-nowrap">{subItem.name}</span>
                            </Link>
                        </li>
                    );
                })}
                {!isAuthenticatedUser && (
                    <li role="none">
                        <Link
                            href="/login"
                            className={`
                                group flex items-center rounded-lg px-[12px] py-[8px] text-[13px] gap-x-[9px]
                                text-[#282828] hover:text-[#282828] hover:bg-[#f7f7f7] w-full
                                transition-colors duration-${ANIMATION_DURATION.COLOR_TRANSITION} ease-out
                                focus:outline-hidden
                            `}
                            style={{ willChange: 'background-color, color' }}
                            role="menuitem"
                            aria-label="Login"
                        >
                            <LogOut className="h-3.5 w-3.5 shrink-0 transform -scale-x-100" aria-hidden="true" />
                            <span className="whitespace-nowrap">Login</span>
                        </Link>
                    </li>
                )}
            </ul>
        </div>
    );
}
