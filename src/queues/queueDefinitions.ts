import 'reflect-metadata';
import { appContainer } from '@app/config.ts';
import { createQueueConfig } from '@app/modules/bullmq/types';
import {
    type AttachmentDownloadPayload,
    AttachmentDownloadSchema,
    type IncrementalSyncPayload,
    IncrementalSyncSchema,
    type InitialSyncPayload,
    InitialSyncSchema,
    type LabelSyncPayload,
    LabelSyncSchema,
    type MessageBatchPayload,
    MessageBatchSchema,
} from '@app/queues/types.ts';
import { AttachmentDownloadProcessor } from '@app/services/AttachmentDownloadProcessor.ts';
import { IncrementalSyncProcessor } from '@app/services/IncrementalSyncProcessor.ts';
import { InitialSyncProcessor } from '@app/services/InitialSyncProcessor.ts';
import { LabelsSyncProcessor } from '@app/services/LabelsSyncProcessor.ts';
import { MessageBatchProcessor } from '@app/services/MessageBatchProcessor.ts';
import type { Job } from 'bullmq';
import { DataSource } from 'typeorm';
import { z } from 'zod';

// Worker schemas
const EmailSendSchema = z.object({
    to: z.email({ message: 'Invalid email address' }),
    template: z.string(),
});

