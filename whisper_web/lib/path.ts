export function normalizePathname(pathname: string): string {
    if (!pathname) {
        return '/';
    }

    if (pathname === '/') {
        return '/';
    }

    return pathname.replace(/\/+$/, '');
}
