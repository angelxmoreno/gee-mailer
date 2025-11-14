import { UserEntity } from '@app/database/entities';
import { BaseRepositoryService } from '@app/modules/typeorm/BaseRepositoryService';
import { inject, singleton } from 'tsyringe';
import { DataSource } from 'typeorm';

@singleton()
export class UsersRepositories extends BaseRepositoryService<UserEntity> {
    constructor(@inject(DataSource) dataSource: DataSource) {
        super(dataSource, UserEntity);
    }
}
