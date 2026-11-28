'use client';

import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SidebarIcon } from './SidebarIcon';
import { SidebarSettingsMenu } from './SidebarSettingsMenu';
import { ANIMATION_DURATION, type SidebarAnimation } from './useSidebarAnimation';

export type NavigationItem =
    | { kind: 'action'; name: string; icon: string; ariaLabel: string; action: (() => void) | undefined }
    | { kind: 'link'; name: string; icon: string; ariaLabel: string; href: string }
    | { kind: 'settings'; name: string; icon: string; ariaLabel: string };

/** Enter and Space activate a custom button, like a click. */
export const handleActivationKey = ({ event, action }: { event: React.KeyboardEvent; action: (() => void) | undefined }) => {
    if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        action?.();
    }
};

const BASE_BUTTON_CLASSES = `
      group flex items-center rounded-[8px] px-[12px] py-[10px] text-[14px] text-[#282828] w-full relative
      transition-colors duration-${ANIMATION_DURATION.COLOR_TRANSITION} ease-out
      focus:outline-hidden
    `;

const stateClasses = (isActive: boolean) =>
    isActive ? 'bg-[#f2f2f2] text-[#282828]' : 'text-[#282828] hover:text-[#282828] hover:bg-[#f7f7f7]';

interface SidebarNavItemProps {
    item: NavigationItem;
    normalizedPath: string;
    isCollapsed: boolean;
    animation: SidebarAnimation;
    isSettingsExpanded: boolean;
    isAuthenticatedUser: boolean;
    onToggleSettings: () => void;
}

export function SidebarNavItem({ item, normalizedPath, isCollapsed, animation, isSettingsExpanded, isAuthenticatedUser, onToggleSettings }: SidebarNavItemProps) {
    const { getTextContainerStyle, getUniformTextStyle, getSubmenuAnimationStyle } = animation;
    const title = isCollapsed ? item.name : undefined;

    if (item.kind === 'action') {
        return (
            <li>
                <Button
                    onClick={item.action}
                    onKeyDown={event => handleActivationKey({ event, action: item.action })}
                    variant="ghost"
                    className={`${BASE_BUTTON_CLASSES} ${stateClasses(false)} justify-start h-auto py-[10px] px-[12px]`}
                    title={title}
                    aria-label={item.ariaLabel || item.name}
                    style={{ willChange: 'background-color, color' }}
                >
                    <div className="shrink-0 flex items-center justify-center w-5 h-5">
                        <SidebarIcon icon={item.icon} alt={`${item.name} icon`} />
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

    if (item.kind === 'settings') {
        const isActive = normalizedPath === '/settings' || normalizedPath.startsWith('/settings/');

        return (
            <li>
                <button
                    onClick={onToggleSettings}
                    onKeyDown={event => handleActivationKey({ event, action: onToggleSettings })}
                    className={`${BASE_BUTTON_CLASSES} ${stateClasses(isActive)}`}
                    title={title}
                    aria-label={item.ariaLabel || item.name}
                    aria-expanded={isSettingsExpanded}
                    aria-controls="settings-submenu"
                    style={{ willChange: 'background-color, color' }}
                >
                    <div className="shrink-0 flex items-center justify-center w-5 h-5">
                        <SidebarIcon icon={item.icon} alt={`${item.name} icon`} />
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

                <SidebarSettingsMenu
                    normalizedPath={normalizedPath}
                    isAuthenticatedUser={isAuthenticatedUser}
                    style={getSubmenuAnimationStyle(isSettingsExpanded)}
                />
            </li>
        );
    }

    const isActive = normalizedPath === item.href || normalizedPath.startsWith(`${item.href}/`);

    return (
        <li>
            <Link
                href={item.href}
                className={`
                        group flex items-center rounded-[8px] text-[14px] px-[12px] py-[10px] relative
            focus:outline-hidden
            ${stateClasses(isActive)}
            transition-colors duration-${ANIMATION_DURATION.COLOR_TRANSITION} ease-out
                      `}
                title={title}
                aria-label={item.ariaLabel || item.name}
                style={{ willChange: 'background-color, color' }}
            >
                <div className="shrink-0 flex items-center justify-center w-5 h-5">
                    <SidebarIcon icon={item.icon} alt={`${item.name} icon`} />
                </div>

                <div className="ml-[12px] overflow-hidden" style={getTextContainerStyle()}>
                    <span className="block text-left" style={getUniformTextStyle()}>
                        {item.name}
                    </span>
                </div>
            </Link>
        </li>
    );
}
