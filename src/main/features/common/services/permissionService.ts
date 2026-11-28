import { systemPreferences, shell, desktopCapturer } from 'electron';
import { logger } from '../utils/logger';
import { errorMessage } from '../utils/errors';
import type { Outcome } from '../../../../shared/ipc';

const log = logger.child({ module: 'Permissions' });

type MediaAccessStatus = ReturnType<typeof systemPreferences.getMediaAccessStatus>;

export type SystemPermissions = {
    microphone: MediaAccessStatus;
    screen: MediaAccessStatus;
    needsSetup: boolean;
    error?: string;
};

// A denied microphone is a failure without an error message.
export type PermissionResult = Outcome<{ status?: 'granted' }> | { success: false; status: 'denied' };

// Only macOS asks the user; elsewhere both count as granted.
const NOT_MAC_PERMISSIONS: SystemPermissions = { microphone: 'granted', screen: 'granted', needsSetup: false };

const readMacPermissions = (): SystemPermissions => {
    const microphone = systemPreferences.getMediaAccessStatus('microphone');
    const screen = systemPreferences.getMediaAccessStatus('screen');
    return { microphone, screen, needsSetup: microphone !== 'granted' || screen !== 'granted' };
};

class PermissionService {
    async checkSystemPermissions(): Promise<SystemPermissions> {
        try {
            const permissions = process.platform === 'darwin' ? readMacPermissions() : NOT_MAC_PERMISSIONS;

            log.info({ permissions }, 'System permissions status');
            return permissions;
        } catch (err) {
            log.error({ err }, 'Error checking permissions');
            return {
                microphone: 'unknown',
                screen: 'unknown',
                needsSetup: true,
                error: errorMessage(err),
            };
        }
    }

    async requestMicrophonePermission(): Promise<PermissionResult> {
        if (process.platform !== 'darwin') {
            return { success: true };
        }

        try {
            const status = systemPreferences.getMediaAccessStatus('microphone');
            log.info({ status }, 'Microphone status');
            if (status === 'granted') {
                return { success: true, status: 'granted' };
            }

            const granted = await systemPreferences.askForMediaAccess('microphone');
            return granted ? { success: true, status: 'granted' } : { success: false, status: 'denied' };
        } catch (err) {
            log.error({ err }, 'Error requesting microphone permission');
            return {
                success: false,
                error: errorMessage(err),
            };
        }
    }

    async openSystemPreferences(section: unknown): Promise<PermissionResult> {
        if (process.platform !== 'darwin') {
            return { success: false, error: 'Not supported on this platform' };
        }

        try {
            if (section === 'screen-recording') {
                try {
                    log.info('Triggering screen capture request to register app');
                    await desktopCapturer.getSources({
                        types: ['screen'],
                        thumbnailSize: { width: 1, height: 1 },
                    });
                    log.info('App registered for screen recording');
                } catch (captureError) {
                    log.info({ error: errorMessage(captureError) }, 'Screen capture request triggered (expected to fail)');
                }

                // Open macOS System Settings directly to Screen Recording privacy pane
                await shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture');
            }
            return { success: true };
        } catch (err) {
            log.error({ err, section }, 'Error opening system preferences');
            return { success: false, error: errorMessage(err) };
        }
    }
}

const permissionService = new PermissionService();
export default permissionService;
