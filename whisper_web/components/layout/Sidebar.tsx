'use client';

import { usePathname, useRouter } from 'next/navigation';
import Image from 'next/image';
import { useState, useMemo, useCallback, memo } from 'react';
import { useAuth } from '@/lib/auth';
import { normalizePathname } from '@/lib/path';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { SidebarNavItem, handleActivationKey, type NavigationItem } from './SidebarNavItem';
import { ANIMATION_DURATION, useSidebarAnimation } from './useSidebarAnimation';

interface SidebarProps {
    isCollapsed: boolean;
    onToggle: (collapsed: boolean) => void;
    onSearchClick?: () => void;
}

const SidebarComponent = ({ isCollapsed, onToggle, onSearchClick }: SidebarProps) => {
    const pathname = usePathname();
    const normalizedPath = normalizePathname(pathname);
    const router = useRouter();
    const [isSettingsExpanded, setIsSettingsExpanded] = useState(pathname.startsWith('/settings'));
    const { user: userInfo, isLoading: authLoading } = useAuth();
    const animation = useSidebarAnimation(isCollapsed);
    const { sidebarContainerStyle, getTextContainerStyle, getUniformTextStyle } = animation;

    const isAuthenticatedUser = !!userInfo && userInfo.uid !== 'default_user';

    const [seenPathname, setSeenPathname] = useState(pathname);
    if (seenPathname !== pathname) {
        setSeenPathname(pathname);
        if (pathname.startsWith('/settings')) {
            setIsSettingsExpanded(true);
        }
    }

    const navigation = useMemo<NavigationItem[]>(
        () => [
            { kind: 'action', name: 'Search', action: onSearchClick, icon: '/search.svg', ariaLabel: 'Open search' },
            { kind: 'link', name: 'My Activity', href: '/activity', icon: '/activity.svg', ariaLabel: 'View my activity' },
            { kind: 'link', name: 'Personalize', href: '/personalize', icon: '/book.svg', ariaLabel: 'Personalization settings' },
            { kind: 'settings', name: 'Settings', icon: '/setting.svg', ariaLabel: 'Settings menu' },
        ],
        [onSearchClick]
    );

    const toggleSidebar = useCallback(() => {
        onToggle(!isCollapsed);
    }, [isCollapsed, onToggle]);

    const toggleSettings = useCallback(() => {
        if (!pathname.startsWith('/settings')) {
            setIsSettingsExpanded(prev => !prev);
        }
    }, [pathname]);

    const userDisplayName = authLoading ? 'Loading...' : userInfo?.display_name || 'Guest';
    const userInitial = authLoading ? 'L' : userInfo?.display_name ? userInfo.display_name.charAt(0).toUpperCase() : 'G';

    const openProfile = () => {
        router.push(isAuthenticatedUser ? '/settings' : '/login');
    };

    return (
        <aside
            className={`flex h-full flex-col bg-white border-r py-3 px-2 border-[#e5e5e5] relative ${isCollapsed ? 'w-[60px]' : 'w-[220px]'}`}
            style={sidebarContainerStyle}
            role="navigation"
            aria-label="main navigation"
        >
            <header className={`group relative h-6 flex shrink-0 items-center justify-between px-3`}>
                {isCollapsed ? (
                    <div className="flex w-full items-center justify-center">
                        {/* The button below will be shown on hover and cover this */}
                        <span className="font-semibold text-black">W</span>
                        <button
                            onClick={toggleSidebar}
                            onKeyDown={event => handleActivationKey({ event, action: toggleSidebar })}
                            className="absolute inset-0 flex items-center justify-center rounded-md text-gray-500 opacity-0 scale-90 transition-all duration-300 ease-out hover:text-gray-800 group-hover:opacity-100 group-hover:scale-100 focus:outline-hidden"
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
                            onKeyDown={event => handleActivationKey({ event, action: toggleSidebar })}
                            className="h-6 w-6 rounded-[4px] p-1 text-gray-500 transition-colors hover:bg-[#f7f7f7] hover:text-gray-800 focus:outline-hidden"
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
                            {navigation.map(item => (
                                <SidebarNavItem
                                    key={item.name}
                                    item={item}
                                    normalizedPath={normalizedPath}
                                    isCollapsed={isCollapsed}
                                    animation={animation}
                                    isSettingsExpanded={isSettingsExpanded}
                                    isAuthenticatedUser={isAuthenticatedUser}
                                    onToggleSettings={toggleSettings}
                                />
                            ))}
                        </ul>
                    </li>
                </ul>

                <button
                    onClick={toggleSidebar}
                    onKeyDown={event => handleActivationKey({ event, action: toggleSidebar })}
                    className={`${
                        isCollapsed ? '' : 'opacity-0'
                    } "absolute inset-0 flex items-center justify-center w-full h-[36px] mb-[8px] rounded-[20px] flex justify-center items-center text-gray-500 hover:text-gray-800 rounded-md scale-90 group-hover:opacity-100 group-hover:scale-100 transition-all duration-300 ease-out focus:outline-hidden`}
                    aria-label="Open sidebar"
                >
                    <div className="w-[36px] h-[36px] flex items-center justify-center bg-[#f7f7f7] rounded-[20px]">
                        <Image src="/unfold.svg" alt="Open" width={18} height={18} className="h-4.5 w-4.5" />
                    </div>
                </button>

                <div className="mt-auto space-y-0" role="navigation" aria-label="Additional links" />

                <div className="mt-0 flex items-center w-full h-px px-[4px] mt-[8px] mb-[8px]">
                    <div className="w-full h-px bg-[#d9d9d9]"></div>
                </div>

                <div
                    className={`mt-0 flex items-center ${isCollapsed ? '' : 'gap-x-[10px]'}`}
                    style={{
                        padding: '6px 8px',
                        justifyContent: 'flex-start',
                        transition: `all ${ANIMATION_DURATION.SIDEBAR}ms cubic-bezier(0.4, 0, 0.2, 1)`,
                    }}
                    role="region"
                    aria-label="User profile"
                >
                    <Avatar
                        className="h-[30px] w-[30px] cursor-pointer hover:bg-muted transition-colors"
                        title={userDisplayName}
                        tabIndex={0}
                        role="button"
                        aria-label={`User: ${userDisplayName}`}
                        onKeyDown={event => handleActivationKey({ event, action: openProfile })}
                        onClick={openProfile}
                    >
                        <AvatarFallback className="text-xs text-white">{userInitial}</AvatarFallback>
                    </Avatar>

                    <div className="ml-0 overflow-hidden" style={getTextContainerStyle()}>
                        <span className="block text-[13px] leading-6 text-[#282828]" style={getUniformTextStyle()}>
                            {userDisplayName}
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
