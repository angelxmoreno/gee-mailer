import type { PaginatedResult, PaginationOptions } from '@app/types/Pagination.ts';
import type { DeepPartial, FindOptionsWhere } from 'typeorm';
import type { AppEntity } from './AppEntity';
import type { QueryDeepPartialEntity } from './types';

export interface RepositoryServiceInterface<T extends AppEntity> {
    findById(id: number | string): Promise<T | null>;

    findByIdOrFail(id: number | string): Promise<T>;

    findMany(where: FindOptionsWhere<T>): Promise<T[]>;

    findOne(where: FindOptionsWhere<T>): Promise<T | null>;

    exists(where: FindOptionsWhere<T>): Promise<boolean>;

    count(where?: FindOptionsWhere<T>): Promise<number>;

    save(entity: DeepPartial<T>): Promise<T>;

    saveMany(entities: DeepPartial<T>[]): Promise<T[]>;

    update(mergeIntoEntity: T, ...entityLikes: DeepPartial<T>[]): Promise<T>;

    remove(id: number | string): Promise<void>;

    deleteMany(ids: (number | string)[]): Promise<void>;

    clearTable(): Promise<void>;

    upsert(
        entity: QueryDeepPartialEntity<T>,
        conflictPathsOrOptions: string[],
        options?: { relations?: string[] }
    ): Promise<T>;

    softDelete(id: number | string): Promise<void>;

    restore(id: number | string): Promise<void>;

    findPaginated(options: PaginationOptions<T>): Promise<PaginatedResult<T>>;
}
