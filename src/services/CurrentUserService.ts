import type { UserEntity } from '@app/database/entities';
import type { UsersRepository } from '@app/database/repositories';
import type Keyv from '@keyvhq/core';
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
        @inject('AppLogger') logger: Logger,
        @inject('AppCache') cache: Keyv,
        @inject('UsersRepository') userRepo: UsersRepository
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
}
