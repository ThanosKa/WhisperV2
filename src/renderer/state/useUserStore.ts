import { create } from 'zustand';

export type RendererUser = {
    isLoggedIn?: boolean;
    uid?: string;
    email?: string;
    displayName?: string;
    photoURL?: string;
    [key: string]: unknown;
};

type Status = 'idle' | 'loading' | 'ready' | 'error';

type UserStore = {
    user: RendererUser | null;
    status: Status;
    error?: string;
    setUser: (user: RendererUser | null) => void;
    setStatus: (status: Status) => void;
    setError: (error?: string) => void;
};

export const useUserStore = create<UserStore>(set => ({
    user: null,
    status: 'idle',
    error: undefined,
    setUser: user => set({ user }),
    setStatus: status => set({ status }),
    setError: error => set({ error }),
}));
