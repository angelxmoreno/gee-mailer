import 'reflect-metadata';
import { beforeEach, describe, expect, jest, test } from 'bun:test';
import type { UserEntity } from '@app/database/entities';
import type { UsersRepository } from '@app/database/repositories';
import type { OAuth2Client, OAuth2ClientFactory } from '@app/factories/OAuth2ClientFactory';
import { TokenRefreshService } from '@app/services/TokenRefreshService';
import type { Logger } from 'pino';

describe('TokenRefreshService', () => {
    let service: TokenRefreshService;
    let mockUserRepo: UsersRepository;
    let mockLogger: Logger;
    let mockOAuth2ClientFactory: OAuth2ClientFactory;
    let mockOAuth2Client: OAuth2Client;
    let mockUser: UserEntity;

    beforeEach(() => {
        mockOAuth2Client = {
            refreshAccessToken: jest.fn(),
        } as unknown as OAuth2Client;

        mockUserRepo = {
            findById: jest.fn(),
            findByIdOrFail: jest.fn(),
            update: jest.fn(),
        } as unknown as UsersRepository;

        mockLogger = {
            info: jest.fn(),
            error: jest.fn(),
            debug: jest.fn(),
        } as unknown as Logger;

        mockOAuth2ClientFactory = {
            createForRefresh: jest.fn().mockReturnValue(mockOAuth2Client),
        } as unknown as OAuth2ClientFactory;

        mockUser = {
            id: 1,
            email: 'test@example.com',
            name: 'Test User',
            accessToken: 'ya29.test-access-token',
            refreshToken: '1//test-refresh-token',
            tokenExpiryDate: new Date(Date.now() + 3600000), // 1 hour from now
        } as UserEntity;

        service = new TokenRefreshService(mockUserRepo, mockLogger, mockOAuth2ClientFactory);
    });

    describe('refreshTokensIfNeeded', () => {
        test('should return false when user not found', async () => {
            (mockUserRepo.findById as jest.Mock).mockResolvedValue(null);

            const result = await service.refreshTokensIfNeeded(1);

            expect(result).toBe(false);
        });

        test('should return false when user has no refresh token', async () => {
            const userWithoutRefreshToken = { ...mockUser, refreshToken: null };
            (mockUserRepo.findById as jest.Mock).mockResolvedValue(userWithoutRefreshToken);

            const result = await service.refreshTokensIfNeeded(1);

            expect(result).toBe(false);
        });

        test('should return true when token is not expiring soon', async () => {
            const userWithValidToken = {
                ...mockUser,
                tokenExpiryDate: new Date(Date.now() + 3600000), // 1 hour from now
            };
            (mockUserRepo.findById as jest.Mock).mockResolvedValue(userWithValidToken);

            const result = await service.refreshTokensIfNeeded(1);

            expect(result).toBe(true);
        });

        test('should refresh token when expiring soon', async () => {
            const userWithExpiringToken = {
                ...mockUser,
                tokenExpiryDate: new Date(Date.now() + 60000), // 1 minute from now (< 5 minute buffer)
            };
            (mockUserRepo.findById as jest.Mock).mockResolvedValue(userWithExpiringToken);
            (mockUserRepo.findByIdOrFail as jest.Mock).mockResolvedValue(userWithExpiringToken);
            (mockOAuth2Client.refreshAccessToken as jest.Mock).mockResolvedValue({
                credentials: {
                    access_token: 'new-access-token',
                    refresh_token: 'new-refresh-token',
                    expiry_date: Date.now() + 3600000,
                },
            });

            const result = await service.refreshTokensIfNeeded(1);

            expect(result).toBe(true);
            expect(mockOAuth2ClientFactory.createForRefresh).toHaveBeenCalledWith(userWithExpiringToken.refreshToken);
            expect(mockOAuth2Client.refreshAccessToken).toHaveBeenCalled();
        });

        test('should return false when refresh fails', async () => {
            const userWithExpiringToken = {
                ...mockUser,
                tokenExpiryDate: new Date(Date.now() + 60000),
            };
            (mockUserRepo.findById as jest.Mock).mockResolvedValue(userWithExpiringToken);
            (mockUserRepo.findByIdOrFail as jest.Mock).mockResolvedValue(userWithExpiringToken);
            (mockOAuth2Client.refreshAccessToken as jest.Mock).mockRejectedValue(new Error('Refresh failed'));

            const result = await service.refreshTokensIfNeeded(1);

            expect(result).toBe(false);
            expect(mockLogger.error).toHaveBeenCalled();
        });
    });

    describe('refreshAccessToken', () => {
        beforeEach(() => {
            (mockUserRepo.findByIdOrFail as jest.Mock).mockResolvedValue(mockUser);
        });

        test('should successfully refresh access token', async () => {
            const newCredentials = {
                access_token: 'new-access-token',
                refresh_token: 'new-refresh-token',
                expiry_date: Date.now() + 3600000,
            };
            (mockOAuth2Client.refreshAccessToken as jest.Mock).mockResolvedValue({
                credentials: newCredentials,
            });

            const result = await service.refreshAccessToken(1);

            expect(result).toBe(true);
            expect(mockOAuth2ClientFactory.createForRefresh).toHaveBeenCalledWith(mockUser.refreshToken);
            expect(mockUserRepo.update).toHaveBeenCalledWith(mockUser, {
                accessToken: newCredentials.access_token,
                tokenExpiryDate: new Date(newCredentials.expiry_date),
                refreshToken: newCredentials.refresh_token,
            });
            expect(mockLogger.info).toHaveBeenCalledWith({ userId: 1 }, 'Tokens refreshed successfully');
        });

        test('should throw error when user has no refresh token', async () => {
            const userWithoutRefreshToken = { ...mockUser, refreshToken: null };
            (mockUserRepo.findByIdOrFail as jest.Mock).mockResolvedValue(userWithoutRefreshToken);

            const result = await service.refreshAccessToken(1);

            expect(result).toBe(false);
            expect(mockLogger.error).toHaveBeenCalled();
        });

        test('should throw error when no access token received', async () => {
            (mockOAuth2Client.refreshAccessToken as jest.Mock).mockResolvedValue({
                credentials: {
                    // No access_token
                    refresh_token: 'new-refresh-token',
                },
            });

            const result = await service.refreshAccessToken(1);

            expect(result).toBe(false);
            expect(mockLogger.error).toHaveBeenCalled();
        });

        test('should handle refresh with only access token', async () => {
            const newCredentials = {
                access_token: 'new-access-token',
                // No refresh_token or expiry_date
            };
            (mockOAuth2Client.refreshAccessToken as jest.Mock).mockResolvedValue({
                credentials: newCredentials,
            });

            const result = await service.refreshAccessToken(1);

            expect(result).toBe(true);
            expect(mockUserRepo.update).toHaveBeenCalledWith(mockUser, {
                accessToken: newCredentials.access_token,
                tokenExpiryDate: null,
                refreshToken: mockUser.refreshToken, // Keep existing refresh token
            });
        });

        test('should handle OAuth2 client errors', async () => {
            (mockOAuth2Client.refreshAccessToken as jest.Mock).mockRejectedValue(new Error('Token refresh failed'));

            const result = await service.refreshAccessToken(1);

            expect(result).toBe(false);
            expect(mockLogger.error).toHaveBeenCalledWith(
                { userId: 1, error: expect.any(Error) },
                'Failed to refresh tokens'
            );
        });
    });

    describe('isTokenExpiringSoon', () => {
        test('should return true when user not found', async () => {
            (mockUserRepo.findById as jest.Mock).mockResolvedValue(null);

            const result = await service.isTokenExpiringSoon(1);

            expect(result).toBe(true);
        });

        test('should return true when token has no expiry date', async () => {
            const userWithoutExpiry = { ...mockUser, tokenExpiryDate: null };
            (mockUserRepo.findById as jest.Mock).mockResolvedValue(userWithoutExpiry);

            const result = await service.isTokenExpiringSoon(1);

            expect(result).toBe(true);
        });

        test('should return true when token is expiring within buffer', async () => {
            const expiringUser = {
                ...mockUser,
                tokenExpiryDate: new Date(Date.now() + 60000), // 1 minute from now
            };
            (mockUserRepo.findById as jest.Mock).mockResolvedValue(expiringUser);

            const result = await service.isTokenExpiringSoon(1, 5); // 5 minute buffer

            expect(result).toBe(true);
        });

        test('should return false when token is not expiring soon', async () => {
            const validUser = {
                ...mockUser,
                tokenExpiryDate: new Date(Date.now() + 3600000), // 1 hour from now
            };
            (mockUserRepo.findById as jest.Mock).mockResolvedValue(validUser);

            const result = await service.isTokenExpiringSoon(1, 5); // 5 minute buffer

            expect(result).toBe(false);
        });

        test('should use custom buffer time', async () => {
            const user = {
                ...mockUser,
                tokenExpiryDate: new Date(Date.now() + 120000), // 2 minutes from now
            };
            (mockUserRepo.findById as jest.Mock).mockResolvedValue(user);

            // With 1 minute buffer, should not be expiring
            const result1 = await service.isTokenExpiringSoon(1, 1);
            expect(result1).toBe(false);

            // With 5 minute buffer, should be expiring
            const result2 = await service.isTokenExpiringSoon(1, 5);
            expect(result2).toBe(true);
        });
    });

    describe('private helper: isUserTokenExpiringSoon', () => {
        test('should handle edge case of exact expiry time', async () => {
            const now = new Date();
            const userWithExactExpiry = {
                ...mockUser,
                tokenExpiryDate: new Date(now.getTime() + 5 * 60 * 1000), // Exactly 5 minutes from now
            };

            // Mock the current time to test the exact boundary
            const originalDate = global.Date;
            global.Date = class extends Date {
                constructor(...args: unknown[]) {
                    if (args.length === 0) {
                        super(now);
                    } else {
                        super(...(args as [string | number | Date]));
                    }
                }
            } as DateConstructor;

            try {
                (mockUserRepo.findById as jest.Mock).mockResolvedValue(userWithExactExpiry);

                const service = new TokenRefreshService(mockUserRepo, mockLogger, mockOAuth2ClientFactory);

                // Test the boundary condition - exactly 5 minutes should be considered expiring soon
                const result = await service.isTokenExpiringSoon(1, 5);
                expect(result).toBe(true); // 5-minute buffer means exactly 5 minutes = expiring soon

                expect(mockUserRepo.findById).toHaveBeenCalledWith(1);
            } finally {
                // Ensure Date mock is always cleaned up
                global.Date = originalDate;
            }
        });
    });
});
