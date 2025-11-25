import 'reflect-metadata';
import { appConfig, appContainer } from '@app/config';
import { allWorkers } from '@app/queues/generated/workers';
import type { AppConfig } from '@app/types/AppConfig';
import { AppLogger } from '@app/utils/tokens';
import type { Worker } from 'bullmq';
import type { Logger } from 'pino';

class WorkerManager {
    protected logger: Logger;
    protected config: AppConfig;
    protected workers: Worker[] = [];
    protected isShuttingDown = false;
    protected healthCheckInterval?: NodeJS.Timeout;

    constructor() {
        this.config = appConfig;
        this.logger = appContainer.resolve(AppLogger).child({ module: 'WorkerManager' });
    }

    async start(): Promise<void> {
        // Check if workers are enabled
        if (!this.config.workers.enabled) {
            this.logger.info('Workers are disabled via configuration');
            return;
        }

        this.logger.info('Starting BullMQ workers...');

        // Log connection configuration for debugging
        this.logger.info(
            {
                redisHost: process.env.REDIS_HOST ?? 'localhost',
                redisPort: Number.parseInt(process.env.REDIS_PORT ?? '4379', 10),
                redisDb: Number.parseInt(process.env.REDIS_DB ?? '0', 10),
                hasPassword: !!process.env.REDIS_PASSWORD,
            },
            'Redis connection configuration'
        );

        try {
            // Initialize all generated workers (auto-discovered)
            this.workers = allWorkers;

            // Log worker startup
            for (const worker of this.workers) {
                this.logger.info({ workerName: worker.name }, 'Worker started');

                // Add detailed worker error handling
                worker.on('error', (error: Error) => {
                    // Create a type-safe error object for logging
                    const nodeError = error as Error & {
                        code?: string;
                        errno?: number;
                        syscall?: string;
                        address?: string;
                        port?: number;
                    };

                    this.logger.error(
                        {
                            error: {
                                name: error.name,
                                message: error.message,
                                stack: error.stack,
                                cause: error.cause,
                                code: nodeError.code,
                                errno: nodeError.errno,
                                syscall: nodeError.syscall,
                                address: nodeError.address,
                                port: nodeError.port,
                            },
                            workerName: worker.name,
                            workerId: worker.id,
                            isRunning: worker.isRunning(),
                            isPaused: worker.isPaused(),
                        },
                        'Worker connection error - check Redis/database connectivity'
                    );
                });

                worker.on('stalled', (jobId: string) => {
                    this.logger.warn(
                        {
                            jobId,
                            workerName: worker.name,
                            workerId: worker.id,
                        },
                        'Job stalled - may indicate worker performance issues'
                    );
                });

                worker.on('failed', (job, error) => {
                    // Log only safe identifiers and summaries to avoid PII leakage
                    const safeJobData = job?.data
                        ? {
                              userId: job.data.userId || 'unknown',
                              syncType: job.data.syncType || 'unknown',
                              batchSize: job.data.batchSize || 0,
                              hasPayload: !!job.data,
                          }
                        : undefined;

                    this.logger.error(
                        {
                            jobId: job?.id,
                            jobName: job?.name,
                            jobData: safeJobData,
                            error: {
                                name: error.name,
                                message: error.message,
                                stack: error.stack,
                            },
                            workerName: worker.name,
                            attempts: job?.attemptsMade,
                            maxAttempts: job?.opts.attempts,
                        },
                        'Job failed - check job processor implementation'
                    );
                });

                worker.on('completed', (job, result) => {
                    // Log only safe summary data to avoid PII and bloat
                    const safeResult = result
                        ? {
                              userId: result.userId || 'unknown',
                              action: result.action || 'unknown',
                              messageCount: result.totalMessages || result.newMessages || result.messagesProcessed || 0,
                              hasResult: !!result,
                          }
                        : undefined;

                    this.logger.debug(
                        {
                            jobId: job.id,
                            jobName: job.name,
                            result: safeResult,
                            workerName: worker.name,
                            duration: job.processedOn ? Date.now() - job.processedOn : 0,
                        },
                        'Job completed successfully'
                    );
                });
            }

            // Setup graceful shutdown handlers
            this.setupGracefulShutdown();

            // Setup health checks if enabled
            if (this.config.workers.healthCheckInterval > 0) {
                this.setupHealthChecks();
            }

            this.logger.info(
                {
                    workerCount: this.workers.length,
                    workers: this.workers.map((w) => w.name),
                    config: this.config.workers,
                },
                'All workers started successfully'
            );
        } catch (error) {
            this.logger.error({ error }, 'Failed to start workers');
            throw error;
        }
    }

    protected setupHealthChecks(): void {
        this.healthCheckInterval = setInterval(() => {
            const workerStatuses = this.workers.map((worker) => ({
                name: worker.name,
                isRunning: worker.isRunning(),
                isPaused: worker.isPaused(),
                id: worker.id,
            }));

            this.logger.debug({ workers: workerStatuses }, 'Worker health check');
        }, this.config.workers.healthCheckInterval);

        this.logger.info({ interval: this.config.workers.healthCheckInterval }, 'Health checks enabled');
    }

    protected setupGracefulShutdown(): void {
        const shutdown = async (signal: string) => {
            if (this.isShuttingDown) {
                this.logger.warn('Shutdown already in progress, forcing exit...');
                process.exit(1);
            }

            this.isShuttingDown = true;
            this.logger.info({ signal }, 'Received shutdown signal, gracefully closing workers...');

            // Clear health check interval
            if (this.healthCheckInterval) {
                clearInterval(this.healthCheckInterval);
            }

            try {
                // Set timeout for graceful shutdown
                const shutdownTimeout = setTimeout(() => {
                    this.logger.error('Graceful shutdown timeout exceeded, forcing exit');
                    process.exit(1);
                }, this.config.workers.gracefulShutdownTimeout);

                // Close all workers gracefully
                await Promise.all(
                    this.workers.map(async (worker) => {
                        this.logger.debug({ workerName: worker.name }, 'Closing worker');
                        await worker.close();
                        this.logger.info({ workerName: worker.name }, 'Worker closed');
                    })
                );

                clearTimeout(shutdownTimeout);
                this.logger.info('All workers closed successfully');
                process.exit(0);
            } catch (error) {
                this.logger.error({ error }, 'Error during shutdown');
                process.exit(1);
            }
        };

        // Handle shutdown signals
        process.on('SIGTERM', () => shutdown('SIGTERM'));
        process.on('SIGINT', () => shutdown('SIGINT'));

        // Handle uncaught exceptions
        process.on('uncaughtException', (error) => {
            this.logger.fatal({ error }, 'Uncaught exception');
            process.exit(1);
        });

        process.on('unhandledRejection', (reason, promise) => {
            this.logger.fatal({ reason, promise }, 'Unhandled promise rejection');
            process.exit(1);
        });
    }
}

// Start worker manager if this file is run directly
if (import.meta.main) {
    const workerManager = new WorkerManager();
    workerManager.start().catch((error) => {
        console.error('Failed to start workers:', error);
        process.exit(1);
    });
}

export { WorkerManager };
