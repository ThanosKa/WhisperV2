import './MainHeader.js';
import './AuthHeader.js';
import './PermissionHeader.js';
// import './WelcomeHeader.js';

// DEV: Set to 'auth' | 'permission' | 'main' to force a header.
// Leave as null to use normal app logic based on login and permissions.
const DEV_HEADER_OVERRIDE = null;

// App content dimensions for Permission header
const APP_CONTENT_WIDTH = 950;
const APP_CONTENT_HEIGHT = 750;

class HeaderTransitionManager {
    constructor() {
        this.headerContainer = document.getElementById('header-container');
        this.currentHeaderType = null; // 'auth' | 'main' | 'permission'
        this.devOverride = DEV_HEADER_OVERRIDE;
        // this.welcomeHeader = null;
        this.mainHeader = null;
        this.permissionHeader = null;

        /**
         * only one header window is allowed
         * @param {'auth'|'main'|'permission'} type
         */
        this.ensureHeader = type => {
            console.log('[HeaderController] ensureHeader: Ensuring header of type:', type);
            if (this.currentHeaderType === type) {
                console.log('[HeaderController] ensureHeader: Header of type:', type, 'already exists.');
                return;
            }

            this.headerContainer.innerHTML = '';

            // this.welcomeHeader = null;
            this.mainHeader = null;
            this.permissionHeader = null;
            this.authHeader = null;

            // Create new header element
            if (type === 'auth') {
                this.authHeader = document.createElement('auth-header');
                this.headerContainer.appendChild(this.authHeader);
                this.authHeader.startSlideInAnimation?.();
                console.log('[HeaderController] ensureHeader: Header of type:', type, 'created.');
            } else if (type === 'permission') {
                this.permissionHeader = document.createElement('permission-setup');
                this.permissionHeader.addEventListener('request-resize', e => {
                    this._resizeForPermissionHeader(e.detail.height);
                });
                this.permissionHeader.continueCallback = async () => {
                    if (window.api && window.api.headerController) {
                        console.log('[HeaderController] Re-initializing model state after permission grant...');
                        await window.api.headerController.reInitializeModelState();
                    }
                    this.transitionToMainHeader();
                };
                this.headerContainer.appendChild(this.permissionHeader);
            } else {
                this.mainHeader = document.createElement('main-header');
                this.headerContainer.appendChild(this.mainHeader);
                this.mainHeader.startSlideInAnimation?.();
            }

            this.currentHeaderType = type;
            this.notifyHeaderState(type);
        };

        console.log('[HeaderController] Manager initialized');

        // If a dev override is set, apply it and skip bootstrap logic
        if (this.devOverride) {
            this.applyDevOverride();
        } else {
            this._bootstrap();
        }

        if (window.api) {
            window.api.headerController.onUserStateChanged((event, userState) => {
                console.log('[HeaderController] Received user state change:', userState);
                // Ignore state changes if a dev override is active
                if (this.devOverride) return;
                this.handleStateUpdate(userState);
            });

            window.api.headerController.onAuthFailed((event, { message }) => {
                console.error('[HeaderController] Received auth failure from main process:', message);
            });
        }
    }

    async applyDevOverride() {
        const type = String(this.devOverride).toLowerCase();
        switch (type) {
            case 'auth':
                await this._resizeForAuth();
                this.ensureHeader('auth');
                break;
            case 'permission':
                await this._resizeForPermissionHeader();
                this.ensureHeader('permission');
                break;
            case 'main':
                await this._resizeForMain();
                this.ensureHeader('main');
                break;
            default:
                console.warn('[HeaderController] Unknown DEV_HEADER_OVERRIDE:', this.devOverride);
        }
        this.notifyHeaderState(type);
    }

    notifyHeaderState(stateOverride) {
        const state = stateOverride || this.currentHeaderType || 'auth';
        if (window.api) {
            window.api.headerController.sendHeaderStateChanged(state);
        }
    }

