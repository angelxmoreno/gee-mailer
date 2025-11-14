import type { FindOptionsOrder, FindOptionsRelations, FindOptionsWhere } from 'typeorm';
import { z } from 'zod';

export const PaginationOptionsSchema = z.object({
    page: z.number().min(1).default(1),
    limit: z.number().min(1).max(100).default(10),
    where: z.record(z.string(), z.unknown()).optional(),
    order: z.record(z.string(), z.enum(['ASC', 'DESC'])).optional(),
    relations: z.array(z.string()).optional(),
});

export const PaginatedResultSchema = z.object({
    items: z.array(z.any()),
    pagination: z.object({
        total: z.number(),
        page: z.number(),
        limit: z.number(),
        totalPages: z.number(),
    }),
});

export interface PaginationOptions<Entity = Record<string, unknown>>
    extends Omit<z.infer<typeof PaginationOptionsSchema>, 'where' | 'order' | 'relations'> {
    where?: FindOptionsWhere<Entity>;
    order?: FindOptionsOrder<Entity>;
    relations?: FindOptionsRelations<Entity>;
}

export interface PaginatedResult<Entity> extends Omit<z.infer<typeof PaginatedResultSchema>, 'items'> {
    items: Entity[];
}
