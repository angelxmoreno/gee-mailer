import { SyncProgressEntity } from '@app/database/entities';
import { BaseRepositoryService } from '@app/modules/typeorm/BaseRepositoryService.ts';
import { inject, singleton } from 'tsyringe';
import { DataSource } from 'typeorm';

@singleton()
export class SyncProgressRepository extends BaseRepositoryService<SyncProgressEntity> {
    constructor(@inject(DataSource) dataSource: DataSource) {
        super(dataSource, SyncProgressEntity);
    }
}
