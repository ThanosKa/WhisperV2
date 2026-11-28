import { BrowserWindow, shell } from 'electron';
import Store from 'electron-store';
import { z } from 'zod';
import sessionRepository from '../repositories/session';
import userRepository from '../repositories/user';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { sendEvent } from '../../../ipc/sendEvent';
import { errorMessage } from '../utils/errors';

const log = logger.child({ module: 'AuthService' });

// Webapp configuration
const WEBAPP_CONFIG = {
    domain: env.API_BASE_URL,
    sessionInitUrl: `${env.API_BASE_URL}/api/auth/session/init`,
    sessionStatusUrl: `${env.API_BASE_URL}/api/auth/session`,
    sessionPageUrl: `${env.API_BASE_URL}/session`,
};

// ── What WhisperAPP sends (the WhisperAPP repo, src/app/api/auth/) ──────────────────────────────

// Every auth route answers `{ success, data }` or `{ success: false, error }`.
const ApiEnvelopeSchema = z.object({
    success: z.boolean().optional(),
    error: z.string().optional(),
    data: z.unknown(),
});

const SessionInitDataSchema = z.object({ session_uuid: z.string().min(1) });

const SessionStatusDataSchema = z.object({ status: z.string() });

// Main passes the quotas on to the windows without reading them.
const QuotaSchema = z.record(z.string(), z.unknown());

// The signed-in user, from /api/auth/user-by-session and from the stored copy in electron-store.
export const UserProfileSchema = z.object({
    uid: z.string().min(1),
    email: z.string().nullish(),
    displayName: z.string().nullish(),
    plan: z.string().nullish(),
    apiQuota: QuotaSchema.nullish(),
    sttQuota: QuotaSchema.nullish(),
});

export type UserProfile = z.infer<typeof UserProfileSchema>;

// The user fields a sign-in deep link carries (index.js).
export type DeepLinkUser = { uid: string; email: string; displayName: string };

export type UserMode = 'unauthenticated' | 'webapp';

const describeIssues = (error: z.ZodError) => z.prettifyError(error);

async function readEnvelope({ response, failure }: { response: Response; failure: string }): Promise<unknown> {
    const envelope = ApiEnvelopeSchema.safeParse(await response.json());
    if (!envelope.success) {
        throw new Error(`${failure}: unexpected response from WhisperAPP (${describeIssues(envelope.error)})`);
    }
    if (!response.ok || !envelope.data.success) {
        throw new Error(envelope.data.error || failure);
    }
    return envelope.data.data;
}

// Session storage using electron-store
const sessionStore = new Store<Record<string, unknown>>({ name: 'auth-session' });

const readStoredSession = (): string | undefined => {
    const parsed = z.string().safeParse(sessionStore.get('sessionUuid'));
    return parsed.success ? parsed.data : undefined;
};

const readStoredUser = (): UserProfile | undefined => {
    const stored = sessionStore.get('userProfile');
    if (stored === undefined) return undefined;
    const parsed = UserProfileSchema.safeParse(stored);
    if (!parsed.success) {
        log.warn({ issues: describeIssues(parsed.error) }, 'Ignoring a stored user profile that does not parse');
        return undefined;
    }
    return parsed.data;
};

async function validateSession(sessionUuid: string): Promise<UserProfile> {
    if (!sessionUuid) {
        throw new Error('Session UUID is required for validation');
    }

    // First check session status
    const statusResponse = await fetch(`${WEBAPP_CONFIG.sessionStatusUrl}/${sessionUuid}`, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
        },
    });

    const statusData = SessionStatusDataSchema.safeParse(
        await readEnvelope({ response: statusResponse, failure: `HTTP ${statusResponse.status}: Session validation failed` })
    );
    if (!statusData.success) {
        throw new Error(`Session validation failed: unexpected session status (${describeIssues(statusData.error)})`);
    }

    // Check if session is authenticated
    if (statusData.data.status !== 'authenticated') {
        throw new Error(`Session status: ${statusData.data.status}`);
    }

    // Fetch user profile data
    const profileResponse = await fetch(`${WEBAPP_CONFIG.domain}/api/auth/user-by-session/${sessionUuid}`, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
        },
    });

    const profile = UserProfileSchema.safeParse(
        await readEnvelope({ response: profileResponse, failure: `Failed to fetch user profile: ${profileResponse.status}` })
    );
    if (!profile.success) {
        throw new Error(`Failed to fetch user profile: unexpected profile (${describeIssues(profile.error)})`);
    }
    return profile.data;
}

const shortId = (sessionUuid: string) => `${sessionUuid.substring(0, 8)}...`;

