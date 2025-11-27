import { AppEntity } from '@app/modules/typeorm/AppEntity.ts';
import { Column, Entity, Index } from 'typeorm';

@Entity()
@Index(['userId', 'syncType'], { unique: true })
export class SyncProgressEntity extends AppEntity {
    @Column({ type: 'int' })
    userId: number;

    @Column({ type: 'varchar', length: 64, nullable: true, default: null })
    nextPageToken: string | null;

    @Column({ type: 'int', default: 0 })
    numProcessed: number;

    @Column({ type: 'int', default: 0 })
    numTotal: number;

    @Column({ type: 'enum', enum: ['initial', 'incremental', 'labels'], default: 'initial' })
    syncType: 'initial' | 'incremental' | 'labels';

    @Column({ type: 'enum', enum: ['pending', 'in_progress', 'completed', 'failed'], default: 'pending' })
    status: 'pending' | 'in_progress' | 'completed' | 'failed';

    @Column({ type: 'int', default: 0 })
    batchesTotal: number;

    @Column({ type: 'int', default: 0 })
    batchesCompleted: number;

    @Column({ type: 'text', nullable: true })
    errorMessage: string | null;

    @Column({ type: 'timestamp', nullable: true })
    startedAt: Date | null;

    @Column({ type: 'timestamp', nullable: true })
    completedAt: Date | null;

    shouldStillFetch(): boolean {
        return this.nextPageToken !== 'finished';
    }

    getProgressPercentage(): number {
        if (this.batchesTotal === 0) return 0;
        return Math.round((this.batchesCompleted / this.batchesTotal) * 100);
    }
}
