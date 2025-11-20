import type { UserEntity } from '@app/database/entities';
import { UsersRepository } from '@app/database/repositories';
import { AppLogger } from '@app/utils/tokens';
import type { Logger } from 'pino';
import { inject, singleton } from 'tsyringe';

@singleton()
export class SyncStateService {
    protected logger: Logger;
    protected usersRepo: UsersRepository;

    constructor(@inject(AppLogger) logger: Logger, @inject(UsersRepository) usersRepo: UsersRepository) {
        this.logger = logger;
        this.usersRepo = usersRepo;
    }

    /**
     * Update user sync state atomically
     */
    async updateUserSyncState(
        userId: number,
        updates: Partial<{
            historyId: string;
            initialSyncCompleted: boolean;
            labelSyncCompleted: boolean;
            lastFullSyncAt: Date;
            lastIncrementalSyncAt: Date;
        }>
    ): Promise<void> {
        const user = await this.usersRepo.findByIdOrFail(userId);
        await this.usersRepo.update(user, updates);
        this.logger.debug({ userId, updates }, 'User sync state updated');
    }

    /**
     * Check if user can perform incremental sync
     */
    async canPerformIncrementalSync(userId: number): Promise<boolean> {
        const user = await this.usersRepo.findByIdOrFail(userId);
        const canSync = !!(user?.initialSyncCompleted && user?.labelSyncCompleted && user?.historyId);

        this.logger.debug({ userId, canSync, hasHistoryId: !!user?.historyId }, 'Checked incremental sync eligibility');

        return canSync;
    }

    /**
     * Get user sync state summary
     */
    async getUserSyncState(userId: number): Promise<{
        user: UserEntity | null;
        canIncrementalSync: boolean;
        needsInitialSync: boolean;
        needsLabelSync: boolean;
    }> {
        const user = await this.usersRepo.findById(userId);

        if (!user) {
            return {
                user: null,
                canIncrementalSync: false,
                needsInitialSync: true,
                needsLabelSync: true,
            };
        }

        const canIncrementalSync = await this.canPerformIncrementalSync(userId);

        return {
            user,
            canIncrementalSync,
            needsInitialSync: !user.initialSyncCompleted,
            needsLabelSync: !user.labelSyncCompleted,
        };
    }

    /**
     * Reset user sync state for troubleshooting
     */
    async resetUserSyncState(userId: number, resetType: 'full' | 'incremental' = 'full'): Promise<void> {
        if (resetType === 'full') {
            await this.updateUserSyncState(userId, {
                historyId: undefined,
                initialSyncCompleted: false,
                labelSyncCompleted: false,
                lastFullSyncAt: undefined,
                lastIncrementalSyncAt: undefined,
            });
            this.logger.info({ userId }, 'Full sync state reset completed');
        } else {
            await this.updateUserSyncState(userId, {
                historyId: undefined,
                lastIncrementalSyncAt: undefined,
            });
            this.logger.info({ userId }, 'Incremental sync state reset completed');
        }
    }
}
