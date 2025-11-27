import type { PaginatedResult, PaginationOptions } from '@app/types/Pagination';
import type { DataSource, DeepPartial, EntityTarget, FindManyOptions, FindOptionsWhere, Repository } from 'typeorm';
import type { AppEntity } from './AppEntity';
import type { RepositoryServiceInterface } from './RepositoryServiceInterface';
import type { QueryDeepPartialEntity } from './types';

export class BaseRepositoryService<T extends AppEntity> implements RepositoryServiceInterface<T> {
    protected dataSource: DataSource;
    protected repo: Repository<T>;

    constructor(dataSource: DataSource, target: EntityTarget<T>) {
        this.dataSource = dataSource;
        this.repo = dataSource.getRepository(target);
    }

    public get repository(): Repository<T> {
        return this.repo;
    }

    async findById(id: number | string, options?: { relations?: string[] }): Promise<T | null> {
        return this.repo.findOne({
            where: { id } as FindOptionsWhere<T>,
            relations: options?.relations,
        });
    }

    async findByIdOrFail(id: number | string): Promise<T> {
        return this.repo.findOneByOrFail({ id } as FindOptionsWhere<T>);
    }

    async findMany(where: FindOptionsWhere<T> | FindOptionsWhere<T>[]): Promise<T[]> {
        return this.repo.find({ where });
    }

    async findOne(where: FindOptionsWhere<T>): Promise<T | null> {
        return this.repo.findOne({ where });
    }

    async exists(where: FindOptionsWhere<T>): Promise<boolean> {
        const count = await this.repo.count({ where, take: 1 });
        return count > 0;
    }

    async count(where?: FindOptionsWhere<T>): Promise<number> {
        return this.repo.count(where ? { where } : undefined);
    }

    async save(entity: DeepPartial<T>): Promise<T> {
        return this.repo.save(entity);
    }

    async saveMany(entities: DeepPartial<T>[]): Promise<T[]> {
        return this.repo.save(entities);
    }

    async update(mergeIntoEntity: T, ...entityLikes: DeepPartial<T>[]): Promise<T> {
        const merged = this.repo.merge(mergeIntoEntity, ...entityLikes);
        return this.repo.save(merged);
    }

    async remove(id: number | string): Promise<void> {
        await this.repo.softDelete(id);
    }

    async deleteMany(ids: (number | string)[]): Promise<void> {
        await this.repo.softDelete(ids as string[] | number[]);
    }

    async clearTable(): Promise<void> {
        await this.repo.clear();
    }

    async upsert(
        entity: QueryDeepPartialEntity<T>,
        conflictPathsOrOptions: string[],
        options?: { relations?: string[] }
    ): Promise<T> {
        if (Array.isArray(entity)) {
            throw new Error(
                'Upserting an array of entities is not supported by this method. Please upsert one entity at a time.'
            );
        }

        const result = await this.repo.upsert(entity, conflictPathsOrOptions);

        const firstPrimaryColumn = this.repo.metadata.primaryColumns.at(0);
        const primaryColumn = firstPrimaryColumn?.propertyName;

        if (!primaryColumn) {
            throw new Error('Cannot reload entity after upsert: entity has no primary keys');
        }

        // TypeORM's upsert returns identifiers for affected rows
        // For new inserts, we can use the generated identifier
        // For updates, we need to use the original identifier from the entity
        const identifier = result.identifiers?.[0];
        const entityId = identifier?.[primaryColumn] || (entity as Record<string, unknown>)[primaryColumn];

        if (!entityId) {
            throw new Error('Cannot reload entity after upsert: no identifier found in result or entity');
        }

        const reloadedEntity = await this.findById(entityId as number | string, {
            relations: options?.relations,
        });

        if (!reloadedEntity) {
            const whereClause: FindOptionsWhere<T> = {};
            for (const path of conflictPathsOrOptions) {
                if (path in entity) {
                    // biome-ignore lint/suspicious/noExplicitAny: This is necessary for dynamic where clause construction.
                    (whereClause as any)[path] = (entity as any)[path];
                }
            }

            if (Object.keys(whereClause).length > 0) {
                const foundByConflictPath = await this.findOne(whereClause);
                if (foundByConflictPath) {
                    return foundByConflictPath;
                }
            }

            throw new Error(
                `Entity with id ${entityId} not found after upsert operation, and could not be found via conflict paths.`
            );
        }

        return reloadedEntity;
    }

    async softDelete(id: number | string): Promise<void> {
        await this.repo.softDelete(id);
    }

    async restore(id: number | string): Promise<void> {
        await this.repo.restore(id);
    }

    async findPaginated(options: PaginationOptions<T>): Promise<PaginatedResult<T>> {
        const { page = 1, limit = 10, where, order = { id: 'DESC' }, relations } = options;

        const [items, total] = await this.repo.findAndCount({
            where,
            order,
            relations,
            take: limit,
            skip: (page - 1) * limit,
        } as FindManyOptions<T>);

        return {
            items,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        };
    }
}
