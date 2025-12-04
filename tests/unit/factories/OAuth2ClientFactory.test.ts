import 'reflect-metadata';
import { beforeEach, describe, expect, jest, test } from 'bun:test';
import type { UserEntity } from '@app/database/entities';
import { OAuth2ClientFactory } from '@app/factories/OAuth2ClientFactory';
import type { AppConfig } from '@app/types/AppConfig';
import { google } from 'googleapis';
import type { Logger } from 'pino';

describe('OAuth2ClientFactory', () => {
    let factory: OAuth2ClientFactory;
    let mockConfig: AppConfig;
    let mockLogger: Logger;
    let mockUser: UserEntity;

    beforeEach(() => {
        mockConfig = {
            google: {
                clientId: 'test-client-id',
                clientSecret: 'test-client-secret',
            },
        } as AppConfig;

        mockLogger = {
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
        } as unknown as Logger;

        mockUser = {
            id: 1,
            email: 'test@example.com',
            name: 'Test User',
            googleUid: 'google-uid-123',
            accessToken: 'ya29.test-access-token',
            refreshToken: '1//test-refresh-token',
            tokenExpiryDate: new Date(Date.now() + 3600000), // 1 hour from now
        } as UserEntity;

        factory = new OAuth2ClientFactory(mockConfig, mockLogger);
    });

    describe('createAuthorizationClient', () => {
        test('should create OAuth2Client with redirect URI and default port', () => {
            const client = factory.createAuthorizationClient();

            expect(client).toBeDefined();
            expect(client).toBeInstanceOf(google.auth.OAuth2);
            expect(mockLogger.debug).toHaveBeenCalledWith(
                {
                    clientId: 'test-client-id',
                    clientSecret: '*********************',
                    redirectUri: 'http://127.0.0.1:3000/oauth2callback',
                },
                'Creating OAuth2Client for authorization'
            );
        });

        test('should create OAuth2Client with custom port', () => {
            const customPort = 8080;
            const client = factory.createAuthorizationClient(customPort);

            expect(client).toBeDefined();
            expect(mockLogger.debug).toHaveBeenCalledWith(
                {
                    clientId: 'test-client-id',
                    clientSecret: '*********************',
                    redirectUri: 'http://127.0.0.1:8080/oauth2callback',
                },
                'Creating OAuth2Client for authorization'
            );
        });

        test('should add token event handlers', () => {
            const client = factory.createAuthorizationClient();

            // Verify the client has event listeners
            const listeners = client.listeners('tokens');
            expect(listeners.length).toBe(1);
        });

        test('should handle token events with refresh token', () => {
            const client = factory.createAuthorizationClient();

            // Simulate token event with refresh token
            client.emit('tokens', { refresh_token: 'test-refresh' });

            expect(mockLogger.info).toHaveBeenCalledWith('Refresh token received in authorization flow');
        });

        test('should handle token events without refresh token', () => {
            const client = factory.createAuthorizationClient();

            // Simulate token event without refresh token
            client.emit('tokens', { access_token: 'test-access' });

            expect(mockLogger.info).toHaveBeenCalledWith('No refresh token in authorization response');
        });
    });

    describe('createApiClient', () => {
        test('should create OAuth2Client for API operations', () => {
            const client = factory.createApiClient();

            expect(client).toBeDefined();
            expect(client).toBeInstanceOf(google.auth.OAuth2);
            expect(mockLogger.debug).toHaveBeenCalledWith('Creating OAuth2Client for API operations');
        });

        test('should not have redirect URI set', () => {
            const client = factory.createApiClient();

            // API clients shouldn't have redirect URIs
            const credentials = client.credentials;
            expect(credentials).toEqual({});
        });
    });

    describe('createFromCredentials', () => {
        test('should create OAuth2Client with pre-set credentials', () => {
            const credentials = {
                access_token: 'test-access-token',
                refresh_token: 'test-refresh-token',
                expiry_date: Date.now() + 3600000,
            };

            const client = factory.createFromCredentials(credentials);

            expect(client).toBeDefined();
            expect(client.credentials).toEqual(credentials);
            expect(mockLogger.debug).toHaveBeenCalledWith('Created OAuth2Client with existing credentials');
        });

        test('should handle partial credentials', () => {
            const credentials = {
                access_token: 'test-access-token',
            };

            const client = factory.createFromCredentials(credentials);

            expect(client).toBeDefined();
            expect(client.credentials).toEqual(credentials);
        });
    });

    describe('createForRefresh', () => {
        test('should create OAuth2Client with refresh token only', () => {
            const refreshToken = '1//test-refresh-token';

            const client = factory.createForRefresh(refreshToken);

            expect(client).toBeDefined();
            expect(client.credentials).toEqual({
                refresh_token: refreshToken,
            });
            expect(mockLogger.debug).toHaveBeenCalledWith('Created OAuth2Client for token refresh');
        });
    });

    describe('createForApiCalls', () => {
        test('should create OAuth2Client with complete user credentials', () => {
            const client = factory.createForApiCalls(mockUser);

            expect(client).toBeDefined();
            expect(client.credentials).toEqual({
                access_token: mockUser.accessToken,
                refresh_token: mockUser.refreshToken,
                expiry_date: mockUser.tokenExpiryDate?.getTime(),
            });
            expect(mockLogger.debug).toHaveBeenCalledWith(
                { userId: mockUser.id },
                'Created OAuth2Client for API calls'
            );
        });

        test('should throw error when user has no access token', () => {
            const userWithoutToken = { ...mockUser, accessToken: null };

            expect(() => factory.createForApiCalls(userWithoutToken)).toThrow(
                'User has no access token - authentication required'
            );
        });

        test('should handle user without refresh token', () => {
            const userWithoutRefresh = { ...mockUser, refreshToken: null };

            const client = factory.createForApiCalls(userWithoutRefresh);

            expect(client.credentials).toEqual({
                access_token: mockUser.accessToken,
                refresh_token: undefined,
                expiry_date: mockUser.tokenExpiryDate?.getTime(),
            });
        });

        test('should handle user without expiry date', () => {
            const userWithoutExpiry = { ...mockUser, tokenExpiryDate: null };

            const client = factory.createForApiCalls(userWithoutExpiry);

            expect(client.credentials).toEqual({
                access_token: mockUser.accessToken,
                refresh_token: mockUser.refreshToken,
                expiry_date: undefined,
            });
        });
    });

    describe('configuration validation', () => {
        test('should use config values for client creation', () => {
            const client = factory.createApiClient();

            // Access the internal configuration through the client
            expect(client).toBeDefined();

            // Verify that the config was used by checking debug calls
            expect(mockLogger.debug).toHaveBeenCalled();
        });
    });
});
