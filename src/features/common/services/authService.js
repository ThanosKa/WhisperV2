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
    loginUrl: 'http://localhost:3000/auth/sign-in?mode=electron',
    userProfileUrl: 'http://localhost:3000/api/auth/user-by-session',
};

// Session storage using electron-store
const sessionStore = new Store({ name: 'auth-session' });

async function validateSession(sessionUuid) {
    if (!sessionUuid) {
        throw new Error('Session UUID is required for validation');
    }

    const response = await fetch(`${WEBAPP_CONFIG.userProfileUrl}/${sessionUuid}`, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
        },
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
        throw new Error(data.error || `HTTP ${response.status}: Session validation failed`);
    }

    return data.data; // User profile data
}

class AuthService {
    constructor() {
        this.currentUserId = 'default_user';
        this.currentUserMode = 'local'; // 'local' or 'webapp'
        this.currentUser = null;
        this.isInitialized = false;
        this.sessionUuid = null;

        // This ensures the key is ready before any login/logout state change.
        this.initializationPromise = null;

        sessionRepository.setAuthService(this);
    }

    initialize() {
        if (this.isInitialized) return this.initializationPromise;

        this.initializationPromise = new Promise(async resolve => {
            // Check for existing session from electron-store
            const storedSession = sessionStore.get('sessionUuid');
            const storedUser = sessionStore.get('userProfile');

            if (storedSession && storedUser) {
                try {
                    // Validate existing session
                    const userProfile = await validateSession(storedSession);
                    await this.handleUserSignIn(userProfile, storedSession);
                    console.log('[AuthService] Restored session from storage');
                } catch (error) {
                    console.log('[AuthService] Stored session invalid, clearing:', error.message);
                    sessionStore.clear();
                    this.handleUserSignOut();
                }
            } else {
                console.log('[AuthService] No stored session found, starting in local mode');
                this.handleUserSignOut();
            }

            this.broadcastUserState();
            this.isInitialized = true;
            console.log('[AuthService] Initialized and resolved initialization promise.');
            resolve();
        });

        return this.initializationPromise;
    }

    async handleUserSignIn(userProfile, sessionUuid) {
        const previousUser = this.currentUser;

        console.log(`[AuthService] User signed in:`, userProfile.uid);
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
        this.currentUserId = 'default_user';
        this.currentUserMode = 'local';
        this.sessionUuid = null;

        // Clear stored session data
        sessionStore.clear();

        // End active sessions for the local/default user as well.
        sessionRepository.endAllActiveSessions();

        encryptionService.resetSessionKey();
    }

    async startWebappAuthFlow() {
        try {
            console.log(`[AuthService] Opening webapp auth URL in browser: ${WEBAPP_CONFIG.loginUrl}`);
            await shell.openExternal(WEBAPP_CONFIG.loginUrl);
            return { success: true };
        } catch (error) {
            console.error('[AuthService] Failed to open webapp auth URL:', error);
            return { success: false, error: error.message };
        }
    }

    async signInWithSession(sessionUuid, userInfo) {
        try {
            // Validate the session with the webapp
            const userProfile = await validateSession(sessionUuid);

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
        console.log('[AuthService] Broadcasting user state change:', userState);
        BrowserWindow.getAllWindows().forEach(win => {
            if (win && !win.isDestroyed() && win.webContents && !win.webContents.isDestroyed()) {
                win.webContents.send('user-state-changed', userState);
            }
        });
    }

    getCurrentUserId() {
        return this.currentUserId;
    }

    getCurrentUser() {
        const isLoggedIn = !!(this.currentUserMode === 'webapp' && this.currentUser);

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
        return {
            uid: this.currentUserId, // returns 'default_user'
            email: 'contact@pickle.com',
            displayName: 'Default User',
            mode: 'local',
            isLoggedIn: false,
            plan: 'free',
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
