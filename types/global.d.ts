import type { RendererUser } from '../src/renderer/state/useUserStore';

export {};

declare global {
    interface Window {
        api?: {
            common?: {
                getCurrentUser: () => Promise<RendererUser | null | undefined>;
                onUserStateChanged: (
                    callback: (event: unknown, user: RendererUser | null | undefined) => void,
                ) => void;
                removeOnUserStateChanged?: (
                    callback: (event: unknown, user: RendererUser | null | undefined) => void,
                ) => void;
            };
        };
    }
}
