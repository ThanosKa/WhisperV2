const { describe, test, expect, beforeEach } = require('@jest/globals');

jest.mock('../../../src/features/common/repositories/user', () => require('../../mocks/database.mock').userRepository);
jest.mock('../../../src/features/common/repositories/session', () => require('../../mocks/database.mock').sessionRepository);

describe('AuthService', () => {
    let authService;
    let sessionRepositoryMock;
    let storeInstance;

    beforeEach(() => {
        jest.clearAllMocks();
        jest.resetModules();
        authService = require('../../../src/features/common/services/authService');
        sessionRepositoryMock = require('../../mocks/database.mock').sessionRepository;
        const Store = require('electron-store');
        storeInstance = Store.__instances[0];
    });

    describe('initialisation wiring', () => {
        test('registers itself with session repository on load', () => {
            expect(sessionRepositoryMock.setAuthService).toHaveBeenCalledWith(authService);
        });
    });

    describe('getCurrentUserId', () => {
        test('returns the current user ID when set', () => {
            authService.currentUserId = 'user-123';
            expect(authService.getCurrentUserId()).toBe('user-123');
        });

        test('returns null when user not set', () => {
            authService.currentUserId = null;
            expect(authService.getCurrentUserId()).toBeNull();
        });
    });

    describe('getCurrentUser', () => {
        test('provides normalized user state when authenticated', () => {
            authService.currentUserId = 'user-123';
            authService.currentUserMode = 'webapp';
            authService.currentUser = {
                uid: 'user-123',
                displayName: 'Test User',
                email: 'test@example.com',
                plan: 'pro',
                apiQuota: 1000,
            };

            const state = authService.getCurrentUser();

            expect(state).toMatchObject({
                currentUserId: 'user-123',
                isLoggedIn: true,
                currentUser: {
                    uid: 'user-123',
                    email: 'test@example.com',
                    plan: 'pro',
                },
            });
        });
    });

    describe('signOut', () => {
        test('clears user state and ends active sessions', async () => {
            authService.currentUserId = 'user-123';
            authService.currentUserMode = 'webapp';
            authService.currentUser = { uid: 'user-123' };

            await authService.signOut();

            expect(sessionRepositoryMock.endAllActiveSessions).toHaveBeenCalled();
            expect(authService.currentUserId).toBeNull();
            expect(authService.currentUser).toBeNull();
            expect(storeInstance.clear).toHaveBeenCalled();
        });
    });
});
