import { AppEntity } from '@app/modules/typeorm/AppEntity.ts';
import { Column, Entity, Index } from 'typeorm';

@Entity()
export class SyncProgressEntity extends AppEntity {
    @Column({ type: 'int' })
    @Index({ unique: true })
    userId: number;

    @Column({ type: 'varchar', length: 64, nullable: true, default: null })
    nextPageToken: string | null;

    @Column({ type: 'int', default: 0 })
    numProcessed: number;

    @Column({ type: 'int', default: 0 })
    numTotal: number;

    shouldStillFetch(): boolean {
        return this.nextPageToken !== 'finished';
    }
}