export class AuthService {
    currentUserId: string | null = null; // No default user - null means unauthenticated
    currentUserMode: UserMode = 'unauthenticated';
    currentUser: UserProfile | null = null;
    isInitialized = false;
    sessionUuid: string | null = null;
    lastBroadcastUserState: string | null = null; // Track last broadcast to prevent duplicates

    // This ensures the key is ready before any login/logout state change.
    initializationPromise: Promise<void> | null = null;

    constructor() {
        sessionRepository.setAuthService(this);
    }

    initialize(): Promise<void> | null {
        if (this.isInitialized) return this.initializationPromise;

        this.initializationPromise = this.restoreStoredSession();
        return this.initializationPromise;
    }

    private async restoreStoredSession(): Promise<void> {
        log.info('Starting initialization');

        // Check for existing session from electron-store
        const storedSession = readStoredSession();
        const storedUser = readStoredUser();

        log.info(
            {
                hasSession: !!storedSession,
                hasUser: !!storedUser,
                sessionUuid: storedSession ? shortId(storedSession) : 'none',
                uid: storedUser?.uid ?? 'none',
            },
            'Stored session data'
        );

        if (storedSession && storedUser) {
            try {
                log.info({ sessionUuid: shortId(storedSession) }, 'Validating stored session');
                // Validate existing session
                const userProfile = await validateSession(storedSession);
                await this.handleUserSignIn({ userProfile, sessionUuid: storedSession });
                log.info({ uid: userProfile.uid }, 'Restored session from storage');
            } catch (error) {
                log.info({ error: errorMessage(error) }, 'Stored session invalid, clearing');
                sessionStore.clear();
                this.handleUserSignOut();
            }
        } else {
            log.info('No stored session found, remaining unauthenticated');
            this.handleUserSignOut();
        }

        this.broadcastUserState();
        this.isInitialized = true;
        log.info({ uid: this.getCurrentUserId() }, 'Initialization completed');
    }

    async handleUserSignIn({ userProfile, sessionUuid }: { userProfile: UserProfile; sessionUuid: string }): Promise<void> {
        log.info({ uid: userProfile.uid }, 'User signed in');

        // Ensure the user exists in the local SQLite database
        try {
            userRepository.findOrCreate(userProfile);
            log.info({ uid: userProfile.uid }, 'User data synchronized with local database');
        } catch (err) {
            // Don't fail the sign-in process, but log the error
            log.error({ err, uid: userProfile.uid }, 'Failed to sync user to local database');
        }

        this.currentUser = userProfile;
        this.currentUserId = userProfile.uid;
        this.currentUserMode = 'webapp';
        this.sessionUuid = sessionUuid;

        // Store session and user data
        sessionStore.set('sessionUuid', sessionUuid);
        sessionStore.set('userProfile', userProfile);

        // NOTE: Don't end sessions here - we want to preserve unfinished sessions for crash recovery
        // Sessions are only ended on explicit sign-out (see signOut() and handleUserSignOut())
    }

    handleUserSignOut(): void {
        log.info('User signed out or no session found');
        if (this.currentUser) {
            log.info({ uid: this.currentUser.uid }, 'Clearing user data for logged-out user');
        }

        this.currentUser = null;
        this.currentUserId = null; // No default user - null means unauthenticated
        this.currentUserMode = 'unauthenticated'; // Clear state to unauthenticated
        this.sessionUuid = null;

        // Clear stored session data
        sessionStore.clear();

        // End active sessions for the unauthenticated state
        void sessionRepository.endAllActiveSessions();
    }

