import 'reflect-metadata';
import { beforeEach, describe, expect, jest, test } from 'bun:test';
import type { UserEntity } from '@app/database/entities';
import type { UsersRepository } from '@app/database/repositories';
import { CurrentUserService } from '@app/services/CurrentUserService';
import type { TokenRefreshService } from '@app/services/TokenRefreshService';
import type Keyv from '@keyvhq/core';
import type { Logger } from 'pino';

describe('CurrentUserService', () => {
    let service: CurrentUserService;
    let mockLogger: Logger;
    let mockCache: Keyv<number>;
    let mockUserRepo: UsersRepository;
    let mockTokenRefreshService: TokenRefreshService;
    let mockUser: UserEntity;

    beforeEach(() => {
        mockCache = {
            get: jest.fn(),
            set: jest.fn(),
            delete: jest.fn(),
        } as unknown as Keyv<number>;

        mockLogger = {
            info: jest.fn(),
            warn: jest.fn(),
            debug: jest.fn(),
        } as unknown as Logger;

        mockUserRepo = {
            findById: jest.fn(),
            findByIdOrFail: jest.fn(),
            findByEmail: jest.fn(),
        } as unknown as UsersRepository;

        mockTokenRefreshService = {
            refreshTokensIfNeeded: jest.fn(),
        } as unknown as TokenRefreshService;

        mockUser = {
            id: 1,
            email: 'test@example.com',
            name: 'Test User',
            googleUid: 'google-uid-123',
            accessToken: 'ya29.test-access-token',
            refreshToken: '1//test-refresh-token',
            tokenExpiryDate: new Date(Date.now() + 3600000),
        } as UserEntity;

        service = new CurrentUserService(mockLogger, mockCache, mockUserRepo, mockTokenRefreshService);
    });

    describe('getCurrentUser', () => {
        test('should return null when no user ID in cache', async () => {
            (mockCache.get as jest.Mock).mockResolvedValue(null);

            const result = await service.getCurrentUser();

            expect(result).toBeNull();
            expect(mockCache.get).toHaveBeenCalledWith('current-user-id');
        });

        test('should return user when found in database', async () => {
            (mockCache.get as jest.Mock).mockResolvedValue(1);
            (mockUserRepo.findById as jest.Mock).mockResolvedValue(mockUser);

            const result = await service.getCurrentUser();

            expect(result).toBe(mockUser);
            expect(mockUserRepo.findById).toHaveBeenCalledWith(1);
        });

        test('should clear cache and return null when user not found in database', async () => {
            (mockCache.get as jest.Mock).mockResolvedValue(1);
            (mockUserRepo.findById as jest.Mock).mockResolvedValue(null);
            (mockCache.delete as jest.Mock).mockResolvedValue(true);

            const result = await service.getCurrentUser();

            expect(result).toBeNull();
            expect(mockCache.delete).toHaveBeenCalledWith('current-user-id');
            expect(mockLogger.warn).toHaveBeenCalledWith(
                { userId: 1 },
                'Current user not found in database, clearing cache'
            );
        });
    });

    describe('setCurrentUser', () => {
        test('should set user ID in cache with TTL', async () => {
            (mockCache.set as jest.Mock).mockResolvedValue(true);

            await service.setCurrentUser(mockUser);

            expect(mockCache.set).toHaveBeenCalledWith('current-user-id', mockUser.id, 60 * 60 * 24 * 7 * 1000);
            expect(mockLogger.info).toHaveBeenCalledWith(
                { userId: mockUser.id, email: mockUser.email },
                'Current user set'
            );
        });
    });

    describe('getCurrentUserId', () => {
        test('should return user ID from cache', async () => {
            (mockCache.get as jest.Mock).mockResolvedValue(1);

            const result = await service.getCurrentUserId();

            expect(result).toBe(1);
            expect(mockCache.get).toHaveBeenCalledWith('current-user-id');
        });

        test('should return null when no user ID in cache', async () => {
            (mockCache.get as jest.Mock).mockResolvedValue(null);

            const result = await service.getCurrentUserId();

            expect(result).toBeNull();
        });

        test('should return null when cache returns undefined', async () => {
            (mockCache.get as jest.Mock).mockResolvedValue(undefined);

            const result = await service.getCurrentUserId();

            expect(result).toBeNull();
        });
    });

    describe('clearCurrentUser', () => {
        test('should delete user ID from cache', async () => {
            (mockCache.delete as jest.Mock).mockResolvedValue(true);

            await service.clearCurrentUser();

            expect(mockCache.delete).toHaveBeenCalledWith('current-user-id');
            expect(mockLogger.info).toHaveBeenCalledWith('Current user cleared');
        });
    });

    describe('hasCurrentUser', () => {
        test('should return true when user ID exists in cache', async () => {
            (mockCache.get as jest.Mock).mockResolvedValue(1);

            const result = await service.hasCurrentUser();

            expect(result).toBe(true);
        });

        test('should return false when no user ID in cache', async () => {
            (mockCache.get as jest.Mock).mockResolvedValue(null);

            const result = await service.hasCurrentUser();

            expect(result).toBe(false);
        });

        test('should return false when user ID is 0', async () => {
            (mockCache.get as jest.Mock).mockResolvedValue(0);

            const result = await service.hasCurrentUser();

            expect(result).toBe(false);
        });
    });

    describe('switchToUser', () => {
        test('should switch to existing user by email', async () => {
            (mockUserRepo.findByEmail as jest.Mock).mockResolvedValue(mockUser);
            (mockCache.set as jest.Mock).mockResolvedValue(true);

            const result = await service.switchToUser('test@example.com');

            expect(result).toBe(mockUser);
            expect(mockUserRepo.findByEmail).toHaveBeenCalledWith('test@example.com');
            expect(mockCache.set).toHaveBeenCalledWith('current-user-id', mockUser.id, 60 * 60 * 24 * 7 * 1000);
        });

        test('should return null and log warning when user not found', async () => {
            (mockUserRepo.findByEmail as jest.Mock).mockResolvedValue(null);

            const result = await service.switchToUser('nonexistent@example.com');

            expect(result).toBeNull();
            expect(mockLogger.warn).toHaveBeenCalledWith(
                { email: 'nonexistent@example.com' },
                'Attempted to switch to non-existent user'
            );
        });
    });

    describe('getCurrentUserOrFail', () => {
        test('should return user when current user exists', async () => {
            (mockCache.get as jest.Mock).mockResolvedValue(1);
            (mockUserRepo.findById as jest.Mock).mockResolvedValue(mockUser);

            const result = await service.getCurrentUserOrFail();

            expect(result).toBe(mockUser);
        });

        test('should throw error when no current user', async () => {
            (mockCache.get as jest.Mock).mockResolvedValue(null);

            await expect(service.getCurrentUserOrFail()).rejects.toThrow('No current user');
        });

        test('should throw error when current user not found in database', async () => {
            (mockCache.get as jest.Mock).mockResolvedValue(1);
            (mockUserRepo.findById as jest.Mock).mockResolvedValue(null);

            await expect(service.getCurrentUserOrFail()).rejects.toThrow('No current user');
        });
    });

    describe('getCurrentUserWithValidToken', () => {
        beforeEach(() => {
            (mockCache.get as jest.Mock).mockResolvedValue(1);
            (mockUserRepo.findById as jest.Mock).mockResolvedValue(mockUser);
            (mockUserRepo.findByIdOrFail as jest.Mock).mockResolvedValue(mockUser);
        });

        test('should return user with valid token when refresh succeeds', async () => {
            (mockTokenRefreshService.refreshTokensIfNeeded as jest.Mock).mockResolvedValue(true);

            const result = await service.getCurrentUserWithValidToken();

            expect(result).toBe(mockUser);
            expect(mockTokenRefreshService.refreshTokensIfNeeded).toHaveBeenCalledWith(mockUser.id);
            expect(mockUserRepo.findByIdOrFail).toHaveBeenCalledWith(mockUser.id);
        });

        test('should throw error when no current user', async () => {
            (mockCache.get as jest.Mock).mockResolvedValue(null);

            await expect(service.getCurrentUserWithValidToken()).rejects.toThrow('No current user');
        });

        test('should throw error when user has no access token', async () => {
            const userWithoutToken = { ...mockUser, accessToken: null };
            (mockUserRepo.findById as jest.Mock).mockResolvedValue(userWithoutToken);

            await expect(service.getCurrentUserWithValidToken()).rejects.toThrow('Current user has no access token');
        });

        test('should throw error when token refresh fails', async () => {
            (mockTokenRefreshService.refreshTokensIfNeeded as jest.Mock).mockResolvedValue(false);

            await expect(service.getCurrentUserWithValidToken()).rejects.toThrow(
                'Access token has expired and cannot be refreshed. Please re-authenticate.'
            );
        });

        test('should return fresh user data after token refresh', async () => {
            const refreshedUser = { ...mockUser, accessToken: 'new-access-token' };
            (mockTokenRefreshService.refreshTokensIfNeeded as jest.Mock).mockResolvedValue(true);
            (mockUserRepo.findByIdOrFail as jest.Mock).mockResolvedValue(refreshedUser);

            const result = await service.getCurrentUserWithValidToken();

            expect(result).toBe(refreshedUser);
            expect(mockUserRepo.findByIdOrFail).toHaveBeenCalledWith(mockUser.id);
        });
    });

    describe('cache configuration', () => {
        test('should use correct TTL when setting current user', async () => {
            (mockCache.set as jest.Mock).mockResolvedValue(true);

            await service.setCurrentUser(mockUser);

            // Verify TTL is 7 days (60 * 60 * 24 * 7 * 1000 ms)
            expect(mockCache.set).toHaveBeenCalledWith('current-user-id', mockUser.id, 604800000);
        });
    });

    describe('error handling', () => {
        test('should handle cache errors gracefully in getCurrentUser', async () => {
            (mockCache.get as jest.Mock).mockRejectedValue(new Error('Cache error'));

            await expect(service.getCurrentUser()).rejects.toThrow('Cache error');
        });

        test('should handle database errors in getCurrentUser', async () => {
            (mockCache.get as jest.Mock).mockResolvedValue(1);
            (mockUserRepo.findById as jest.Mock).mockRejectedValue(new Error('Database error'));

            await expect(service.getCurrentUser()).rejects.toThrow('Database error');
        });

        test('should handle cache errors in setCurrentUser', async () => {
            (mockCache.set as jest.Mock).mockRejectedValue(new Error('Cache set error'));

            await expect(service.setCurrentUser(mockUser)).rejects.toThrow('Cache set error');
        });
    });
});
