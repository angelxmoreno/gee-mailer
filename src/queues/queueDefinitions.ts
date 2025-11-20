import { createQueueConfig } from '@app/modules/bullmq/types';
import type { Job } from 'bullmq';
import { z } from 'zod';

// Import project-specific types

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
    },
    connection: {
        host: process.env.REDIS_HOST ?? 'localhost',
        port: Number.parseInt(process.env.REDIS_PORT ?? '4379', 10),
        password: process.env.REDIS_PASSWORD,
        db: Number.parseInt(process.env.REDIS_DB ?? '0', 10),
    },
});

export default queueConfig;
