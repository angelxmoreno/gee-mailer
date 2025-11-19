import type { Job, QueueOptions, WorkerOptions } from 'bullmq';
import type { RedisOptions } from 'ioredis';
import type { ZodType } from 'zod';

// Custom options types that don't require connection (handled at config level)
export type CustomQueueOptions = Omit<QueueOptions, 'connection'>;
export type CustomWorkerOptions = Omit<WorkerOptions, 'connection'>;

export type WorkerDefinition = {
    // biome-ignore lint/suspicious/noExplicitAny: we need "any" to avoid typing madness
    processor: (job: Job<any>) => Promise<void>;
    options?: CustomWorkerOptions;
    // biome-ignore lint/suspicious/noExplicitAny: we need "any" to avoid typing madness
    schema?: ZodType<any>; // Optional schema for payload validation in producers
};

export type QueueDefinition = {
    options?: CustomQueueOptions;
    workers: Record<string, WorkerDefinition>;
};

export type QueueJobNames<Q extends QueueDefinition> = keyof Q['workers'];

export type QueueConfig = {
    queues: Record<string, QueueDefinition>;
    connection: RedisOptions;
};

// Function that enforces strict QueueConfig type while preserving exact literal types
export function createQueueConfig<T extends QueueConfig>(config: T & QueueConfig): T {
    return config;
}
