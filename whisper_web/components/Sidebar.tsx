'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import Image from 'next/image';
import { useState, createElement, useEffect, useMemo, useCallback, memo } from 'react';
import { Search, Activity, HelpCircle, Download, ChevronDown, User, Shield, Database, CreditCard, LogOut, LucideIcon } from 'lucide-react';
import { UserProfile, checkApiKeyStatus } from '@/utils/api';
import { useAuth } from '@/utils/auth';
import { normalizePathname } from '@/utils/path';
import { MatchStrategy, SETTINGS_TABS } from '@/components/settings/SettingsTabs';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

const ANIMATION_DURATION = {
    SIDEBAR: 500,
    TEXT: 300,
    SUBMENU: 500,
    ICON_HOVER: 200,
    COLOR_TRANSITION: 200,
    HOVER_SCALE: 200,
} as const;

const DIMENSIONS = {
    SIDEBAR_EXPANDED: 220,
    SIDEBAR_COLLAPSED: 64,
    ICON_SIZE: 18,
    USER_AVATAR_SIZE: 32,
    HEADER_HEIGHT: 64,
} as const;

const ANIMATION_DELAYS = {
    BASE: 0,
    INCREMENT: 50,
    TEXT_BASE: 250,
    SUBMENU_INCREMENT: 30,
} as const;

interface NavigationItem {
    name: string;
    href?: string;
    action?: () => void;
    icon: LucideIcon | string;
    isLucide: boolean;
    hasSubmenu?: boolean;
    ariaLabel?: string;
}

interface SubmenuItem {
    name: string;
    href: string;
    icon: LucideIcon | string;
    isLucide: boolean;
    ariaLabel?: string;
    matchStrategy?: MatchStrategy;
}

interface SidebarProps {
    isCollapsed: boolean;
    onToggle: (collapsed: boolean) => void;
    onSearchClick?: () => void;
}

interface BottomNavigationItem {
    href: string;
    icon: string;
    text: string;
    ariaLabel: string;
}

interface AnimationStyles {
    text: React.CSSProperties;
    submenu: React.CSSProperties;
    sidebarContainer: React.CSSProperties;
    textContainer: React.CSSProperties;
}

const useAnimationStyles = (isCollapsed: boolean) => {
    const [isAnimating, setIsAnimating] = useState(false);

    useEffect(() => {
        setIsAnimating(true);
        const timer = setTimeout(() => setIsAnimating(false), ANIMATION_DURATION.SIDEBAR);
        return () => clearTimeout(timer);
    }, [isCollapsed]);

    const getTextAnimationStyle = useCallback(
        (delay = 0): React.CSSProperties => ({
            willChange: 'opacity',
            transition: `opacity ${ANIMATION_DURATION.TEXT}ms ease-out`,
            transitionDelay: `${delay}ms`,
            opacity: isCollapsed ? 0 : 1,
            pointerEvents: isCollapsed ? 'none' : 'auto',
        }),
        [isCollapsed]
    );

    const getSubmenuAnimationStyle = useCallback(
        (isExpanded: boolean): React.CSSProperties => ({
            willChange: 'opacity, max-height',
            transition: `all ${ANIMATION_DURATION.SUBMENU}ms cubic-bezier(0.25, 0.46, 0.45, 0.94)`,
            maxHeight: isCollapsed || !isExpanded ? '0px' : '400px',
            opacity: isCollapsed || !isExpanded ? 0 : 1,
        }),
        [isCollapsed]
    );

    const sidebarContainerStyle: React.CSSProperties = useMemo(
        () => ({
            willChange: 'width',
            transition: `width ${ANIMATION_DURATION.SIDEBAR}ms cubic-bezier(0.4, 0, 0.2, 1)`,
        }),
        []
    );

    const getTextContainerStyle = useCallback(
        (): React.CSSProperties => ({
            width: isCollapsed ? '0px' : '150px',
            overflow: 'hidden',
            transition: `width ${ANIMATION_DURATION.SIDEBAR}ms cubic-bezier(0.4, 0, 0.2, 1)`,
        }),
        [isCollapsed]
    );

    const getUniformTextStyle = useCallback(
        (): React.CSSProperties => ({
            willChange: 'opacity',
            opacity: isCollapsed ? 0 : 1,
            transition: `opacity 300ms ease ${isCollapsed ? '0ms' : '200ms'}`,
            whiteSpace: 'nowrap' as const,
        }),
        [isCollapsed]
    );

    return {
        isAnimating,
        getTextAnimationStyle,
        getSubmenuAnimationStyle,
        sidebarContainerStyle,
        getTextContainerStyle,
        getUniformTextStyle,
    };
};

