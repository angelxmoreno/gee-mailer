import type { UserEntity } from '@app/database/entities';
import { UsersRepository } from '@app/database/repositories';
import { AppCache, AppLogger } from '@app/utils/tokens';
import type Keyv from '@keyvhq/core';
import { google } from 'googleapis';
import type { Logger } from 'pino';
import { inject, singleton } from 'tsyringe';

@singleton()
export class CurrentUserService {
    protected cache: Keyv<number>;
    protected logger: Logger;
    protected userRepo: UsersRepository;
    protected cacheKey = 'current-user-id';
    protected cacheTtlMs = 60 * 60 * 24 * 1000; // 1 day

    constructor(
        @inject(AppLogger) logger: Logger,
        @inject(AppCache) cache: Keyv,
        @inject(UsersRepository) userRepo: UsersRepository
    ) {
        this.cache = cache;
        this.logger = logger;
        this.userRepo = userRepo;
    }

    async getCurrentUser(): Promise<UserEntity | null> {
        const userId = await this.cache.get(this.cacheKey);
        if (!userId) {
            return null;
        }

        const user = await this.userRepo.findById(userId);
        if (!user) {
            // Clean up invalid cache entry
            await this.clearCurrentUser();
            this.logger.warn({ userId }, 'Current user not found in database, clearing cache');
            return null;
        }

        return user;
    }

    async setCurrentUser(user: UserEntity): Promise<void> {
        await this.cache.set(this.cacheKey, user.id, this.cacheTtlMs);
        this.logger.info({ userId: user.id, email: user.email }, 'Current user set');
    }

    async getCurrentUserId(): Promise<number | null> {
        return (await this.cache.get(this.cacheKey)) || null;
    }

    async clearCurrentUser(): Promise<void> {
        await this.cache.delete(this.cacheKey);
        this.logger.info('Current user cleared');
    }

    async hasCurrentUser(): Promise<boolean> {
        return !!(await this.getCurrentUserId());
    }

    /**
     * Switch to a different user by email
     */
    async switchToUser(email: string): Promise<UserEntity | null> {
        const user = await this.userRepo.findByEmail(email);
        if (!user) {
            this.logger.warn({ email }, 'Attempted to switch to non-existent user');
            return null;
        }

        await this.setCurrentUser(user);
        return user;
    }

    async getCurrentUserOrFail() {
        const currentUser = await this.getCurrentUser();
        if (!currentUser) {
            throw new Error('No current user');
        }
        return currentUser;
    }

    /**
     * Gets the current user and validates their tokens are not expired
     */
    async getCurrentUserWithValidToken(): Promise<UserEntity> {
        const currentUser = await this.getCurrentUserOrFail();

        if (!currentUser.accessToken) {
            throw new Error('Current user has no access token');
        }

        // Check if token needs refresh (expires within 5 minutes) or is already expired
        if (this.shouldRefreshToken(currentUser)) {
            if (!currentUser.refreshToken) {
                throw new Error('Access token has expired and cannot be refreshed. Please re-authenticate.');
            }
            return this.refreshUserToken(currentUser);
        }

        return currentUser;
    }

    /**
     * Determines if the user's access token should be refreshed
     */
    protected shouldRefreshToken(user: UserEntity): boolean {
        if (!user.tokenExpiryDate) {
            return false;
        }

        const expiryDate =
            typeof user.tokenExpiryDate === 'string' ? new Date(user.tokenExpiryDate) : user.tokenExpiryDate;

        // Refresh if token is expired or expires within 5 minutes
        const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000);
        return expiryDate <= fiveMinutesFromNow;
    }

    /**
     * Refreshes the user's access token using the refresh token
     */
    protected async refreshUserToken(user: UserEntity): Promise<UserEntity> {
        if (!user.refreshToken) {
            throw new Error('No refresh token available for user');
        }

        this.logger.debug({ userId: user.id }, 'Refreshing access token');

        try {
            // Create OAuth2 client with environment credentials
            const oauth2Client = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);

            // Set the refresh token
            oauth2Client.setCredentials({
                refresh_token: user.refreshToken,
            });

            // Refresh the access token
            const { credentials } = await oauth2Client.refreshAccessToken();

            // Update user with new token information
            const updatedUser = await this.userRepo.repository.save({
                ...user,
                accessToken: credentials.access_token || user.accessToken,
                refreshToken: credentials.refresh_token || user.refreshToken,
                tokenExpiryDate: credentials.expiry_date ? new Date(credentials.expiry_date) : user.tokenExpiryDate,
            });

            this.logger.info({ userId: user.id }, 'Access token refreshed successfully');

            return updatedUser;
        } catch (error) {
            this.logger.error(
                {
                    userId: user.id,
                    error: error instanceof Error ? error.message : String(error),
                },
                'Failed to refresh access token'
            );
            throw new Error('Failed to refresh access token. Please re-authenticate.');
        }
    }
}