    async startWebappAuthFlow(): Promise<{ success: true; sessionUuid: string } | { success: false; error: string }> {
        try {
            // 1. Initialize session with webapp
            log.info('Initializing session with webapp');
            const initResponse = await fetch(WEBAPP_CONFIG.sessionInitUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
            });

            if (!initResponse.ok) {
                throw new Error(`Session initialization failed: ${initResponse.status}`);
            }

            const initData = ApiEnvelopeSchema.extend({ data: SessionInitDataSchema }).safeParse(await initResponse.json());
            if (!initData.success || !initData.data.success) {
                throw new Error('Invalid session initialization response');
            }

            const sessionUuid = initData.data.data.session_uuid;
            log.info({ sessionUuid: shortId(sessionUuid) }, 'Session initialized');

            // 2. Open browser to session page
            log.info({ sessionUuid: shortId(sessionUuid) }, 'Opening session page');
            await shell.openExternal(`${WEBAPP_CONFIG.sessionPageUrl}/${sessionUuid}`);

            // Note: No polling needed - authentication will complete via deep link callback
            log.info('Waiting for deep link authentication callback');

            return { success: true, sessionUuid };
        } catch (err) {
            log.error({ err }, 'Failed to start webapp auth flow');
            return { success: false, error: errorMessage(err) };
        }
    }

    async signInWithSession({ sessionUuid, userInfo = null }: { sessionUuid: string; userInfo?: DeepLinkUser | null }): Promise<void> {
        try {
            // Always validate the session with the webapp to get complete user profile including plan
            // This prevents jarring UI transitions in the header when deep links don't include plan info
            log.info({ sessionUuid: shortId(sessionUuid) }, 'Validating session with webapp to get complete user profile');
            let userProfile = await validateSession(sessionUuid);

            // If userInfo is provided (from deep link), merge it with validated profile
            // but prioritize the validated profile data (especially plan information)
            if (userInfo && userInfo.uid && userInfo.email) {
                log.info({ uid: userInfo.uid }, 'Merging deep link user data with validated profile');
                userProfile = {
                    ...userProfile,
                    // Keep validated profile data, but use displayName from deep link if it's more complete
                    displayName: userInfo.displayName || userProfile.displayName || 'User',
                };
            }

            // Handle user sign-in
            await this.handleUserSignIn({ userProfile, sessionUuid });

            log.info({ uid: userProfile.uid }, 'Signed in with session');
            this.broadcastUserState();
        } catch (err) {
            log.error({ err }, 'Error signing in with session');
            throw err; // Re-throw to be handled by the caller
        }
    }

    async signOut(): Promise<void> {
        try {
            // End all active sessions for the current user BEFORE signing out.
            await sessionRepository.endAllActiveSessions();

            this.handleUserSignOut();
            log.info('User sign-out completed');
            this.broadcastUserState();
        } catch (err) {
            log.error({ err }, 'Error signing out');
        }
    }

    // Sends the user state to every window. On sign-out it also clears the dashboard's copy of the
    // user in localStorage and reloads the window.
    //
    // Kept as it behaves today: the duplicate check and the old sign-in branch read `uid`, `mode` and
    // `displayName`, which `getCurrentUser()` does not return. So a broadcast is skipped only when
    // `isLoggedIn` is unchanged, and nothing is synced into localStorage on sign-in. 4a-2 decides.
    broadcastUserState(): void {
        const userState = this.getCurrentUser();

        // Prevent duplicate broadcasts with same user state
        const userStateKey = `isLoggedIn:${userState.isLoggedIn}`;
        if (this.lastBroadcastUserState === userStateKey) {
            log.info('Skipping duplicate broadcast for same user state');
            return;
        }
        this.lastBroadcastUserState = userStateKey;

        log.info({ uid: userState.currentUserId, isLoggedIn: userState.isLoggedIn }, 'Broadcasting user state change');

        // Send user state to all Electron windows
        BrowserWindow.getAllWindows().forEach(win => {
            if (win && !win.isDestroyed() && win.webContents && !win.webContents.isDestroyed()) {
                sendEvent({ webContents: win.webContents, channel: 'user-state-changed', args: [userState] });

                if (!userState.isLoggedIn) {
                    // Clear user data from local webapp localStorage when signed out or unauthenticated
                    log.info({ windowId: win.id }, 'Clearing user from local webapp localStorage');

                    win.webContents
                        .executeJavaScript(
                            `
                        try {
                            localStorage.removeItem('whisper_user');
                            window.dispatchEvent(new Event('userInfoChanged'));
                            console.log('🗑️ Local webapp user data cleared (unauthenticated)');
                        } catch (error) {
                            console.error('❌ Failed to clear user from localStorage:', error);
                        }
                    `
                        )
                        .catch((error: unknown) => {
                            log.info({ windowId: win.id, error: errorMessage(error) }, 'Failed to execute localStorage clear script');
                        });
                    // Redirect/reload to a neutral state
                    try {
                        win.webContents.reloadIgnoringCache();
                    } catch (error) {
                        log.warn({ windowId: win.id, error: errorMessage(error) }, 'Failed to reload window after logout');
                    }
                }
            }
        });
    }

    getCurrentUserId(): string | null {
        return this.currentUserId || null;
    }

    isAuthenticated(): boolean {
        return !!(this.currentUserMode === 'webapp' && this.currentUser && this.currentUserId);
    }

    getCurrentUser() {
        return {
            currentUserMode: this.currentUserMode,
            hasCurrentUser: !!this.currentUserId,
            currentUserId: this.currentUserId,
            isLoggedIn: this.isAuthenticated(),
            // Add full profile if available
            currentUser: this.currentUser
                ? {
                      uid: this.currentUser.uid,
                      displayName: this.currentUser.displayName,
                      email: this.currentUser.email,
                      plan: this.currentUser.plan,
                      apiQuota: this.currentUser.apiQuota,
                      sttQuota: this.currentUser.sttQuota,
                  }
                : null,
        };
    }
}

const authService = new AuthService();
export default authService;
