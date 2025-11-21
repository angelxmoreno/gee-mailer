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

### Current Implementation and Future Improvements

**Current Architecture (Phase 1):**
The current implementation allows multiple workers per queue, which creates job competition issues:
- Multiple workers listen to the same queue (e.g., 3 workers on `gmailSync` queue)
- Any worker can pick up any job from that queue, regardless of job name
- This requires job name filtering in processors to ensure correct job routing
- Example: `initialSyncWorker`, `incrementalSyncWorker`, and `messageBatchWorker` all compete for jobs on the `gmailSync` queue

**Known Issues:**
- **Job Competition**: Workers grab jobs they may not process (inefficient)
- **Concurrency Confusion**: Worker-specific concurrency settings become unclear when workers share queues
- **Resource Waste**: Workers process jobs just to check if they should handle them

**Recommended Future Architecture (Phase 2):**
Implement a **1:1 Queue-to-Worker** architecture:
```typescript
// Instead of shared queues:
queues: {
  gmailSync: {
    workers: {
      initialSync: { ... },      // Competes with others
      incrementalSync: { ... },  // Competes with others
      messageBatch: { ... }      // Competes with others
    }
  }
}

// Move to dedicated queues:
queues: {
  gmailInitialSync: {
    workers: {
      initialSync: { ... }       // Dedicated queue, no competition
    }
  },
  gmailIncrementalSync: {
    workers: {
      incrementalSync: { ... }   // Dedicated queue, no competition
    }
  },
  gmailMessageBatch: {
    workers: {
      messageBatch: { ... }      // Dedicated queue, no competition
    }
  }
}
```

**Benefits of 1:1 Architecture:**
- **Efficient Job Processing**: No wasted cycles on job name filtering
- **Clear Concurrency Control**: Each worker's concurrency settings apply directly
- **Better Resource Utilization**: Workers only process jobs they're designed for
- **Simpler Monitoring**: Queue metrics directly correlate to worker performance
- **Cleaner Architecture**: More predictable job routing and scaling

**Migration Strategy:**
1. Update queue definitions to use dedicated queue names
2. Regenerate producers and workers via codegen
3. Update any direct queue references in application code
4. Deploy workers before updating job producers to maintain processing during transition

**Status**: Phase 2 implementation planned for future iteration. Current job name filtering approach is functional but not optimal for production scale.

### File Structure
```text
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

## Worker Deployment

### Development

**Start workers in development:**
```bash
# Single worker process with hot reloading
bun run workers:dev

# Or start workers separately
bun run workers:start
```

**Start API and workers together:**
```bash
# Terminal 1: Start API
bun run dev

# Terminal 2: Start workers
bun run workers:dev
```

### Production Deployment

#### Option 1: PM2 Process Manager (Recommended)

**Install PM2:**
```bash
npm install -g pm2
```

**Production deployment:**
```bash
# Start all processes (API + Workers)
bun run pm2:start:prod

# View status
bun run pm2:status

# View logs
bun run pm2:logs

# Stop all processes
bun run pm2:stop
```

**Development with PM2:**
```bash
bun run pm2:start:dev
```

#### Option 2: Docker Deployment

Add to your `docker-compose.yml`:
```yaml
services:
  api:
    build: .
    command: bun src/index.ts
    environment:
      - WORKER_ENABLED=false
    ports:
      - "3000:3000"

  workers:
    build: .
    command: bun src/workers.ts
    environment:
      - WORKER_ENABLED=true
    depends_on:
      - redis
```

#### Option 3: Separate Node Processes

```bash
# Start API (without workers)
WORKER_ENABLED=false bun src/index.ts

# Start workers (separate process)
WORKER_ENABLED=true bun src/workers.ts
```

### Configuration

**Worker Configuration (AppConfig):**
```typescript
workers: {
  enabled: true,                    // Enable/disable workers
  gracefulShutdownTimeout: 30000,   // Shutdown timeout (ms)
  healthCheckInterval: 30000,       // Health check interval (ms)
  autoRestart: true                 // Auto-restart on failure
}
```

**Environment Variables:**
```bash
# PM2 scaling
API_INSTANCES=max          # Number of API instances
WORKER_INSTANCES=2         # Number of worker instances

# Worker control
WORKER_ENABLED=true        # Enable workers in this process
```

### Production Considerations

#### Graceful Shutdown
- Workers automatically handle `SIGTERM` and `SIGINT` signals
- Configurable shutdown timeout prevents hanging processes
- In-flight jobs complete before shutdown

#### Error Handling
- Automatic worker error logging
- Stalled job detection and logging
- Unhandled exception/rejection handling
- Process restart on fatal errors

#### Health Monitoring
- Periodic health checks with worker status
- Job processing metrics (processed/failed counts)
- Worker state monitoring (running/closed)

#### Scaling Strategies

**Horizontal Scaling:**
```bash
# Scale API processes
API_INSTANCES=4 pm2 start ecosystem.config.js --env production

# Scale worker processes
WORKER_INSTANCES=6 pm2 start ecosystem.config.js --env production
```

**Queue-Specific Scaling:**
- Configure concurrency per worker in queue definitions
- Use worker options for rate limiting
- Scale based on queue depth and processing time

#### Redis Configuration

**Production Redis Settings:**
```bash
# Enable persistence
redis-server --appendonly yes --appendfsync everysec

# Disable key eviction for BullMQ
redis-cli CONFIG SET maxmemory-policy noeviction
```

### Monitoring & Debugging

**PM2 Commands:**
```bash
# Real-time monitoring
pm2 monit

# Process status
pm2 list

# Restart specific process
pm2 restart gee-mailer-workers

# View worker logs
pm2 logs gee-mailer-workers

# Worker metrics
pm2 show gee-mailer-workers
```

**Health Check Endpoint (Optional):**
```typescript
// Add to your API
app.get('/health/workers', async (req, res) => {
  // Check worker health via Redis
  const workerStatus = await getWorkerHealth();
  res.json(workerStatus);
});
```

### Security

**Production Checklist:**
- [ ] Run workers as non-root user
- [ ] Configure Redis authentication
- [ ] Use environment variables for secrets
- [ ] Enable TLS for Redis connections
- [ ] Set appropriate file permissions
- [ ] Configure firewall rules

## Best Practices

1. **Schema Design**: Use descriptive Zod schemas for complex job data
2. **Worker Options**: Configure appropriate concurrency and rate limiting
3. **Queue Names**: Use clear, descriptive queue names
4. **Error Handling**: Implement proper error handling in processors
5. **Monitoring**: Use BullMQ's built-in monitoring capabilities
6. **Process Separation**: Run API and workers in separate processes for production
7. **Graceful Shutdown**: Always handle shutdown signals properly
8. **Resource Monitoring**: Monitor memory and CPU usage of worker processes

## Migration

When updating queue configurations:

1. Modify `queueDefinitions.ts`
2. Run code generation
3. Update imports if queue/worker names changed
4. Test generated code
5. Deploy workers before API to ensure job processing continues

The system ensures backward compatibility when adding new queues or workers without breaking existing functionality.