const IconComponent = memo<{
    icon: LucideIcon | string;
    isLucide: boolean;
    alt: string;
    className?: string;
}>(({ icon, isLucide, alt, className = 'h-[18px] w-[18px] transition-transform duration-200' }) => {
    if (isLucide) {
        return createElement(icon as LucideIcon, { className, 'aria-hidden': true });
    }

    return <Image src={icon as string} alt={alt} width={18} height={18} className={className} loading="lazy" />;
});

IconComponent.displayName = 'IconComponent';

const SidebarComponent = ({ isCollapsed, onToggle, onSearchClick }: SidebarProps) => {
    const pathname = usePathname();
    const normalizedPath = normalizePathname(pathname);
    const router = useRouter();
    const [isSettingsExpanded, setIsSettingsExpanded] = useState(pathname.startsWith('/settings'));
    const { user: userInfo, isLoading: authLoading } = useAuth();
    const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);

    const { isAnimating, getTextAnimationStyle, getSubmenuAnimationStyle, sidebarContainerStyle, getTextContainerStyle, getUniformTextStyle } =
        useAnimationStyles(isCollapsed);

    useEffect(() => {
        checkApiKeyStatus()
            .then(status => setHasApiKey(status.hasApiKey))
            .catch(err => {
                console.error('Failed to check API key status:', err);
                setHasApiKey(null); // Set to null on error
            });
    }, []);

    useEffect(() => {
        if (pathname.startsWith('/settings')) {
            setIsSettingsExpanded(true);
        }
    }, [pathname]);

    const navigation = useMemo<NavigationItem[]>(
        () => [
            {
                name: 'Search',
                action: onSearchClick,
                icon: '/search.svg',
                isLucide: false,
                ariaLabel: 'Open search',
            },
            {
                name: 'My Activity',
                href: '/activity',
                icon: '/activity.svg',
                isLucide: false,
                ariaLabel: 'View my activity',
            },
            {
                name: 'Personalize',
                href: '/personalize',
                icon: '/book.svg',
                isLucide: false,
                ariaLabel: 'Personalization settings',
            },
            {
                name: 'Settings',
                href: '/settings',
                icon: '/setting.svg',
                isLucide: false,
                hasSubmenu: true,
                ariaLabel: 'Settings menu',
            },
        ],
        [onSearchClick]
    );

    const settingsSubmenu = useMemo<SubmenuItem[]>(() => {
        const iconById: Record<string, string> = {
            profile: '/user.svg',
            privacy: '/privacy.svg',
            billing: '/credit-card.svg',
        };

        const ariaById: Record<string, string> = {
            profile: 'Personal profile settings',
            privacy: 'Data and privacy settings',
            billing: 'Billing settings',
        };

        return SETTINGS_TABS.map(tab => ({
            name: tab.name,
            href: tab.href,
            icon: iconById[tab.id] ?? '/user.svg',
            isLucide: false,
            ariaLabel: ariaById[tab.id],
            matchStrategy: tab.matchStrategy,
        }));
    }, []);

    const bottomItems = useMemo<BottomNavigationItem[]>(() => [], []);

    const toggleSidebar = useCallback(() => {
        onToggle(!isCollapsed);
    }, [isCollapsed, onToggle]);

    const toggleSettings = useCallback(() => {
        if (!pathname.startsWith('/settings')) {
            setIsSettingsExpanded(prev => !prev);
        }
    }, [pathname]);

    // Logout is desktop-only; remove handler in localhost webapp
    const handleLogout = useCallback(async () => {
        return;
    }, []);

    const handleKeyDown = useCallback((event: React.KeyboardEvent, action?: () => void) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            action?.();
        }
    }, []);

    const renderNavigationItem = useCallback(
        (item: NavigationItem, index: number) => {
            const isActive = item.href ? normalizedPath === item.href || normalizedPath.startsWith(`${item.href}/`) : false;
            const animationDelay = 0;

            const baseButtonClasses = `
      group flex items-center rounded-[8px] px-[12px] py-[10px] text-[14px] text-[#282828] w-full relative
      transition-colors duration-${ANIMATION_DURATION.COLOR_TRANSITION} ease-out
      focus:outline-none
    `;

            const getStateClasses = (isActive: boolean) =>
                isActive ? 'bg-[#f2f2f2] text-[#282828]' : 'text-[#282828] hover:text-[#282828] hover:bg-[#f7f7f7]';

            if (item.action) {
                return (
                    <li key={item.name}>
                        <Button
                            onClick={item.action}
                            onKeyDown={e => handleKeyDown(e, item.action)}
                            variant="ghost"
                            className={`${baseButtonClasses} ${getStateClasses(false)} justify-start h-auto py-[10px] px-[12px]`}
                            title={isCollapsed ? item.name : undefined}
                            aria-label={item.ariaLabel || item.name}
                            style={{ willChange: 'background-color, color' }}
                        >
                            <div className="shrink-0 flex items-center justify-center w-5 h-5">
                                <IconComponent icon={item.icon} isLucide={item.isLucide} alt={`${item.name} icon`} />
                            </div>

                            <div className="ml-[12px] overflow-hidden" style={getTextContainerStyle()}>
                                <span className="block text-left" style={getUniformTextStyle()}>
                                    {item.name}
                                </span>
                            </div>
                        </Button>
                    </li>
                );
            }

            if (item.hasSubmenu) {
                return (
                    <li key={item.name}>
                        <button
                            onClick={toggleSettings}
                            onKeyDown={e => handleKeyDown(e, toggleSettings)}
                            className={`${baseButtonClasses} ${getStateClasses(isActive)}`}
                            title={isCollapsed ? item.name : undefined}
                            aria-label={item.ariaLabel || item.name}
                            aria-expanded={isSettingsExpanded}
                            aria-controls="settings-submenu"
                            style={{ willChange: 'background-color, color' }}
                        >
                            <div className="shrink-0 flex items-center justify-center w-5 h-5">
                                <IconComponent icon={item.icon} isLucide={item.isLucide} alt={`${item.name} icon`} />
                            </div>

                            <div className="ml-[12px] overflow-hidden flex items-center" style={getTextContainerStyle()}>
                                <span className="flex-1 text-left" style={getUniformTextStyle()}>
                                    {item.name}
                                </span>
                                <ChevronDown
                                    className="h-3 w-3 ml-1.5 shrink-0"
                                    aria-hidden="true"
                                    style={{
                                        willChange: 'transform, opacity',
                                        transition: `all ${ANIMATION_DURATION.HOVER_SCALE}ms cubic-bezier(0.4, 0, 0.2, 1)`,
                                        transform: `rotate(${isSettingsExpanded ? 180 : 0}deg) ${isCollapsed ? 'scale(0)' : 'scale(1)'}`,
                                        opacity: isCollapsed ? 0 : 1,
                                    }}
                                />
                            </div>
                        </button>

                        <div
                            id="settings-submenu"
                            className="overflow-hidden"
                            style={getSubmenuAnimationStyle(isSettingsExpanded)}
                            role="region"
                            aria-labelledby="settings-button"
                        >
                            <ul className="mt-[4px] space-y-0 pl-[22px]" role="menu">
                                {settingsSubmenu.map((subItem, subIndex) => {
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
                      focus:outline-none
                                  ${isSubItemActive ? 'bg-[#f2f2f2] text-[#282828]' : 'text-[#282828] hover:text-[#282828] hover:bg-[#f7f7f7]'}
                      transition-colors duration-${ANIMATION_DURATION.COLOR_TRANSITION} ease-out
                                `}
                                                style={{
                                                    willChange: 'background-color, color',
                                                }}
                                                role="menuitem"
                                                aria-label={subItem.ariaLabel || subItem.name}
                                                aria-current={isSubItemActive ? 'page' : undefined}
                                            >
                                                <IconComponent
                                                    icon={subItem.icon}
                                                    isLucide={subItem.isLucide}
                                                    alt={`${subItem.name} icon`}
                                                    className="h-4 w-4 shrink-0"
                                                />
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
                                                focus:outline-none
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
                    </li>
                );
            }

            return (
                <li key={item.name}>
                    <Link
                        href={item.href || '#'}
                        className={`
                        group flex items-center rounded-[8px] text-[14px] px-[12px] py-[10px] relative
            focus:outline-none
            ${getStateClasses(isActive)}
            transition-colors duration-${ANIMATION_DURATION.COLOR_TRANSITION} ease-out
                        ${isCollapsed ? '' : ''}
                      `}
                        title={isCollapsed ? item.name : undefined}
                        aria-label={item.ariaLabel || item.name}
                        style={{ willChange: 'background-color, color' }}
                    >
                        <div className="shrink-0 flex items-center justify-center w-5 h-5">
                            <IconComponent icon={item.icon} isLucide={item.isLucide} alt={`${item.name} icon`} />
                        </div>

                        <div className="ml-[12px] overflow-hidden" style={getTextContainerStyle()}>
                            <span className="block text-left" style={getUniformTextStyle()}>
                                {item.name}
                            </span>
                        </div>
                    </Link>
                </li>
            );
        },
        [
            normalizedPath,
            isCollapsed,
            isSettingsExpanded,
            toggleSettings,
            handleLogout,
            handleKeyDown,
            getUniformTextStyle,
            getTextContainerStyle,
            getSubmenuAnimationStyle,
            settingsSubmenu,
        ]
    );

    const getUserDisplayName = useCallback(() => {
        if (authLoading) return 'Loading...';
        return userInfo?.display_name || 'Guest';
    }, [userInfo, authLoading]);

    const getUserInitial = useCallback(() => {
        if (authLoading) return 'L';
        return userInfo?.display_name ? userInfo.display_name.charAt(0).toUpperCase() : 'G';
    }, [userInfo, authLoading]);

    const isAuthenticatedUser = userInfo && userInfo.uid !== 'default_user';

    return (
        <aside
            className={`flex h-full flex-col bg-white border-r py-3 px-2 border-[#e5e5e5] relative ${isCollapsed ? 'w-[60px]' : 'w-[220px]'}`}
            style={sidebarContainerStyle}
            role="navigation"
            aria-label="main navigation"
            aria-expanded={!isCollapsed}
        >
            <header className={`group relative h-6 flex shrink-0 items-center justify-between px-3`}>
                {isCollapsed ? (
                    <div className="flex w-full items-center justify-center">
                        {/* The button below will be shown on hover and cover this */}
                        <span className="font-semibold text-black">W</span>
                        <button
                            onClick={toggleSidebar}
                            onKeyDown={e => handleKeyDown(e, toggleSidebar)}
                            className="absolute inset-0 flex items-center justify-center rounded-md text-gray-500 opacity-0 scale-90 transition-all duration-300 ease-out hover:text-gray-800 group-hover:opacity-100 group-hover:scale-100 focus:outline-none"
                            aria-label="Open sidebar"
                        >
                            <Image src="/unfold.svg" alt="Open" width={18} height={18} className="h-4.5 w-4.5" />
                        </button>
                    </div>
                ) : (
                    <>
                        <span className="text-lg font-semibold text-black">Whisper</span>
                        <button
                            onClick={toggleSidebar}
                            onKeyDown={e => handleKeyDown(e, toggleSidebar)}
                            className="h-6 w-6 rounded-[4px] p-1 text-gray-500 transition-colors hover:bg-[#f7f7f7] hover:text-gray-800 focus:outline-none"
                            aria-label="Close sidebar"
                        >
                            <Image src="/unfold.svg" alt="Close" width={16} height={16} className="transform rotate-180" />
                        </button>
                    </>
                )}
            </header>

            <nav className="flex flex-1 flex-col pt-8" role="navigation" aria-label="Main menu">
                <ul role="list" className="flex flex-1 flex-col">
                    <li>
                        <ul role="list" className="">
                            {navigation.map(renderNavigationItem)}
                        </ul>
                    </li>
                </ul>

                <button
                    onClick={toggleSidebar}
                    onKeyDown={e => handleKeyDown(e, toggleSidebar)}
                    className={`${
                        isCollapsed ? '' : 'opacity-0'
                    } "absolute inset-0 flex items-center justify-center w-full h-[36px] mb-[8px] rounded-[20px] flex justify-center items-center text-gray-500 hover:text-gray-800 rounded-md scale-90 group-hover:opacity-100 group-hover:scale-100 transition-all duration-300 ease-out focus:outline-none`}
                    aria-label="Open sidebar"
                >
                    <div className="w-[36px] h-[36px] flex items-center justify-center bg-[#f7f7f7] rounded-[20px]">
                        <Image src="/unfold.svg" alt="Open" width={18} height={18} className="h-4.5 w-4.5" />
                    </div>
                </button>

                {!isCollapsed && hasApiKey !== null && (
                    <div className="px-2.5 py-2 text-center">
                        <span className={`text-xs px-2 py-1 rounded-full ${hasApiKey ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}`}>
                            {hasApiKey ? 'Local running' : 'Whisper Free System'}
                        </span>
                    </div>
                )}

                <div className="mt-auto space-y-[0px]" role="navigation" aria-label="Additional links">
                    {bottomItems.map((item, index) => (
                        <Link
                            key={item.text}
                            href={item.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`
                group flex items-center rounded-[6px] px-[12px] py-[8px] text-[13px] text-[#282828]
                hover:text-[#282828] hover:bg-[#f7f7f7] ${isCollapsed ? '' : 'gap-x-[10px]'}
                transition-colors duration-${ANIMATION_DURATION.COLOR_TRANSITION} ease-out 
                focus:outline-none
              `}
                            title={isCollapsed ? item.text : undefined}
                            aria-label={item.ariaLabel}
                            style={{ willChange: 'background-color, color' }}
                        >
                            <div className=" overflow-hidden">
                                <span className="" style={getUniformTextStyle()}>
                                    {item.text}
                                </span>
                            </div>
                            <div className="shrink-0 flex items-center justify-center w-4 h-4">
                                <IconComponent
                                    icon={item.icon}
                                    isLucide={false}
                                    alt={`${item.text} icon`}
                                    className={`h-[16px] w-[16px] transition-transform duration-${ANIMATION_DURATION.ICON_HOVER}`}
                                />
                            </div>
                        </Link>
                    ))}
                </div>

                <div className="mt-[0px] flex items-center w-full h-[1px] px-[4px] mt-[8px] mb-[8px]">
                    <div className="w-full h-[1px] bg-[#d9d9d9]"></div>
                </div>

                <div
                    className={`mt-[0px] flex items-center ${isCollapsed ? '' : 'gap-x-[10px]'}`}
                    style={{
                        padding: isCollapsed ? '6px 8px' : '6px 8px',
                        justifyContent: isCollapsed ? 'flex-start' : 'flex-start',
                        transition: `all ${ANIMATION_DURATION.SIDEBAR}ms cubic-bezier(0.4, 0, 0.2, 1)`,
                    }}
                    role="region"
                    aria-label="User profile"
                >
                    <Avatar
                        className="h-[30px] w-[30px] cursor-pointer hover:bg-muted transition-colors"
                        title={getUserDisplayName()}
                        tabIndex={0}
                        role="button"
                        aria-label={`User: ${getUserDisplayName()}`}
                        onKeyDown={e =>
                            handleKeyDown(e, () => {
                                if (isAuthenticatedUser) {
                                    router.push('/settings');
                                } else {
                                    router.push('/login');
                                }
                            })
                        }
                        onClick={() => {
                            if (isAuthenticatedUser) {
                                router.push('/settings');
                            } else {
                                router.push('/login');
                            }
                        }}
                    >
                        <AvatarFallback className="text-xs text-white">{getUserInitial()}</AvatarFallback>
                    </Avatar>

                    <div className="ml-[0px] overflow-hidden" style={getTextContainerStyle()}>
                        <span className="block text-[13px] leading-6 text-[#282828]" style={getUniformTextStyle()}>
                            {getUserDisplayName()}
                        </span>
                    </div>
                </div>
            </nav>
        </aside>
    );
};

const Sidebar = memo(SidebarComponent);
Sidebar.displayName = 'Sidebar';

export default Sidebar;
