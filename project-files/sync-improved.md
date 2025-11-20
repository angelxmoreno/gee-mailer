# Improved Gmail Sync Pipeline with BullMQ Integration

## Current State Analysis

### What We Have
- **Synchronous sync process** via `MailSyncService.sync()`
- **Basic message fetching** with pagination support
- **Progress tracking** with `SyncProgressEntity`
- **Simple caching** via Keyv for API responses
- **Rate limiting** with basic 100ms delays

### Current Limitations
- **Blocks CLI execution** during sync (no background processing)
- **No label importing** (missing important Gmail metadata)
- **No incremental sync** (always processes from scratch)
- **No failure recovery** (entire sync fails if one API call fails)
- **No concurrency** (sequential API calls only)
- **No job prioritization** (can't prioritize urgent syncs)

## Google's Sync Recommendations

Based on [Gmail API Sync Guide](https://developers.google.com/workspace/gmail/api/guides/sync):

### **Full Synchronization** (Initial)
- Use `messages.list` to get message IDs
- Batch requests with `messages.get`
- Cache with `format=FULL` or `format=RAW`
- Store initial `historyId` for future incremental syncs

### **Partial Synchronization** (Ongoing)
- Use `history.list` with stored `historyId`
- History records available for ~1 week
- Fall back to full sync if `historyId` expires
- Consider push notifications for real-time updates

### **Performance Best Practices**
- Use `format=minimal` for cached message retrievals
- Implement proper batch requests
- Store and reuse `historyId` efficiently
- Minimize unnecessary polling

## Proposed BullMQ Integration Architecture

### **Queue Structure**

```typescript
// New queues to add to queueDefinitions.ts
const syncQueues = {
  gmailSync: {
    // High-priority sync operations
    workers: {
      initialSync: { /* Full sync for new users */ },
      incrementalSync: { /* History-based updates */ },
      messageBatch: { /* Process batches of messages */ },
    }
  },
  gmailLabels: {
    // Label management operations
    workers: {
      labelSync: { /* Sync all user labels */ },
      labelUpdate: { /* Update specific labels */ },
    }
  },
  gmailMaintenance: {
    // Background maintenance tasks
    workers: {
      historyCleanup: { /* Clean expired history */ },
      syncHealthCheck: { /* Validate sync integrity */ },
      cacheOptimization: { /* Optimize cache storage */ },
    }
  }
}
```

### **Job Flow Design**

#### **Initial Sync Flow**
```
User Triggers Initial Sync
    |
    v
Schedule initialSync Job
    |
    v
Fetch Gmail Profile
    |
    v
Create Sync Progress Record
    |
    v
Schedule labelSync Job (Priority: High)
    |
    v
Queue messageBatch Jobs (Priority: Medium)
    |
    v
Process Message Batches in Parallel
    |
    v
Update Progress After Each Batch
    |
    v
Store Final historyId
    |
    v
Mark Sync Complete
```

#### **Incremental Sync Flow**
```
Scheduled/Triggered Incremental
    |
    v
Fetch Current historyId
    |
    v
History Available? --> No --> Fallback to Full Sync
    |
    v Yes
Query history.list API
    |
    v
Process History Changes
    |
    v
Update Affected Messages
    |
    v
Store New historyId
    |
    v
Schedule Next Incremental
```

### **Label Import System**

#### **Database Entity Updates**

```typescript
// LabelEntity.ts - extends AppEntity, belongs to one user
@Entity()
// Unique constraint for labelId + userId combination
@Index(['labelId', 'userId'], { unique: true })
export class LabelEntity extends AppEntity {
  @Column({ unique: true })
  labelId: string; // Gmail label ID

  @Column()
  userId: number; // FK to user - one label belongs to one user

  @Column()
  name: string;

  @Column({ type: 'enum', enum: ['system', 'user'] })
  type: 'system' | 'user';

  @Column({ nullable: true })
  color: string;

  @Column({ default: true })
  labelListVisibility: boolean;

  @Column({ default: true })
  messageListVisibility: boolean;

  @Column({ default: 0 })
  messagesTotal: number;

  @Column({ default: 0 })
  messagesUnread: number;

  @Column({ default: 0 })
  threadsTotal: number;

  @Column({ default: 0 })
  threadsUnread: number;

  // Relationship to user
  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: Relation<UserEntity>;
}

// UserEntity.ts - add historyId and sync state tracking
@Entity('users')
export class UserEntity extends AppEntity {
  // ... existing properties

  @Column({ nullable: true })
  historyId: string; // Store Gmail historyId for incremental sync

  @Column({ default: false })
  initialSyncCompleted: boolean; // Track initial sync completion state

  @Column({ default: false })
  labelSyncCompleted: boolean; // Track label sync completion

  @Column({ nullable: true })
  lastFullSyncAt: Date; // Track when last full sync occurred

  @Column({ nullable: true })
  lastIncrementalSyncAt: Date; // Track when last incremental sync occurred

  // Note: No OneToMany relationship to labels - we query labels by userId instead
}
```

#### **GmailService Methods Status**

The following methods are **ALREADY IMPLEMENTED** in `src/services/GmailService.ts`:

✅ **Existing Methods:**
- `fetchLabels()` - Fetch all labels with TaggedKeyv caching (5-minute cache)
- `fetchHistory(startHistoryId)` - Fetch history changes with caching (5-minute cache)
- `getCurrentHistoryId()` - Get current historyId from profile (no cache)
- `clearLabelsCache(userId)` - Clear labels cache using TaggedKeyv tags

✅ **Enhanced Caching Features Already Present:**
- Uses `TaggedKeyv` for advanced cache invalidation by user/type
- All methods include proper cache tagging (e.g., `user:${userId}:labels`)
- Cache invalidation by tags instead of individual keys
- Structured logging with user and operation context

✅ **Recently Added:**
- `batchFetchMessages(messageIds)` - Batch fetch multiple messages with rate limiting

**Implementation Details:**
- Reuses existing `fetchMessage()` method for caching and error handling
- Processes messages in batches of 10 to avoid overwhelming the Gmail API
- Includes 100ms delay between batches for rate limiting
- Leverages existing TaggedKeyv caching automatically

### **Processor Implementation Notes**

Following the BullMQ convention, all processors are defined inline within the `queueDefinitions.ts` file. The processors should:

1. **Use dependency injection**: Resolve services via `container.resolve(ServiceName)`
2. **Return structured results**: Include userId and operation details for tracking
3. **Handle errors gracefully**: Let BullMQ retry logic handle failures
4. **Update progress**: Use `job.updateProgress()` for long-running operations
5. **Log appropriately**: Use resolved logger services for consistent logging

#### **Key Implementation Points**

**Initial Sync Flow:**
- Create sync progress record
- Schedule label sync job first (dependency)
- Fetch message IDs in batches and store in database with `internalDate: null`
- Schedule single message batch job to start processing
- Store historyId for future incremental syncs

**Incremental Sync Flow:**
- Check initial sync completion
- Validate historyId availability
- Fetch and process history changes
- Store new message IDs with `internalDate: null` for processing
- Handle deletions and label changes immediately
- Update historyId for next sync

**Message Batch Processing (Strategy-Based):**

**For `syncType: 'initial'`:**
- Query: `{ userId, internalDate: null }` ordered by `createdAt: ASC`
- Goal: Stable progress through entire mailbox from oldest to newest
- Behavior: Systematic processing for complete mailbox sync

**For `syncType: 'incremental'`:**
- Query: `{ userId, internalDate: null, createdAt >= lastIncrementalSyncAt }` ordered by `createdAt: DESC`
- Goal: Fast processing of recent changes for immediate user feedback
- Behavior: Prioritizes newest messages, optionally filters to recent additions

**Common Processing:**
- Process up to `batchSize` messages through Gmail API
- Update entities with fetched data and set `internalDate`
- Self-schedule next batch with same strategy if more messages exist
- No complex batch coordination needed

**Label Sync:**
- Fetch all Gmail labels
- Upsert label entities with proper user association
- Remove labels that no longer exist
- Update sync completion status

### **Type Definitions**

First, add Gmail sync-specific types to `src/queues/types.ts`:

```typescript
import { z } from 'zod';

// Reusable base schemas
export const UserIdentifier = z.object({
    userId: z.number()
});

// Gmail sync job schemas
export const InitialSyncSchema = UserIdentifier;

export const IncrementalSyncSchema = UserIdentifier;

export const MessageBatchSchema = UserIdentifier.extend({
    batchSize: z.number().default(50),
    syncProgressId: z.number().optional(),
    syncType: z.enum(['initial', 'incremental']),
    lastIncrementalSyncAt: z.date().optional() // For incremental sync filtering
});

export const LabelSyncSchema = UserIdentifier;

// Type inference for better TypeScript support
export type UserIdentifierPayload = z.infer<typeof UserIdentifier>;
export type InitialSyncPayload = z.infer<typeof InitialSyncSchema>;
export type IncrementalSyncPayload = z.infer<typeof IncrementalSyncSchema>;
export type MessageBatchPayload = z.infer<typeof MessageBatchSchema>;
export type LabelSyncPayload = z.infer<typeof LabelSyncSchema>;
```

### **Queue Configuration Updates**

Then update `src/queues/queueDefinitions.ts`:

```typescript
import { createQueueConfig } from '@app/modules/bullmq/types';
import type { Job } from 'bullmq';
import { container } from 'tsyringe';

// Import project-specific types
import {
  InitialSyncSchema,
  IncrementalSyncSchema,
  MessageBatchSchema,
  LabelSyncSchema,
  type InitialSyncPayload,
  type IncrementalSyncPayload,
  type MessageBatchPayload,
  type LabelSyncPayload
} from './types';

// Import services needed by processors
import { GmailService } from '@app/services/GmailService';
import { SyncProgressRepository } from '@app/database/repositories';
// ... other service imports

const queueConfig = createQueueConfig({
  queues: {
    // ... existing queues (emailSend, dbOperations)

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
            const { userId } = job.data;
            const gmailService = container.resolve(GmailService);
            const syncProgressRepo = container.resolve(SyncProgressRepository);
            // Implementation here...
            console.log('Processing initial sync for user:', userId);
            return { userId, action: 'completed' };
          },
          options: {
            concurrency: 1,
            limiter: { max: 3, duration: 60000 },
          },
        },
        incrementalSync: {
          schema: IncrementalSyncSchema,
          processor: async (job: Job<IncrementalSyncPayload>) => {
            const { userId } = job.data;
            const gmailService = container.resolve(GmailService);
            // Implementation here...
            console.log('Processing incremental sync for user:', userId);
            return { userId, action: 'completed' };
          },
          options: {
            concurrency: 5,
            limiter: { max: 15, duration: 60000 },
          },
        },
        messageBatch: {
          schema: MessageBatchSchema,
          processor: async (job: Job<MessageBatchPayload>) => {
            const { userId, batchSize, syncType, syncProgressId, lastIncrementalSyncAt } = job.data;
            const gmailService = container.resolve(GmailService);

            // Different query strategies based on sync type
            let whereClause: any = { userId, internalDate: null };
            let orderClause: any = undefined;

            if (syncType === 'initial') {
              // Initial sync: process all unprocessed messages, oldest first for stable progress
              orderClause = { createdAt: 'ASC' };
            } else if (syncType === 'incremental') {
              // Incremental sync: prioritize recent messages, newest first for faster user feedback
              orderClause = { createdAt: 'DESC' };

              // Optionally filter to messages added since last incremental sync
              if (lastIncrementalSyncAt) {
                whereClause.createdAt = { $gte: lastIncrementalSyncAt };
              }
            }

            const unprocessedMessages = await messageRepository.find({
              where: whereClause,
              take: batchSize,
              order: orderClause,
              select: ['id', 'messageId', 'createdAt']
            });

            // Process each message
            for (const entity of unprocessedMessages) {
              const { data: gmailMessage } = await gmailService.fetchMessage(entity.messageId);
              // Update entity with Gmail data including internalDate
              await updateMessageEntity(entity.id, gmailMessage);
            }

            // Check for remaining messages with same filter criteria
            const remainingCount = await messageRepository.count({ where: whereClause });

            if (remainingCount > 0) {
              // Schedule next batch with same parameters
              await enqueueMessageBatch({
                userId,
                batchSize,
                syncType,
                syncProgressId,
                lastIncrementalSyncAt
              });
            }

            console.log(`[${syncType}] Processed ${unprocessedMessages.length} messages for user ${userId}`);
            return {
              userId,
              syncType,
              messagesProcessed: unprocessedMessages.length,
              remainingMessages: remainingCount
            };
          },
          options: {
            concurrency: 8,
            limiter: { max: 60, duration: 60000 },
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
            const { userId } = job.data;
            const gmailService = container.resolve(GmailService);
            // Implementation here...
            console.log('Processing label sync for user:', userId);
            return { userId, labelsProcessed: 0, labelsRemoved: 0 };
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
```

### **Benefits of This Architecture**

#### **Performance**
- **Non-blocking sync**: CLI returns immediately, sync runs in background
- **Parallel processing**: Multiple message batches processed concurrently
- **Efficient incremental updates**: Only sync changes since last run
- **Smart prioritization**: Labels sync first, then messages

#### **Reliability**
- **Automatic retries**: Exponential backoff for failed jobs
- **Graceful degradation**: Fallback to full sync when history expires
- **Progress tracking**: Real-time job progress via BullBoard
- **Detailed logging**: Structured logs for debugging and monitoring

#### **Scalability**
- **Rate limiting**: Respects Gmail API quotas automatically
- **Queue management**: Handle high sync volumes efficiently
- **Configurable concurrency**: Tune performance per job type
- **Horizontal scaling**: Add more worker processes as needed

#### **User Experience**
- **Complete Gmail data**: Including labels and their metadata
- **Fast initial experience**: Priority processing for important data
- **Always up-to-date**: Automated incremental syncs
- **Monitoring**: Visual job progress via BullBoard dashboard

### **Supporting Services**

#### **Enhanced SyncProgressEntity**
```typescript
// Update src/database/entities/SyncProgressEntity.ts
@Entity()
export class SyncProgressEntity extends AppEntity {
    @Column({ type: 'int' })
    @Index({ unique: true })
    userId: number;

    @Column({ type: 'varchar', length: 64, nullable: true, default: null })
    nextPageToken: string | null;

    @Column({ type: 'int', default: 0 })
    numProcessed: number;

    @Column({ type: 'int', default: 0 })
    numTotal: number;

    // New fields for enhanced tracking
    @Column({ type: 'enum', enum: ['initial', 'incremental', 'labels'], default: 'initial' })
    syncType: 'initial' | 'incremental' | 'labels';

    @Column({ type: 'enum', enum: ['pending', 'in_progress', 'completed', 'failed'], default: 'pending' })
    status: 'pending' | 'in_progress' | 'completed' | 'failed';

    @Column({ type: 'int', default: 0 })
    batchesTotal: number;

    @Column({ type: 'int', default: 0 })
    batchesCompleted: number;

    @Column({ type: 'text', nullable: true })
    errorMessage: string | null;

    @Column({ type: 'timestamp', nullable: true })
    startedAt: Date | null;

    @Column({ type: 'timestamp', nullable: true })
    completedAt: Date | null;

    shouldStillFetch(): boolean {
        return this.nextPageToken !== 'finished';
    }

    getProgressPercentage(): number {
        if (this.batchesTotal === 0) return 0;
        return Math.round((this.batchesCompleted / this.batchesTotal) * 100);
    }
}
```


#### **SyncStateService**
```typescript
// services/SyncStateService.ts
export class SyncStateService {
  // Update user sync state atomically
  async updateUserSyncState(userId: number, updates: Partial<{
    historyId: string;
    initialSyncCompleted: boolean;
    labelSyncCompleted: boolean;
    lastFullSyncAt: Date;
    lastIncrementalSyncAt: Date;
  }>): Promise<void> {
    await this.userRepository.update(userId, updates);
  }

  // Check if user can perform incremental sync
  async canPerformIncrementalSync(userId: number): Promise<boolean> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    return !!(user?.initialSyncCompleted && user?.labelSyncCompleted && user?.historyId);
  }

  // Get users eligible for scheduled incremental sync
  async getEligibleUsersForIncrementalSync(): Promise<UserEntity[]> {
    return this.userRepository.find({
      where: {
        initialSyncCompleted: true,
        labelSyncCompleted: true,
        historyId: Not(IsNull())
      }
    });
  }
}
```

**Message Batch Processing (Self-Managing):**
- Dynamically query unprocessed messages (`internalDate: null`) by userId
- Process messages through Gmail API using existing `fetchMessage()`
- Update entities with full message data and set `internalDate`
- Automatically schedule next batch if more messages remain
- Resilient to failures - retries pick up where they left off

### **Implementation Strategy**

#### **Phase 1: Database & Repository Foundation**
1. **LabelEntity**: Create new `LabelEntity` extending `AppEntity` with proper constraints
2. **UserEntity Updates**: Add sync state tracking fields (`historyId`, sync completion flags, timestamps)
3. **EmailMessageEntity Updates**: Add `internalDate` field (nullable) for tracking processed messages
4. **SyncProgressEntity Updates**: Enhance with new fields (`syncType`, `status`, `batchesTotal`, etc.)
5. **Repository Setup**: Create `LabelRepository` and ensure `EmailMessageRepository` supports new queries
6. **Database Indexes**: Add indexes for efficient querying (`userId + internalDate`, `userId + messageId`, etc.)
7. **Migration Scripts**: Create database migrations for all entity changes

#### **Phase 2: Service Layer**
1. **Service Extensions**: `batchFetchMessages()` already added to `GmailService` ✅
2. **SyncStateService**: Build service for user sync state management ✅
   - Methods: `updateUserSyncState()`, `canPerformIncrementalSync()`, `getUserSyncState()`, `resetUserSyncState()`
   - Uses: `UsersRepository`, proper logging, follows existing service patterns
   - Focus: Single-user operations (works with current authenticated user)
3. **SyncProgressRepository Enhancement**: Add sync progress tracking methods
   - Methods: `createSyncProgress()`, `updateProgress()`, `markCompleted()`, `markFailed()`, `findActiveByUser()`
   - Handles different sync types (`initial`, `incremental`, `labels`)
   - No separate service needed - these are pure CRUD operations
4. **MessageProcessingService**: Build service for Gmail data processing business logic
   - Methods: `processGmailMessage()` (complex parsing/transformation)
   - Uses: `EmailMessagesRepository`, handles conversion from Gmail API format to entity
5. **EmailMessagesRepository Enhancement**: Add message update methods
   - Methods: `updateMessageEntity()`, `updateWithGmailData()`
   - Handles direct entity updates without business logic
6. **Repository Registration**: Ensure `LabelsRepository` is registered in DI container

#### **Phase 3: Queue Processors Implementation**
1. **Queue Types**: Add schemas to `src/queues/types.ts` ✅
2. **Label Sync Processor**: Implement in `queueDefinitions.ts` (uses GmailService + LabelRepository)
3. **Message Batch Processor**: Implement with repository and service dependencies
4. **Initial Sync Processor**: Implement orchestrating label sync and message batch jobs
5. **Incremental Sync Processor**: Implement using history API and message batch jobs

#### **Phase 4: Code Generation & Producers**
1. **Code Generation**: Run `bun run src/cli/bullmq-codegen.ts` to generate producers/workers
2. **Producer Functions**: Generated functions like `enqueueInitialSync`, `enqueueMessageBatch`, etc.
3. **Type Validation**: Ensure all schemas work correctly with existing BullMQ system
4. **Integration Testing**: Test that producers can enqueue jobs and processors can handle them

#### **Phase 5: CLI Integration**
1. **Producer Integration**: Replace direct service calls with generated producer functions
2. **CLI Migration**: Update sync commands to use `enqueueInitialSync()` instead of direct calls
3. **Error Recovery**: Implement comprehensive error handling and retry logic
4. **Job Scheduling**: Wire up initial sync triggers and incremental sync scheduling

#### **Phase 6: Performance & Reliability**
1. **Rate Limit Tuning**: Optimize queue configurations for Gmail quotas
2. **Large Mailbox Support**: Fine-tune batch sizes for 500k+ message accounts
3. **Automated Scheduling**: Add cron jobs for regular incremental syncs
4. **Monitoring & Alerts**: Add logging, metrics, and failure notifications

This architecture transforms the sync system from a simple, blocking operation into a robust, scalable, and efficient background processing system that follows Gmail API best practices while providing comprehensive data import including labels.