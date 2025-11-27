import { SyncProgressEntity } from '@app/database/entities';
import { BaseRepositoryService } from '@app/modules/typeorm/BaseRepositoryService.ts';
import { inject, singleton } from 'tsyringe';
import { DataSource, In } from 'typeorm';

@singleton()
export class SyncProgressRepository extends BaseRepositoryService<SyncProgressEntity> {
    constructor(@inject(DataSource) dataSource: DataSource) {
        super(dataSource, SyncProgressEntity);
    }

    /**
     * Create a new sync progress record
     */
    async createSyncProgress(
        userId: number,
        syncType: 'initial' | 'incremental' | 'labels' = 'initial'
    ): Promise<SyncProgressEntity> {
        // Remove any existing progress for this user and sync type
        const existing = await this.findMany({ userId, syncType });
        if (existing.length > 0) {
            await this.deleteMany(existing.map((e) => e.id));
        }

        const progressData = {
            userId,
            syncType,
            status: 'pending' as const,
            startedAt: new Date(),
        };

        return this.save(progressData);
    }

    /**
     * Update sync progress
     */
    async updateProgress(
        progressEntity: SyncProgressEntity,
        updates: Partial<{
            numProcessed: number;
            numTotal: number;
            batchesCompleted: number;
            batchesTotal: number;
            status: 'pending' | 'in_progress' | 'completed' | 'failed';
            nextPageToken: string | null;
        }>
    ): Promise<SyncProgressEntity> {
        return this.update(progressEntity, updates);
    }

    /**
     * Mark sync progress as completed
     */
    async markCompleted(progressEntity: SyncProgressEntity): Promise<SyncProgressEntity> {
        return this.update(progressEntity, {
            status: 'completed',
            completedAt: new Date(),
        });
    }

    /**
     * Mark sync progress as failed
     */
    async markFailed(progressEntity: SyncProgressEntity, errorMessage: string): Promise<SyncProgressEntity> {
        return this.update(progressEntity, {
            status: 'failed',
            errorMessage,
            completedAt: new Date(),
        });
    }

    /**
     * Find active sync progress for a user
     */
    async findActiveByUser(userId: number): Promise<SyncProgressEntity[]> {
        return this.findMany({
            userId,
            status: In(['pending', 'in_progress']),
        });
    }

    /**
     * Find sync progress by user and type
     */
    async findByUserAndType(
        userId: number,
        syncType: 'initial' | 'incremental' | 'labels'
    ): Promise<SyncProgressEntity | null> {
        return this.findOne({ userId, syncType });
    }
}
