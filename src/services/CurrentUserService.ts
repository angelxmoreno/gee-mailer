import type { UserEntity } from '@app/database/entities';
import { UsersRepository } from '@app/database/repositories';
import { TokenRefreshService } from '@app/services/TokenRefreshService';
import { AppCache, AppLogger } from '@app/utils/tokens';
import type Keyv from '@keyvhq/core';
import type { Logger } from 'pino';
import { inject, singleton } from 'tsyringe';

@singleton()
export class CurrentUserService {
    protected cache: Keyv<number>;
    protected logger: Logger;
    protected userRepo: UsersRepository;
    protected tokenRefreshService: TokenRefreshService;
    protected cacheKey = 'current-user-id';
    protected cacheTtlMs = 60 * 60 * 24 * 7 * 1000; // 7 days

    constructor(
        @inject(AppLogger) logger: Logger,
        @inject(AppCache) cache: Keyv,
        @inject(UsersRepository) userRepo: UsersRepository,
        @inject(TokenRefreshService) tokenRefreshService: TokenRefreshService
    ) {
        this.cache = cache;
        this.logger = logger;
        this.userRepo = userRepo;
        this.tokenRefreshService = tokenRefreshService;
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
     * Gets the current user and ensures their tokens are valid (refreshes if needed)
     */
    async getCurrentUserWithValidToken(): Promise<UserEntity> {
        const currentUser = await this.getCurrentUserOrFail();

        if (!currentUser.accessToken) {
            throw new Error('Current user has no access token');
        }

        // Use TokenRefreshService to refresh if needed
        const refreshSuccessful = await this.tokenRefreshService.refreshTokensIfNeeded(currentUser.id);

        if (!refreshSuccessful) {
            throw new Error('Access token has expired and cannot be refreshed. Please re-authenticate.');
        }

        // Return fresh user data (tokens may have been updated)
        return await this.userRepo.findByIdOrFail(currentUser.id);
    }
}
