import { useEffect } from 'react';

import type { RendererUser } from '../state/useUserStore';
import { useUserStore } from '../state/useUserStore';

export function useBootstrapUser() {
    const setUser = useUserStore(state => state.setUser);
    const setStatus = useUserStore(state => state.setStatus);
    const setError = useUserStore(state => state.setError);

    useEffect(() => {
        let unsub: (() => void) | undefined;

        async function bootstrap() {
            if (!window.api?.common) {
                setStatus('error');
                setError('IPC bridge unavailable');
                return;
            }

            setStatus('loading');

            try {
                const user = (await window.api.common.getCurrentUser?.()) as RendererUser | null | undefined;
                setUser(user ?? null);
                setStatus('ready');
            } catch (err) {
                console.error('[useBootstrapUser] Failed to fetch current user', err);
                setError(err instanceof Error ? err.message : String(err));
                setStatus('error');
            }

            if (window.api.common.onUserStateChanged) {
                const handler = (_event: unknown, payload: RendererUser | null | undefined) => {
                    setUser(payload ?? null);
                };
                window.api.common.onUserStateChanged(handler);
                unsub = () => {
                    window.api?.common?.removeOnUserStateChanged?.(handler);
                };
            }
        }

        bootstrap();

        return () => {
            if (unsub) {
                unsub();
            }
        };
    }, [setError, setStatus, setUser]);
}
