import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { QueueConfig } from '@app/modules/bullmq/types.ts';
import { Eta } from 'eta';
import type { Logger } from 'pino';

export type BullMQCodeGenOptions = {
    logger: Logger;
    config: QueueConfig | string; // QueueConfig object or path to config file
    outDir: string;
    templatesDir?: string; // Optional, defaults to built-in templates
};

export class BullMQCodeGen {
    protected logger: Logger;
    protected config: QueueConfig;
    protected configPath: string | null;
    protected outDir: string;
    protected templatesDir: string;
    protected eta: Eta;

    constructor({ logger, config, outDir, templatesDir }: BullMQCodeGenOptions) {
        this.logger = logger.child({ module: 'BullMQCodeGen' });
        this.outDir = outDir;
        this.templatesDir = templatesDir ?? this.getDefaultTemplatesDir();

        // Initialize Eta with templates directory
        this.eta = new Eta({ views: this.templatesDir });

        if (typeof config === 'string') {
            this.configPath = config;
            // Will load config from file when generate() is called
            this.config = { queues: {}, connection: {} };
        } else {
            this.config = config;
            this.configPath = null;
        }
    }

    protected getDefaultTemplatesDir(): string {
        // Default to built-in templates directory
        return new URL('../templates', import.meta.url).pathname;
    }

    async generate(): Promise<void> {
        this.logger.info('Starting BullMQ code generation');

        try {
            // Load config if needed
            if (this.configPath) {
                await this.loadConfigFromFile();
            }

            // Ensure output directory exists
            await mkdir(this.outDir, { recursive: true });

            // Generate all files
            await Promise.all([this.generateQueues(), this.generateWorkers(), this.generateProducers()]);

            this.logger.info('BullMQ code generation completed successfully');
        } catch (error) {
            this.logger.error({ error }, 'Failed to generate BullMQ code');
            throw error;
        }
    }

    protected async loadConfigFromFile(): Promise<void> {
        if (!this.configPath) return;

        this.logger.debug({ configPath: this.configPath }, 'Loading config from file');

        try {
            // Dynamic import the config file
            const configModule = await import(this.configPath);
            this.config = configModule.default || configModule;
        } catch (error) {
            this.logger.error({ error, configPath: this.configPath }, 'Failed to load config file');
            throw new Error(`Failed to load config from ${this.configPath}: ${error}`);
        }
    }

    protected async generateQueues(): Promise<void> {
        const content = await this.eta.renderAsync('queue.ts.eta', {
            config: this.config,
            queues: this.config.queues,
        });

        await this.writeFile('queues.ts', content);
        this.logger.debug('Generated queues.ts');
    }

    protected async generateWorkers(): Promise<void> {
        const content = await this.eta.renderAsync('worker.ts.eta', {
            config: this.config,
            queues: this.config.queues,
        });

        await this.writeFile('workers.ts', content);
        this.logger.debug('Generated workers.ts');
    }

    protected async generateProducers(): Promise<void> {
        const content = await this.eta.renderAsync('producer.ts.eta', {
            config: this.config,
            queues: this.config.queues,
        });

        await this.writeFile('producers.ts', content);
        this.logger.debug('Generated producers.ts');
    }

    protected async writeFile(fileName: string, content: string): Promise<void> {
        const filePath = path.join(this.outDir, fileName);

        try {
            await writeFile(filePath, content, 'utf-8');
        } catch (error) {
            this.logger.error({ error, filePath }, 'Failed to write file');
            throw new Error(`Failed to write ${fileName}: ${error}`);
        }
    }
}
