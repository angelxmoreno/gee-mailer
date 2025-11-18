# BullMQ Code Generation System

## Overview

This project includes a type-safe BullMQ code generation system that transforms queue definitions into strongly-typed TypeScript code for producers, workers, and queue instances. This approach ensures compile-time safety and eliminates runtime errors from incorrect job data structures.

## Core Concepts

### Queue Definitions
Queue definitions are the source of truth for your BullMQ setup. They define:
- Queue names and options
- Worker names and processors
- Job data schemas using Zod
- Type relationships between queues and workers

### Code Generation Flow
1. **Define**: Create queue definitions with workers and schemas
2. **Generate**: Run codegen to produce TypeScript files
3. **Use**: Import generated producers and workers with full type safety

## Architecture

### Type System (`src/modules/bullmq/types.ts`)

**WorkerDefinition**: Defines individual workers with conditional typing based on schema presence
```typescript
// With schema (typed data)
type EmailWorker = WorkerDefinition<typeof EmailSchema> = {
  name: string;
  schema: ZodType;
  processor: (data: z.infer<Schema>) => Promise<void>;
  options?: WorkerOptions;
}

// Without schema (no data)
type CleanupWorker = WorkerDefinition = {
  name: string;
  schema?: undefined;
  processor: () => Promise<void>;
  options?: WorkerOptions;
}
```

**QueueDefinition**: Groups workers under a named queue
```typescript
type QueueDefinition = {
  name: string;
  options?: QueueOptions;
  workers: ReadonlyArray<WorkerDefinition<any>>;
}
```

**Helper Functions**:
- `createQueueDefinition()`: Factory function for creating typed queue definitions
- `QueueJobNames<Q>`: Extract worker names as union type from queue definition

### Code Generator (`src/modules/bullmq/BullMQGenerator.ts`)

The `BullMQCodeGen` class handles the transformation from definitions to generated code using ETA templates.

**Configuration**:
- `queueDefinitions`: Path to definitions file or definitions array
- `outDir`: Output directory for generated files
- `templatesDir`: Custom template directory (optional)
- `logger`: Pino logger instance

### Templates (`src/modules/bullmq/templates/`)

ETA templates define the structure of generated code:

- **producer.ts.eta**: Generates type-safe job enqueueing functions
- **worker.ts.eta**: Generates BullMQ worker instances with data validation
- **queue.ts.eta**: Generates queue instances and exports

## Example Usage

### 1. Define Queue Structure

```typescript
// src/queues/queueDefinitions.ts
import { createQueueDefinition } from '@app/modules/bullmq/types';
import { z } from 'zod';

// Schema definitions
const EmailSendSchema = z.object({
  to: z.email(),
  template: z.string(),
});

// Worker definitions
const afterSignUpEmailWorker = {
  name: 'after-signup-email',
  schema: EmailSendSchema,
  processor: async (data: z.infer<typeof EmailSendSchema>) => {
    // Send email logic
  },
};

const dbCleanUpWorker = {
  name: 'db-clean-up',
  processor: async () => {
    // Database cleanup logic
  },
};

// Queue definitions
const emailQueue = createQueueDefinition({
  name: 'email-send',
  workers: [afterSignUpEmailWorker],
});

const dbQueue = createQueueDefinition({
  name: 'db-operations',
  workers: [dbCleanUpWorker],
});

export default [emailQueue, dbQueue];
```

### 2. Run Code Generation

```typescript
import { BullMQCodeGen } from '@app/modules/bullmq/BullMQGenerator';

const codegen = new BullMQCodeGen({
  logger: appLogger,
  queueDefinitions: './src/queues/queueDefinitions.ts',
  outDir: './src/queues/generated',
});

await codegen.generate();
```

### 3. Use Generated Code

```typescript
// Type-safe producers
import { enqueueAfterSignupEmail } from '@app/queues/generated/producers';

// This is type-checked at compile time
await enqueueAfterSignupEmail({
  to: 'user@example.com',  // Must be valid email
  template: 'welcome',     // Must be string
});

// Workers are automatically connected and typed
import { afterSignupEmailWorker } from '@app/queues/generated/workers';
// Worker automatically validates job.data against EmailSendSchema
```

## Benefits

1. **Type Safety**: Compile-time validation of job data structures
2. **DRY Principle**: Single source of truth for queue definitions
3. **Developer Experience**: IntelliSense and auto-completion for job data
4. **Runtime Safety**: Automatic Zod validation in generated workers
5. **Consistency**: Standardized patterns across all queue operations

## Generated File Structure

```
src/queues/generated/
├── producers.ts    # Type-safe job enqueueing functions
├── workers.ts      # BullMQ worker instances with validation
├── queues.ts       # Queue instances and configurations
└── types.ts        # Generated TypeScript types
```

## Current Implementation Status

- ✅ Type system with conditional worker definitions
- ✅ Queue definition factory functions
- ✅ ETA template structure
- ✅ Example queue definitions
- 🔄 Code generator implementation (in progress)
- ⏳ CLI integration
- ⏳ Template customization system

## Future Enhancements

- **Job Prioritization**: Generate priority-aware enqueueing functions
- **Retry Policies**: Template-driven retry configuration per job type
- **Metrics Integration**: Generated code with built-in metrics collection
- **Development Tools**: Hot-reloading during queue definition changes
- **Testing Utilities**: Generated mock producers and workers for testing