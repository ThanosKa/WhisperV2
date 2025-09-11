const { BrowserWindow, shell } = require('electron');
const fetch = require('node-fetch');
const Store = require('electron-store');
const encryptionService = require('./encryptionService');
const sessionRepository = require('../repositories/session');
const providerSettingsRepository = require('../repositories/providerSettings');
const permissionService = require('./permissionService');

// Webapp configuration
const WEBAPP_CONFIG = {
    domain: 'http://localhost:3000',
    sessionInitUrl: 'http://localhost:3000/api/auth/session/init',
    sessionStatusUrl: 'http://localhost:3000/api/auth/session',
    sessionPageUrl: 'http://localhost:3000/session',
};

// Session storage using electron-store
const sessionStore = new Store({ name: 'auth-session' });

async function validateSession(sessionUuid) {
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

    const statusData = await statusResponse.json();

    if (!statusResponse.ok || !statusData.success) {
        throw new Error(statusData.error || `HTTP ${statusResponse.status}: Session validation failed`);
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

    const profileData = await profileResponse.json();

    if (!profileResponse.ok || !profileData.success) {
        throw new Error(profileData.error || `Failed to fetch user profile: ${profileResponse.status}`);
    }

    // Transform Clerk user data to expected SQLite format
    const clerkUser = profileData.data;
    const transformedUser = {
        uid: clerkUser.id, // Clerk uses 'id' instead of 'uid'
        displayName: clerkUser.fullName || clerkUser.firstName || 'User', // Clerk uses 'fullName'
        email: clerkUser.primaryEmailAddress?.emailAddress || clerkUser.email || 'no-email@example.com', // Clerk has nested email structure
        plan: clerkUser.plan || 'free', // Keep additional Clerk data
        apiQuota: clerkUser.apiQuota || null,
    };

    console.log('[AuthService] Transformed Clerk user data:', {
        original: clerkUser,
        transformed: transformedUser,
    });

    return transformedUser; // Return transformed user data compatible with SQLite schema
}

class AuthService {
    constructor() {
        this.currentUserId = null; // No default user - null means unauthenticated
        this.currentUserMode = 'unauthenticated'; // 'unauthenticated', 'local', or 'webapp'
        this.currentUser = null;
        this.isInitialized = false;
        this.sessionUuid = null;
        this.lastBroadcastUserState = null; // Track last broadcast to prevent duplicates

        // This ensures the key is ready before any login/logout state change.
        this.initializationPromise = null;

        sessionRepository.setAuthService(this);
    }

    initialize() {
        if (this.isInitialized) return this.initializationPromise;

        this.initializationPromise = new Promise(async resolve => {
            console.log('[AuthService] Starting initialization...');

            // Check for existing session from electron-store
            const storedSession = sessionStore.get('sessionUuid');
            const storedUser = sessionStore.get('userProfile');

            console.log('[AuthService] Stored session data:', {
                hasSession: !!storedSession,
                hasUser: !!storedUser,
                sessionUuid: storedSession ? storedSession.substring(0, 8) + '...' : 'none',
                userUid: storedUser?.uid || 'none',
            });

            if (storedSession && storedUser) {
                try {
                    console.log('[AuthService] Attempting to validate stored session...');
                    // Validate existing session
                    const userProfile = await validateSession(storedSession);
                    await this.handleUserSignIn(userProfile, storedSession);
                    console.log('[AuthService] ✅ Successfully restored session from storage for user:', userProfile.uid);
                } catch (error) {
                    console.log('[AuthService] ❌ Stored session invalid, clearing:', error.message);
                    sessionStore.clear();
                    this.handleUserSignOut();
                }
            } else {
                console.log('[AuthService] No stored session found, remaining unauthenticated');
                this.handleUserSignOut();
            }

            this.broadcastUserState();
            this.isInitialized = true;
            console.log('[AuthService] ✅ Initialization completed. Current user:', this.getCurrentUserId());
            resolve();
        });

        return this.initializationPromise;
    }

    async handleUserSignIn(userProfile, sessionUuid) {
        const previousUser = this.currentUser;

        console.log(`[AuthService] User signed in:`, userProfile.uid);

        // Ensure the user exists in the local SQLite database
        const userRepository = require('../repositories/user');
        try {
            await userRepository.findOrCreate(userProfile);
            console.log('[AuthService] User data synchronized with local database');
        } catch (error) {
            console.error('[AuthService] Failed to sync user to local database:', error);
            // Don't fail the sign-in process, but log the error
        }

        this.currentUser = userProfile;
        this.currentUserId = userProfile.uid;
        this.currentUserMode = 'webapp';
        this.sessionUuid = sessionUuid;

        // Store session and user data
        sessionStore.set('sessionUuid', sessionUuid);
        sessionStore.set('userProfile', userProfile);

        // Clean up any zombie sessions from a previous run for this user.
        await sessionRepository.endAllActiveSessions();

        // Initialize encryption key for the logged-in user if permissions are already granted
        if (process.platform === 'darwin' && !(await permissionService.checkKeychainCompleted(this.currentUserId))) {
            console.warn('[AuthService] Keychain permission not yet completed for this user. Deferring key initialization.');
        } else {
            await encryptionService.initializeKey(userProfile.uid);
        }

        // Check for and run data migration for the user
        // Migration service disabled - using local-first data strategy with webapp authentication

        // Update model state with user plan information
        if (global.modelStateService && typeof global.modelStateService.setUserPlan === 'function') {
            try {
                await global.modelStateService.setUserPlan(userProfile.plan, userProfile.apiQuota);
                console.log(`[AuthService] User plan (${userProfile.plan}) has been processed and state updated.`);
            } catch (error) {
                console.error('[AuthService] Failed to update model state with user plan:', error);
            }
        }
    }

    handleUserSignOut() {
        const previousUser = this.currentUser;

        console.log(`[AuthService] User signed out or no session found.`);
        if (previousUser) {
            console.log(`[AuthService] Clearing user data for logged-out user: ${previousUser.uid}`);
            if (global.modelStateService && typeof global.modelStateService.setUserPlan === 'function') {
                try {
                    global.modelStateService.setUserPlan(null, null);
                } catch (e) {
                    console.warn('[AuthService] Failed to clear user plan during logout:', e.message);
                }
            }
        }

        this.currentUser = null;
        this.currentUserId = null; // No default user - null means unauthenticated
        this.currentUserMode = 'unauthenticated'; // Clear state to unauthenticated
        this.sessionUuid = null;

        // Clear stored session data
        sessionStore.clear();

        // End active sessions for the unauthenticated state
        sessionRepository.endAllActiveSessions();

        encryptionService.resetSessionKey();
    }

    async startWebappAuthFlow() {
        try {
            // 1. Initialize session with webapp
            console.log('[AuthService] Initializing session with webapp...');
            const initResponse = await fetch(WEBAPP_CONFIG.sessionInitUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
            });

            if (!initResponse.ok) {
                throw new Error(`Session initialization failed: ${initResponse.status}`);
            }

            const initData = await initResponse.json();
            if (!initData.success || !initData.data?.session_uuid) {
                throw new Error('Invalid session initialization response');
            }

            const sessionUuid = initData.data.session_uuid;
            console.log('[AuthService] Session initialized:', sessionUuid);

            // 2. Open browser to session page
            const sessionUrl = `${WEBAPP_CONFIG.sessionPageUrl}/${sessionUuid}`;
            console.log(`[AuthService] Opening session URL: ${sessionUrl}`);
            await shell.openExternal(sessionUrl);

            // Note: No polling needed - authentication will complete via deep link callback
            console.log('[AuthService] Waiting for deep link authentication callback...');

            return { success: true, sessionUuid };
        } catch (error) {
            console.error('[AuthService] Failed to start webapp auth flow:', error);
            return { success: false, error: error.message };
        }
    }

    async signInWithSession(sessionUuid, userInfo = null) {
        try {
            let userProfile;

            // If userInfo is provided (from deep link), use it directly
            if (userInfo && userInfo.uid && userInfo.email) {
                console.log('[AuthService] Using user data from deep link parameters:', userInfo);
                userProfile = {
                    uid: userInfo.uid,
                    displayName: userInfo.displayName || 'User',
                    email: userInfo.email,
                    plan: userInfo.plan || 'free',
                    apiQuota: userInfo.apiQuota || null,
                };
            } else {
                // Fallback: Validate the session with the webapp
                console.log('[AuthService] No user data provided, validating session with webapp...');
                userProfile = await validateSession(sessionUuid);
            }

            // Handle user sign-in
            await this.handleUserSignIn(userProfile, sessionUuid);

            console.log(`[AuthService] Successfully signed in with session for user:`, userProfile.uid);
            this.broadcastUserState();
        } catch (error) {
            console.error('[AuthService] Error signing in with session:', error);
            throw error; // Re-throw to be handled by the caller
        }
    }

    async signOut() {
        try {
            // End all active sessions for the current user BEFORE signing out.
            await sessionRepository.endAllActiveSessions();

            this.handleUserSignOut();
            console.log('[AuthService] User sign-out initiated successfully.');
            this.broadcastUserState();
        } catch (error) {
            console.error('[AuthService] Error signing out:', error);
        }
    }

    broadcastUserState() {
        const userState = this.getCurrentUser();

        // Prevent duplicate broadcasts with same user state
        const userStateKey = `${userState.uid}-${userState.mode}-${userState.isLoggedIn}`;
        if (this.lastBroadcastUserState === userStateKey) {
            console.log('[AuthService] Skipping duplicate broadcast for same user state');
            return;
        }
        this.lastBroadcastUserState = userStateKey;

        console.log('[AuthService] Broadcasting user state change:', userState);

        // Send user state to all Electron windows
        BrowserWindow.getAllWindows().forEach(win => {
            if (win && !win.isDestroyed() && win.webContents && !win.webContents.isDestroyed()) {
                win.webContents.send('user-state-changed', userState);

                // 🔥 CRITICAL FIX: Sync user data to local webapp localStorage
                if (userState.isLoggedIn && userState.mode === 'webapp') {
                    // Inject user data into local webapp's localStorage
                    const userProfile = {
                        uid: userState.uid,
                        display_name: userState.displayName,
                        email: userState.email,
                    };

                    console.log('[AuthService] 🔄 Syncing user to local webapp localStorage:', userProfile);

                    // Execute JavaScript in the webapp webview to update localStorage
                    win.webContents
                        .executeJavaScript(
                            `
                        try {
                            // Update localStorage with user data
                            localStorage.setItem('pickleglass_user', JSON.stringify(${JSON.stringify(userProfile)}));
                            
                            // Trigger userInfoChanged event to notify React components
                            window.dispatchEvent(new Event('userInfoChanged'));
                            
                            console.log('🔄 Local webapp user data synchronized:', ${JSON.stringify(userProfile)});
                        } catch (error) {
                            console.error('❌ Failed to sync user to localStorage:', error);
                        }
                    `
                        )
                        .catch(error => {
                            console.log('[AuthService] Failed to execute localStorage sync script:', error.message);
                        });
                } else if (!userState.isLoggedIn || userState.mode === 'unauthenticated') {
                    // Clear user data from local webapp localStorage when signed out or unauthenticated
                    console.log('[AuthService] 🗑️ Clearing user from local webapp localStorage (unauthenticated)');

                    win.webContents
                        .executeJavaScript(
                            `
                        try {
                            localStorage.removeItem('pickleglass_user');
                            window.dispatchEvent(new Event('userInfoChanged'));
                            console.log('🗑️ Local webapp user data cleared (unauthenticated)');
                        } catch (error) {
                            console.error('❌ Failed to clear user from localStorage:', error);
                        }
                    `
                        )
                        .catch(error => {
                            console.log('[AuthService] Failed to execute localStorage clear script:', error.message);
                        });
                }
            }
        });
    }

    getCurrentUserId() {
        // Return null for unauthenticated state to prevent fake user creation
        // Repositories should handle null gracefully by skipping user-specific operations
        const result = this.currentUserId || null;
        console.log('[AuthService] getCurrentUserId() called, returning:', result || 'null (unauthenticated)');
        console.log('[AuthService] Current auth state:', {
            currentUserId: this.currentUserId,
            currentUserMode: this.currentUserMode,
            hasCurrentUser: !!this.currentUser,
            isInitialized: this.isInitialized,
        });
        return result;
    }

    isAuthenticated() {
        return !!(this.currentUserMode === 'webapp' && this.currentUser && this.currentUserId);
    }

    getCurrentUser() {
        const isLoggedIn = !!(this.currentUserMode === 'webapp' && this.currentUser);

        console.log('[AuthService] getCurrentUser() called:', {
            currentUserMode: this.currentUserMode,
            hasCurrentUser: !!this.currentUser,
            currentUserId: this.currentUserId,
            isLoggedIn: isLoggedIn,
        });

        if (isLoggedIn) {
            return {
                uid: this.currentUser.uid,
                email: this.currentUser.email,
                displayName: this.currentUser.displayName,
                plan: this.currentUser.plan,
                mode: 'webapp',
                isLoggedIn: true,
                sessionUuid: this.sessionUuid,
            };
        }

        // Return unauthenticated state - no fake default user
        return {
            uid: null,
            email: null,
            displayName: null,
            mode: 'unauthenticated',
            isLoggedIn: false,
            plan: null,
        };
    }

    // Method to refresh user profile data
    async refreshUserProfile() {
        if (this.sessionUuid && this.currentUserMode === 'webapp') {
            try {
                const userProfile = await validateSession(this.sessionUuid);
                this.currentUser = userProfile;
                sessionStore.set('userProfile', userProfile);
                this.broadcastUserState();
                return userProfile;
            } catch (error) {
                console.error('[AuthService] Failed to refresh user profile:', error);
                // Session might be expired, sign out
                this.handleUserSignOut();
                this.broadcastUserState();
                throw error;
            }
        }
        return null;
    }
}

const authService = new AuthService();
module.exports = authService;
