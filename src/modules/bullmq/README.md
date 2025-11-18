# BullMQ Code Generation

A type-safe BullMQ code generation system that transforms queue definitions into strongly-typed producers, workers, and queue instances.

## Overview

This system takes a single configuration object and generates complete BullMQ integration code with full TypeScript support, validation, and IntelliSense.

## Quick Start

1. **Define your queues** in `src/queues/queueDefinitions.ts`
2. **Run code generation** with `bun run src/cli/bullmq-codegen.ts`
3. **Import generated code** from `src/queues/generated/`

## Configuration Structure

### Queue Configuration (`src/queues/queueDefinitions.ts`)

```typescript
import { createQueueConfig } from '@app/modules/bullmq/types';
import type { Job } from 'bullmq';
import { z } from 'zod';

// Define your schemas
const EmailSendSchema = z.object({
    to: z.email(),
    template: z.string(),
});

// Create queue configuration
const queueConfig = createQueueConfig({
    queues: {
        emailSend: {
            options: {
                defaultJobOptions: {
                    removeOnComplete: 100,
                    removeOnFail: 50,
                    attempts: 3,
                    backoff: { type: 'exponential', delay: 2000 },
                },
            },
            workers: {
                afterSignUpEmail: {
                    schema: EmailSendSchema, // Optional: enables validation in producers
                    processor: async (job: Job<z.infer<typeof EmailSendSchema>>) =>
                        console.log('Sending email:', job.data),
                    options: {
                        concurrency: 5,
                        limiter: { max: 100, duration: 60000 },
                    },
                },
            },
        },
        dbOperations: {
            options: {
                defaultJobOptions: {
                    removeOnComplete: 10,
                    removeOnFail: 10,
                    delay: 5000,
                },
            },
            workers: {
                dbCleanUp: {
                    // No schema: simple job without validation
                    processor: async () => console.log('Cleaning DB'),
                    options: {
                        concurrency: 1,
                        limiter: { max: 1, duration: 30000 },
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
```

## Generated Code

### Queue Instances (`generated/queues.ts`)

```typescript
import { Queue } from 'bullmq';
import queueConfig from '../queueDefinitions';

export const emailSendQueue = new Queue('emailSend', {
    ...queueConfig.queues.emailSend.options,
    connection: queueConfig.connection,
});

export const dbOperationsQueue = new Queue('dbOperations', {
    ...queueConfig.queues.dbOperations.options,
    connection: queueConfig.connection,
});
```

### Worker Instances (`generated/workers.ts`)

```typescript
import { Worker } from 'bullmq';
import queueConfig from '../queueDefinitions';

export const afterSignUpEmailWorker = new Worker(
    'emailSend',
    queueConfig.queues.emailSend.workers.afterSignUpEmail.processor,
    {
        ...queueConfig.queues.emailSend.workers.afterSignUpEmail.options,
        connection: queueConfig.connection,
    }
);

export const dbCleanUpWorker = new Worker(
    'dbOperations',
    queueConfig.queues.dbOperations.workers.dbCleanUp.processor,
    {
        ...queueConfig.queues.dbOperations.workers.dbCleanUp.options,
        connection: queueConfig.connection,
    }
);
```

### Producer Functions (`generated/producers.ts`)

```typescript
import type { z } from 'zod';
import queueConfig from '../queueDefinitions';
import { dbOperationsQueue, emailSendQueue } from './queues';

// Producer with schema validation
export const enqueueAfterSignUpEmail = async (
    data: z.infer<typeof queueConfig.queues.emailSend.workers.afterSignUpEmail.schema>
) => {
    // Validate with schema
    const validatedData = queueConfig.queues.emailSend.workers.afterSignUpEmail.schema.parse(data);

    // Add to queue with validated data
    return await emailSendQueue.add('afterSignUpEmail', validatedData);
};

// Producer without schema validation
export const enqueueDbCleanUp = async () => {
    return await dbOperationsQueue.add('dbCleanUp', undefined);
};
```