    async _bootstrap() {
        // The initial state will be sent by the main process via 'user-state-changed'
        // We just need to request it.
        if (window.api) {
            const userState = await window.api.common.getCurrentUser();
            console.log('[HeaderController] Bootstrapping with initial user state:', userState);
            // Ignore bootstrap state if a dev override is active
            if (!this.devOverride) {
                this.handleStateUpdate(userState);
            }
        } else {
            // Fallback for non-electron environment (testing/web)
            if (this.devOverride) {
                this.applyDevOverride();
            } else {
                this.ensureHeader('auth');
            }
        }
    }

    //////// after_modelStateService ////////
    async handleStateUpdate(userState) {
        const isLoggedIn = !!(userState && userState.isLoggedIn);
        if (!isLoggedIn) {
            await this._resizeForAuth();
            this.ensureHeader('auth');
            return;
        }

        const permissionResult = await this.checkPermissions();
        if (permissionResult.success) {
            this.transitionToMainHeader();
        } else {
            this.transitionToPermissionHeader();
        }
    }

    async transitionToPermissionHeader() {
        // Prevent duplicate transitions
        if (this.currentHeaderType === 'permission') {
            console.log('[HeaderController] Already showing permission setup, skipping transition');
            return;
        }

        // Check if permissions were previously completed
        if (window.api) {
            try {
                const permissionsCompleted = await window.api.headerController.checkPermissionsCompleted();
                if (permissionsCompleted) {
                    console.log('[HeaderController] Permissions were previously completed, checking current status...');

                    // Double check current permission status
                    const permissionResult = await this.checkPermissions();
                    if (permissionResult.success) {
                        // Skip permission setup if already granted
                        this.transitionToMainHeader();
                        return;
                    }

                    console.log('[HeaderController] Permissions were revoked, showing setup again');
                }
            } catch (error) {
                console.error('[HeaderController] Error checking permissions completed status:', error);
            }
        }

        const initialHeight = APP_CONTENT_HEIGHT;
        await this._resizeForPermissionHeader(initialHeight);
        this.ensureHeader('permission');
    }

    async transitionToMainHeader(animate = true) {
        if (this.currentHeaderType === 'main') {
            return this._resizeForMain();
        }

        await this._resizeForMain();
        this.ensureHeader('main');
    }

    async _resizeForMain() {
        if (!window.api) return;
        console.log('[HeaderController] _resizeForMain: Resizing window to 520x50');
        return window.api.headerController.resizeHeaderWindow({ width: 520, height: 50 }).catch(() => {});
    }

    async _resizeForAuth(height = 50) {
        if (!window.api) return;
        console.log(`[HeaderController] _resizeForAuth: Resizing window to 520x${height}`);
        return window.api.headerController.resizeHeaderWindow({ width: 520, height }).catch(() => {});
    }

    async _resizeForPermissionHeader(height) {
        if (!window.api) return;
        const finalHeight = height || APP_CONTENT_HEIGHT;
        return window.api.headerController.resizeHeaderWindow({ width: APP_CONTENT_WIDTH, height: finalHeight }).catch(() => {});
    }

    // _resizeForWelcome removed with ApiKey flow

    async checkPermissions() {
        if (!window.api) {
            return { success: true };
        }

        try {
            const permissions = await window.api.headerController.checkSystemPermissions();
            console.log('[HeaderController] Current permissions:', permissions);

            if (!permissions.needsSetup) {
                return { success: true };
            }

            let errorMessage = '';
            if (!permissions.microphone && !permissions.screen) {
                errorMessage = 'Microphone and screen recording access required';
            }

            return {
                success: false,
                error: errorMessage,
            };
        } catch (error) {
            console.error('[HeaderController] Error checking permissions:', error);
            return {
                success: false,
                error: 'Failed to check permissions',
            };
        }
    }
}

window.addEventListener('DOMContentLoaded', () => {
    new HeaderTransitionManager();
});
