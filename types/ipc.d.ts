import type { RendererUser } from '../src/renderer/state/useUserStore';

export type UserStateChangedPayload = RendererUser | null | undefined;

export type WithError<T> = T & {
    error?: string;
};

export type IpcInvokeChannels = {
    'get-current-user': () => RendererUser | null | undefined;
    'start-webapp-auth': () => Promise<{ success: boolean; sessionUuid?: string; error?: string }>;
    'sign-out': () => Promise<{ success: boolean; error?: string }>;
    'quit-application': () => void;
    'open-external': (url: string) => Promise<boolean>;
    'settings:getPresets': () => Promise<unknown>;
    'settings:get-auto-update': () => Promise<unknown>;
    'settings:set-auto-update': (isEnabled: boolean) => Promise<unknown>;
    'settings:open-db-path': () => Promise<WithError<{ success: boolean }>>;
    'listen:listAnalysisPresets': () => Promise<unknown>;
    'listen:getAnalysisPreset': () => Promise<{ presetId: string | null }>;
    'listen:setAnalysisPreset': (payload: { presetId: string | null }) => Promise<WithError<{ success: boolean }>>;
};

export type IpcSendChannels = {
    'user-state-changed': (payload: UserStateChangedPayload) => void;
};
