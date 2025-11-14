import type { DeepPartial } from 'typeorm';
import type { AppEntity } from './AppEntity';
import type { PartialWithRequired } from './types';

export interface FactoryInterface<
    TEntity extends AppEntity,
    TCreateDto extends DeepPartial<TEntity>,
    TRequiredKeys extends keyof TCreateDto = never,
> {
    build(overrides?: PartialWithRequired<TCreateDto, TRequiredKeys>): TCreateDto;

    create(overrides?: PartialWithRequired<TCreateDto, TRequiredKeys>): Promise<TEntity>;

    createMany(overrides?: PartialWithRequired<TCreateDto, TRequiredKeys>, count?: number): Promise<TEntity[]>;
}
