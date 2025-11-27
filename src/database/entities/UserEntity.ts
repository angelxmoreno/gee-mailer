import { AppEntity } from '@app/modules/typeorm/AppEntity';
import { Column, Entity, Index } from 'typeorm';

@Entity()
export class UserEntity extends AppEntity {
    @Column({ type: 'varchar', length: 50, nullable: false })
    name: string;

    @Column({ type: 'varchar', length: 200, nullable: false })
    @Index({ unique: true })
    email: string;

    @Column({ type: 'varchar', length: 200, nullable: true })
    @Index({ unique: true })
    googleUid?: string | null;

    @Column({ type: 'text', nullable: true })
    accessToken?: string | null;

    @Column({ type: 'text', nullable: true })
    refreshToken?: string | null;

    @Column({ type: 'timestamp', nullable: true })
    tokenExpiryDate: Date | null;

    @Column({ nullable: true })
    historyId: string | null; // Store Gmail historyId for incremental sync

    @Column({ default: false })
    initialSyncCompleted: boolean; // Track initial sync completion state

    @Column({ default: false })
    labelSyncCompleted: boolean; // Track label sync completion

    @Column({ nullable: true })
    lastFullSyncAt: Date | null; // Track when last full sync occurred

    @Column({ nullable: true })
    lastIncrementalSyncAt: Date | null; // Track when last incremental sync occurred
}
