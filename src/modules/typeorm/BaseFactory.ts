import type { DeepPartial } from 'typeorm';
import type { AppEntity } from './AppEntity';
import type { BaseRepositoryService } from './BaseRepositoryService';
import type { FactoryInterface } from './FactoryInterface';
import type { PartialWithRequired } from './types';

export abstract class BaseFactory<
    TEntity extends AppEntity,
    TCreateDto extends DeepPartial<TEntity>,
    TRequiredKeys extends keyof TCreateDto = never,
> implements FactoryInterface<TEntity, TCreateDto, TRequiredKeys>
{
    repo: BaseRepositoryService<TEntity>;

    protected constructor(repo: BaseRepositoryService<TEntity>) {
        this.repo = repo;
    }

    abstract build(overrides?: PartialWithRequired<TCreateDto, TRequiredKeys>): TCreateDto;

    async create(overrides?: PartialWithRequired<TCreateDto, TRequiredKeys>): Promise<TEntity> {
        const entity: TCreateDto = this.build(overrides);
        try {
            return this.repo.save(entity);
        } catch (e) {
            const errMessage = `Unable to save entity due to: ${(e as Error).message}`;
            console.error(errMessage, {
                entity,
                error: e,
            });
            throw new Error(errMessage, {
                cause: e,
            });
        }
    }

    async createMany(overrides?: PartialWithRequired<TCreateDto, TRequiredKeys>, count = 5): Promise<TEntity[]> {
        const entities: Array<TCreateDto> = [];

        try {
            for (let i = 0; i < count; i++) {
                const entity = this.build(overrides);
                entities.push(entity);
            }
            return this.repo.saveMany(entities);
        } catch (e) {
            const errMessage = `Unable to save ${entities.length} entities due to: ${(e as Error).message}`;
            console.error(errMessage, {
                firstEntities: entities.slice(0, 10),
                error: e,
            });
            throw new Error(errMessage, {
                cause: e,
            });
        }
    }
}
