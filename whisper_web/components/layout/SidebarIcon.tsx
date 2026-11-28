'use client';

import Image from 'next/image';
import { createElement, memo } from 'react';
import { type LucideIcon } from 'lucide-react';

export const SidebarIcon = memo<{
    icon: LucideIcon | string;
    alt: string;
    className?: string | undefined;
}>(({ icon, alt, className = 'h-[18px] w-[18px] transition-transform duration-200' }) => {
    if (typeof icon !== 'string') {
        return createElement(icon, { className, 'aria-hidden': true });
    }

    return <Image src={icon} alt={alt} width={18} height={18} className={className} loading="lazy" />;
});

SidebarIcon.displayName = 'SidebarIcon';