## Key Features

### 🛡️ Type Safety
- Full TypeScript support with compile-time validation
- Zod schema integration for runtime validation
- IntelliSense for all queue operations

### 🔄 Two Producer Patterns

**With Schema (Validated):**
- Accepts typed data parameter
- Validates input with Zod schema
- Type-safe enqueueing

**Without Schema (Simple):**
- No input validation required
- Direct enqueueing for simple jobs

### 🏗️ Single Source of Truth
- All configuration in one place
- Generated code references the config object
- Changes propagate automatically

### ⚡ Development Experience
- Perfect IntelliSense completion
- Compile-time error checking
- No "possibly undefined" errors

## Usage Examples

### Enqueueing Jobs

```typescript
import { enqueueAfterSignUpEmail, enqueueDbCleanUp } from '@app/queues/generated/producers';

// Type-safe job with validation
await enqueueAfterSignUpEmail({
    to: 'user@example.com',
    template: 'welcome'
});

// Simple job without data
await enqueueDbCleanUp();
```

### Starting Workers

```typescript
import { afterSignUpEmailWorker, dbCleanUpWorker } from '@app/queues/generated/workers';

// Workers are ready to use immediately
console.log('Workers started');
```

## Configuration Options

### Queue Options
- **defaultJobOptions**: Default settings for all jobs in the queue
- **removeOnComplete/removeOnFail**: Job cleanup settings
- **attempts**: Retry configuration
- **backoff**: Retry delay strategy

### Worker Options
- **concurrency**: Number of concurrent jobs
- **limiter**: Rate limiting configuration
- **Additional BullMQ WorkerOptions**: All supported options available

### Worker Definition
- **processor**: Job processing function (receives BullMQ Job object)
- **schema**: Optional Zod schema for payload validation
- **options**: Worker-specific configuration

## Code Generation

### CLI Command
```bash
bun run src/cli/bullmq-codegen.ts
```

### Programmatic Usage
```typescript
import { BullMQCodeGen } from '@app/modules/bullmq/BullMQGenerator';

const generator = new BullMQCodeGen({
    logger: appLogger,
    config: '/path/to/queueDefinitions.ts',
    outDir: './src/queues/generated',
    templatesDir: './src/modules/bullmq/templates', // Optional
});

await generator.generate();
```

## Sample Code

Complete examples are available in `src/modules/bullmq/sample/` showing the expected structure and patterns for all generated files.

## Architecture

### File Structure
```
src/modules/bullmq/
├── README.md              # This documentation
├── types.ts               # Type definitions
├── BullMQGenerator.ts     # Code generator class
├── sample/                # Example generated files
│   ├── queues.ts
│   ├── workers.ts
│   └── producers.ts
└── templates/             # ETA templates
    ├── queue.ts.eta
    ├── worker.ts.eta
    └── producer.ts.eta
```

### Type System
- **QueueConfig**: Main configuration container
- **QueueDefinition**: Individual queue specification
- **WorkerDefinition**: Individual worker specification
- **Custom option types**: BullMQ options without connection requirements

## Benefits

1. **Maintainability**: Single configuration source
2. **Type Safety**: Compile-time validation throughout
3. **Developer Experience**: Perfect IntelliSense and autocompletion
4. **Runtime Safety**: Zod validation prevents invalid job data
5. **Scalability**: Easy to add new queues and workers
6. **Consistency**: Standardized patterns across all queue operations

## Best Practices

1. **Schema Design**: Use descriptive Zod schemas for complex job data
2. **Worker Options**: Configure appropriate concurrency and rate limiting
3. **Queue Names**: Use clear, descriptive queue names
4. **Error Handling**: Implement proper error handling in processors
5. **Monitoring**: Use BullMQ's built-in monitoring capabilities

## Migration

When updating queue configurations:

1. Modify `queueDefinitions.ts`
2. Run code generation
3. Update imports if queue/worker names changed
4. Test generated code

The system ensures backward compatibility when adding new queues or workers without breaking existing functionality.