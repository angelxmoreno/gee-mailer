import { LabelEntity } from '@app/database/entities/LabelEntity.ts';
import { BaseRepositoryService } from '@app/modules/typeorm/BaseRepositoryService.ts';
import { inject, singleton } from 'tsyringe';
import { DataSource } from 'typeorm';

@singleton()
export class LabelsRepository extends BaseRepositoryService<LabelEntity> {
    constructor(@inject(DataSource) dataSource: DataSource) {
        super(dataSource, LabelEntity);
    }
}