// Queue configuration with connection settings
const queueConfig = createQueueConfig({
    queues: {
        emailSend: {
            options: {
                defaultJobOptions: {
                    removeOnComplete: 100,
                    removeOnFail: 50,
                    attempts: 3,
                    backoff: {
                        type: 'exponential',
                        delay: 2000,
                    },
                },
            },
            workers: {
                afterSignUpEmail: {
                    schema: EmailSendSchema,
                    processor: async (job: Job<z.infer<typeof EmailSendSchema>>) =>
                        console.log('Sending email:', job.data),
                    options: {
                        concurrency: 5,
                        limiter: {
                            max: 100,
                            duration: 60000, // 100 emails per minute
                        },
                    },
                },
            },
        },
        dbOperations: {
            options: {
                defaultJobOptions: {
                    removeOnComplete: 10,
                    removeOnFail: 10,
                    delay: 5000, // 5 second delay for DB operations
                },
            },
            workers: {
                dbCleanUp: {
                    processor: async () => console.log('Cleaning DB'),
                    options: {
                        concurrency: 1, // Single-threaded DB cleanup
                        limiter: {
                            max: 1,
                            duration: 30000, // Max 1 cleanup every 30 seconds
                        },
                    },
                },
            },
        },
        gmailSync: {
            options: {
                defaultJobOptions: {
                    removeOnComplete: 50,
                    removeOnFail: 100,
                    attempts: 5,
                    backoff: { type: 'exponential', delay: 5000 },
                },
            },
            workers: {
                initialSync: {
                    schema: InitialSyncSchema,
                    processor: async (job: Job<InitialSyncPayload>) => {
                        // Only process jobs with matching name
                        if (job.name !== 'initialSync') {
                            return;
                        }

                        // Ensure database is initialized
                        const dataSource = appContainer.resolve(DataSource);
                        const initialSyncProcessor = appContainer.resolve(InitialSyncProcessor);

                        if (!dataSource.isInitialized) {
                            await dataSource.initialize();
                        }

                        const { userId } = job.data;
                        return initialSyncProcessor.process(userId, enqueueMessageBatch);
                    },
                    options: {
                        concurrency: 1,
                        limiter: { max: 3, duration: 60000 },
                    },
                },
                incrementalSync: {
                    schema: IncrementalSyncSchema,
                    processor: async (job: Job<IncrementalSyncPayload>) => {
                        // Only process jobs with matching name
                        if (job.name !== 'incrementalSync') {
                            return;
                        }

                        // Ensure database is initialized
                        const dataSource = appContainer.resolve(DataSource);
                        const incrementalSyncProcessor = appContainer.resolve(IncrementalSyncProcessor);

                        if (!dataSource.isInitialized) {
                            await dataSource.initialize();
                        }

                        const { userId } = job.data;
                        return incrementalSyncProcessor.process(userId, enqueueMessageBatch);
                    },
                    options: {
                        concurrency: 5,
                        limiter: { max: 15, duration: 60000 },
                    },
                },
                messageBatch: {
                    schema: MessageBatchSchema,
                    processor: async (job: Job<MessageBatchPayload>) => {
                        // Only process jobs with matching name
                        if (job.name !== 'messageBatch') {
                            return;
                        }

                        // Ensure database is initialized
                        const dataSource = appContainer.resolve(DataSource);
                        const messageBatchProcessor = appContainer.resolve(MessageBatchProcessor);

                        if (!dataSource.isInitialized) {
                            await dataSource.initialize();
                        }

                        return messageBatchProcessor.process(job.data, enqueueMessageBatch);
                    },
                    options: {
                        concurrency: 8,
                        limiter: { max: 60, duration: 60000 },
                    },
                },
            },
        },

        attachments: {
            options: {
                defaultJobOptions: {
                    removeOnComplete: 50,
                    removeOnFail: 100,
                    attempts: 3,
                    backoff: { type: 'exponential', delay: 3000 },
                },
            },
            workers: {
                downloadAttachment: {
                    schema: AttachmentDownloadSchema,
                    processor: async (job: Job<AttachmentDownloadPayload>) => {
                        // Only process jobs with matching name
                        if (job.name !== 'downloadAttachment') {
                            return;
                        }

                        // Ensure database is initialized
                        const dataSource = appContainer.resolve(DataSource);
                        const attachmentDownloadProcessor = appContainer.resolve(AttachmentDownloadProcessor);

                        if (!dataSource.isInitialized) {
                            await dataSource.initialize();
                        }

                        return attachmentDownloadProcessor.process(job.data);
                    },
                    options: {
                        concurrency: 3, // Moderate concurrency for downloads
                        limiter: { max: 10, duration: 60000 }, // 10 downloads per minute to respect Gmail API limits
                    },
                },
            },
        },

        gmailLabels: {
            options: {
                defaultJobOptions: {
                    removeOnComplete: 20,
                    removeOnFail: 50,
                    attempts: 3,
                    backoff: { type: 'exponential', delay: 3000 },
                },
            },
            workers: {
                labelSync: {
                    schema: LabelSyncSchema,
                    processor: async (job: Job<LabelSyncPayload>) => {
                        // Ensure database is initialized
                        const dataSource = appContainer.resolve(DataSource);
                        const labelsSyncProcessor = appContainer.resolve(LabelsSyncProcessor);

                        if (!dataSource.isInitialized) {
                            await dataSource.initialize();
                        }
                        const { userId } = job.data;
                        return labelsSyncProcessor.process(userId);
                    },
                    options: {
                        concurrency: 3,
                        limiter: { max: 10, duration: 60000 },
                    },
                },
            },
        },
    },
    connection: {
        host: process.env.REDIS_HOST ?? 'localhost',
        port: Number.parseInt(process.env.REDIS_PORT ?? '4379', 10),
        password: process.env.REDIS_PASSWORD,
        db: Number.parseInt(process.env.REDIS_DB ?? '0', 10),
    },
});

// Helper function to enqueue message batch jobs
// Note: This avoids circular imports by creating a local producer
async function enqueueMessageBatch(payload: MessageBatchPayload): Promise<void> {
    const { Queue } = await import('bullmq');
    const messageBatchQueue = new Queue('gmailSync', {
        ...queueConfig.queues.gmailSync.options,
        connection: queueConfig.connection,
    });

    // Validate with schema
    const validatedData = MessageBatchSchema.parse(payload);

    // Add to queue with validated data
    await messageBatchQueue.add('messageBatch', validatedData);
}

export default queueConfig;
