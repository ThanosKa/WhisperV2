const { systemPreferences, shell, desktopCapturer } = require('electron');
const permissionRepository = require('../repositories/permission');

class PermissionService {
    _getAuthService() {
        return require('./authService');
    }

    async checkSystemPermissions() {
        const permissions = {
            microphone: 'unknown',
            screen: 'unknown',
            keychain: 'unknown',
            needsSetup: true,
        };

        try {
            if (process.platform === 'darwin') {
                const authService = this._getAuthService();
                const currentUser = authService.getCurrentUser();
                const isKeychainRequired = !!currentUser; // True if user logged in (Clerk auth)

                console.log('[Permissions] User mode:', currentUser.mode, 'Keychain required:', isKeychainRequired);

                permissions.microphone = systemPreferences.getMediaAccessStatus('microphone');
                permissions.screen = systemPreferences.getMediaAccessStatus('screen');

                if (isKeychainRequired) {
                    permissions.keychain = (await this.checkKeychainCompleted(authService.getCurrentUserId())) ? 'granted' : 'unknown';
                    permissions.needsSetup =
                        permissions.microphone !== 'granted' || permissions.screen !== 'granted' || permissions.keychain !== 'granted';
                } else {
                    // For webapp users, keychain is not required
                    permissions.keychain = 'granted'; // Mark as granted since it's not needed
                    permissions.needsSetup = permissions.microphone !== 'granted' || permissions.screen !== 'granted';
                }

                console.log('[Permissions] Final permissions check:', {
                    microphone: permissions.microphone,
                    screen: permissions.screen,
                    keychain: permissions.keychain,
                    needsSetup: permissions.needsSetup,
                    userMode: currentUser.mode,
                });
            } else {
                permissions.microphone = 'granted';
                permissions.screen = 'granted';
                permissions.keychain = 'granted';
                permissions.needsSetup = false;
            }

            console.log('[Permissions] System permissions status:', permissions);
            return permissions;
        } catch (error) {
            console.error('[Permissions] Error checking permissions:', error);
            return {
                microphone: 'unknown',
                screen: 'unknown',
                keychain: 'unknown',
                needsSetup: true,
                error: error.message,
            };
        }
    }

    async requestMicrophonePermission() {
        if (process.platform !== 'darwin') {
            return { success: true };
        }

        try {
            const status = systemPreferences.getMediaAccessStatus('microphone');
            console.log('[Permissions] Microphone status:', status);
            if (status === 'granted') {
                return { success: true, status: 'granted' };
            }

            const granted = await systemPreferences.askForMediaAccess('microphone');
            return {
                success: granted,
                status: granted ? 'granted' : 'denied',
            };
        } catch (error) {
            console.error('[Permissions] Error requesting microphone permission:', error);
            return {
                success: false,
                error: error.message,
            };
        }
    }

    async openSystemPreferences(section) {
        if (process.platform !== 'darwin') {
            return { success: false, error: 'Not supported on this platform' };
        }

        try {
            if (section === 'screen-recording') {
                try {
                    console.log('[Permissions] Triggering screen capture request to register app...');
                    await desktopCapturer.getSources({
                        types: ['screen'],
                        thumbnailSize: { width: 1, height: 1 },
                    });
                    console.log('[Permissions] App registered for screen recording');
                } catch (captureError) {
                    console.log('[Permissions] Screen capture request triggered (expected to fail):', captureError.message);
                }

                // Open macOS System Settings directly to Screen Recording privacy pane
                await shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture');
            }
            return { success: true };
        } catch (error) {
            console.error('[Permissions] Error opening system preferences:', error);
            return { success: false, error: error.message };
        }
    }

    async markKeychainCompleted() {
        try {
            const userId = this._getAuthService().getCurrentUserId();
            if (!userId) {
                console.log('[Permissions] Cannot mark keychain completed: user not authenticated');
                return { success: false, error: 'User not authenticated' };
            }
            await permissionRepository.markKeychainCompleted(userId);
            console.log('[Permissions] Marked keychain as completed for user:', userId);
            return { success: true };
        } catch (error) {
            console.error('[Permissions] Error marking keychain as completed:', error);
            return { success: false, error: error.message };
        }
    }

    async checkKeychainCompleted(uid) {
        if (!uid) {
            // No user authenticated, skip keychain check
            console.log('[Permissions] No authenticated user, skipping keychain check');
            return true;
        }
        try {
            const completed = permissionRepository.checkKeychainCompleted(uid);
            console.log('[Permissions] Keychain completed status for uid', uid + ':', completed);
            return completed;
        } catch (error) {
            console.error('[Permissions] Error checking keychain completed status:', error);
            return false;
        }
    }
}

const permissionService = new PermissionService();
module.exports = permissionService;
