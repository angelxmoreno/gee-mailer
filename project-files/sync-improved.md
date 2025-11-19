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
@Unique(['labelId', 'userId'])
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

  @UpdateDateColumn()
  lastSyncedAt: Date;

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

  // One-to-many relationship with labels
  @OneToMany(() => LabelEntity, label => label.user, { cascade: ['remove'] })
  labels: Relation<LabelEntity[]>;
}
```

#### **Enhanced GmailService Methods**

```typescript
// Add to GmailService.ts
export class GmailService {
  // Existing methods...

  /**
   * Fetch all labels with caching
   */
  async fetchLabels(): Promise<{ data: gmail_v1.Schema$Label[] }> {
    const gmail = await this.createGmailClient();
    const currentUser = await this.currentUserService.getCurrentUserOrFail();
    const cacheKey = cacheKeyGenerator(['fetchLabels', currentUser.id]);
    const cache = (await this.cache.get(cacheKey)) as gmail_v1.Schema$Label[] | undefined;

    if (cache) {
      this.logger.debug({ userId: currentUser.id }, 'Labels fetched from cache');
      return { data: cache };
    }

    this.logger.debug({ userId: currentUser.id }, 'Fetching Gmail labels');
    const response = await gmail.users.labels.list({ userId: 'me' });
    const labels = response.data.labels || [];

    // Cache for 10 minutes (labels don't change frequently)
    this.cache.set(cacheKey, labels, 60 * 10 * 1000);
    return { data: labels };
  }

  /**
   * Fetch history changes with caching
   */
  async fetchHistory(startHistoryId: string): Promise<{ data: gmail_v1.Schema$History[] }> {
    const gmail = await this.createGmailClient();
    const currentUser = await this.currentUserService.getCurrentUserOrFail();
    const cacheKey = cacheKeyGenerator(['fetchHistory', currentUser.id, startHistoryId]);
    const cache = (await this.cache.get(cacheKey)) as gmail_v1.Schema$History[] | undefined;

    if (cache) {
      this.logger.debug({ userId: currentUser.id, startHistoryId }, 'History fetched from cache');
      return { data: cache };
    }

    this.logger.debug({ userId: currentUser.id, startHistoryId }, 'Fetching Gmail history');
    const response = await gmail.users.history.list({
      userId: 'me',
      startHistoryId,
      historyTypes: ['messageAdded', 'messageDeleted', 'labelAdded', 'labelRemoved']
    });
    const history = response.data.history || [];

    // Cache for 5 minutes (history is time-sensitive)
    this.cache.set(cacheKey, history, 60 * 5 * 1000);
    return { data: history };
  }

  /**
   * Get current historyId (always fresh, no caching)
   */
  async getCurrentHistoryId(): Promise<string> {
    const profile = await this.getProfile();
    return profile.data.historyId!;
  }

  /**
   * Batch fetch message details by IDs
   */
  async batchFetchMessages(messageIds: string[]): Promise<{ data: MessageResponse[] }> {
    const gmail = await this.createGmailClient();
    const currentUser = await this.currentUserService.getCurrentUserOrFail();
    const messages: MessageResponse[] = [];

    // Process in batches to avoid overwhelming the API
    const batchSize = 10;
    for (let i = 0; i < messageIds.length; i += batchSize) {
      const batch = messageIds.slice(i, i + batchSize);
      const batchPromises = batch.map(async (messageId) => {
        const cached = await this.getCachedMessage(messageId, currentUser.id);
        if (cached) return cached;

        const result = await gmail.users.messages.get({
          userId: 'me',
          id: messageId,
          format: 'full',
        });

        // Cache individual message
        const cacheKey = cacheKeyGenerator(['fetchMessage', currentUser.id, messageId]);
        this.cache.set(cacheKey, result.data, 60 * 30 * 1000);

        return result.data;
      });

      const batchResults = await Promise.all(batchPromises);
      messages.push(...batchResults.filter(Boolean) as MessageResponse[]);

      // Add delay between batches to respect rate limits
      if (i + batchSize < messageIds.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    return { data: messages };
  }

  /**
   * Get cached message if available
   */
  protected async getCachedMessage(messageId: string, userId: number): Promise<MessageResponse | null> {
    const cacheKey = cacheKeyGenerator(['fetchMessage', userId, messageId]);
    return (await this.cache.get(cacheKey)) as MessageResponse || null;
  }

  /**
   * Clear labels cache
   */
  async clearLabelsCache(userId?: number): Promise<void> {
    const targetUserId = userId || (await this.currentUserService.getCurrentUserOrFail()).id;
    const cacheKey = cacheKeyGenerator(['fetchLabels', targetUserId]);
    await this.cache.delete(cacheKey);
    this.logger.debug({ userId: targetUserId }, 'Labels cache cleared');
  }
}
```

### **Enhanced Job Processors**

#### **Initial Sync Processor**
```typescript
// workers/sync/InitialSyncProcessor.ts
export const initialSyncProcessor = async (job: Job<InitialSyncPayload>) => {
  const { userId } = job.data;

  // 1. Ensure this is not running while incremental sync is active
  const user = await getUserById(userId);
  if (user.initialSyncCompleted) {
    return { action: 'already_completed', userId };
  }

  // 2. Create sync progress record
  const progress = await createSyncProgress(userId, 'initial');

  try {
    // 3. Schedule label sync first (blocking dependency)
    await labelSyncQueue.add('labelSync', { userId }, { priority: 100 });
    await job.updateProgress(10);

    // 4. Two-phase message sync for large mailboxes
    // Phase 1: Collect and store all message IDs (persistent storage)
    let pageToken = null;
    let totalMessagesStored = 0;
    let pageCount = 0;

    do {
      const messageList = await gmailService.fetchMessageList(pageToken);
      const messages = messageList.data.messages || [];

      if (messages.length > 0) {
        // Store message IDs in messages entity (without details yet)
        const messageEntities = messages.map(msg => ({
          messageId: msg.id!,
          userId,
          threadId: msg.threadId,
          // Mark as unprocessed for detail fetching
          detailsFetched: false,
          createdAt: new Date()
        }));

        await messageRepository.upsert(messageEntities, ['messageId', 'userId']);
        totalMessagesStored += messages.length;
      }

      pageToken = messageList.data.nextPageToken;
      pageCount++;

      // Update progress for ID storage phase (10-60%)
      await job.updateProgress(10 + Math.min(pageCount * 2, 50));

    } while (pageToken);

    await job.updateProgress(60);
    this.logger.info({ userId, totalMessages: totalMessagesStored }, 'Message ID storage completed');

    // Phase 2: Create batch jobs for detail fetching of stored message IDs
    const batchSize = 50;
    const unprocessedMessages = await messageRepository.find({
      where: { userId, detailsFetched: false },
      select: ['id', 'messageId']
    });

    const totalBatches = Math.ceil(unprocessedMessages.length / batchSize);

    for (let i = 0; i < unprocessedMessages.length; i += batchSize) {
      const batch = unprocessedMessages.slice(i, i + batchSize);
      const batchNumber = Math.floor(i / batchSize) + 1;

      await gmailSyncQueue.add('messageBatch', {
        userId,
        messageEntityIds: batch.map(m => m.id), // Use entity IDs, not Gmail message IDs
        batchNumber,
        totalBatches,
        syncProgressId: progress.id,
        syncType: 'initial'
      }, {
        priority: 50,
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 }
      });
    }

    // Update progress for batch creation (50-80%)
    await job.updateProgress(80);

    // 5. Store initial historyId for future incremental syncs
    const historyId = await gmailService.getCurrentHistoryId();
    await updateUserHistoryId(userId, historyId);
    await job.updateProgress(90);

    // 6. Mark initial sync as in progress (will be completed by final batch job)
    await updateUserSyncState(userId, { initialSyncStarted: true });
    await job.updateProgress(100);

    return {
      totalMessages: totalMessageIds.length,
      batchesCreated: totalBatches,
      historyId,
      userId
    };

  } catch (error) {
    await markSyncProgressFailed(progress.id, error.message);
    throw error;
  }
};
```

#### **Label Sync Processor**
```typescript
// workers/labels/LabelSyncProcessor.ts
export const labelSyncProcessor = async (job: Job<LabelSyncPayload>) => {
  const { userId } = job.data;

  try {
    // 1. Fetch all labels from Gmail
    const { data: gmailLabels } = await gmailService.fetchLabels();

    // 2. Get existing labels for this user
    const existingLabels = await labelRepository.find({ where: { userId } });
    const existingLabelIds = new Set(existingLabels.map(l => l.labelId));

    // 3. Process each Gmail label
    const processedLabels: LabelEntity[] = [];

    for (const gmailLabel of gmailLabels) {
      if (!gmailLabel.id) continue;

      // Upsert label entity
      const labelData = {
        labelId: gmailLabel.id,
        userId,
        name: gmailLabel.name || 'Unknown',
        type: (gmailLabel.type === 'system' ? 'system' : 'user') as 'system' | 'user',
        color: gmailLabel.color?.backgroundColor || null,
        labelListVisibility: gmailLabel.labelListVisibility !== 'labelHide',
        messageListVisibility: gmailLabel.messageListVisibility !== 'hide',
        messagesTotal: gmailLabel.messagesTotal || 0,
        messagesUnread: gmailLabel.messagesUnread || 0,
        threadsTotal: gmailLabel.threadsTotal || 0,
        threadsUnread: gmailLabel.threadsUnread || 0,
        lastSyncedAt: new Date()
      };

      const label = await labelRepository.save(
        labelRepository.create(labelData)
      );
      processedLabels.push(label);

      // Remove from tracking set if it existed
      existingLabelIds.delete(gmailLabel.id);
    }

    // 4. Remove labels that no longer exist in Gmail
    if (existingLabelIds.size > 0) {
      await labelRepository.delete({
        userId,
        labelId: In([...existingLabelIds])
      });
    }

    // 5. Mark label sync as completed for this user
    await updateUserSyncState(userId, { labelSyncCompleted: true });

    return {
      labelsProcessed: processedLabels.length,
      labelsRemoved: existingLabelIds.size,
      userId
    };

  } catch (error) {
    this.logger.error({ userId, error }, 'Label sync failed');
    throw error;
  }
};
```

#### **Incremental Sync Processor**
```typescript
// workers/sync/IncrementalSyncProcessor.ts
export const incrementalSyncProcessor = async (job: Job<IncrementalSyncPayload>) => {
  const { userId } = job.data;

  // 1. Ensure initial sync has completed
  const user = await getUserById(userId);
  if (!user.initialSyncCompleted) {
    this.logger.warn({ userId }, 'Incremental sync skipped - initial sync not completed');
    return { action: 'initial_sync_required', userId };
  }

  // 2. Check if we have a valid historyId
  const lastHistoryId = user.historyId;
  if (!lastHistoryId) {
    // No history available, schedule full sync
    await gmailSyncQueue.add('initialSync', { userId });
    return { action: 'no_history_fallback_to_full_sync', userId };
  }

  try {
    // 3. Fetch history since last sync
    const { data: history } = await gmailService.fetchHistory(lastHistoryId);

    if (history.length === 0) {
      // Update last incremental sync timestamp even if no changes
      await updateUserSyncState(userId, { lastIncrementalSyncAt: new Date() });
      return { action: 'no_changes', userId };
    }

    // 4. Process history changes
    const changes = await processHistoryChanges(history, userId);

    // 5. Create batch jobs for affected messages (if any)
    if (changes.messagesAdded.length > 0) {
      const batchSize = 25; // Smaller batches for incremental updates
      const totalBatches = Math.ceil(changes.messagesAdded.length / batchSize);

      for (let i = 0; i < changes.messagesAdded.length; i += batchSize) {
        const batchIds = changes.messagesAdded.slice(i, i + batchSize);
        const batchNumber = Math.floor(i / batchSize) + 1;

        await gmailSyncQueue.add('messageBatch', {
          userId,
          messageIds: batchIds,
          batchNumber,
          totalBatches,
          syncType: 'incremental'
        }, {
          priority: 75, // Higher priority than initial sync batches
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 }
        });
      }
    }

    // 6. Handle deletions and label changes immediately
    await handleMessageDeletions(changes.messagesDeleted, userId);
    await handleLabelChanges(changes.labelChanges, userId);

    // 7. Store new historyId and update timestamps
    const newHistoryId = await gmailService.getCurrentHistoryId();
    await updateUserSyncState(userId, {
      historyId: newHistoryId,
      lastIncrementalSyncAt: new Date()
    });

    return {
      changesProcessed: history.length,
      messagesAdded: changes.messagesAdded.length,
      messagesDeleted: changes.messagesDeleted.length,
      labelChanges: changes.labelChanges.length,
      batchesCreated: Math.ceil(changes.messagesAdded.length / 25),
      newHistoryId,
      userId
    };

  } catch (error) {
    if (error.status === 404 || error.code === 'HISTORY_ID_TOO_OLD') {
      // History expired, fallback to full sync
      this.logger.warn({ userId, lastHistoryId }, 'History ID expired, falling back to full sync');
      await updateUserSyncState(userId, { initialSyncCompleted: false, historyId: null });
      await gmailSyncQueue.add('initialSync', { userId }, { priority: 80 });
      return { action: 'history_expired_fallback', userId };
    }
    throw error; // Re-throw for retry logic
  }
};

/**
 * Process history changes and extract affected message IDs
 */
protected async processHistoryChanges(history: gmail_v1.Schema$History[], userId: number) {
  const messagesAdded: string[] = [];
  const messagesDeleted: string[] = [];
  const labelChanges: Array<{ messageId: string; labelsAdded: string[]; labelsRemoved: string[] }> = [];

  for (const historyItem of history) {
    // Handle added messages
    if (historyItem.messagesAdded) {
      for (const added of historyItem.messagesAdded) {
        if (added.message?.id) {
          messagesAdded.push(added.message.id);
        }
      }
    }

    // Handle deleted messages
    if (historyItem.messagesDeleted) {
      for (const deleted of historyItem.messagesDeleted) {
        if (deleted.message?.id) {
          messagesDeleted.push(deleted.message.id);
        }
      }
    }

    // Handle label changes
    if (historyItem.labelsAdded) {
      for (const labelAdded of historyItem.labelsAdded) {
        if (labelAdded.message?.id) {
          labelChanges.push({
            messageId: labelAdded.message.id,
            labelsAdded: labelAdded.labelIds || [],
            labelsRemoved: []
          });
        }
      }
    }

    if (historyItem.labelsRemoved) {
      for (const labelRemoved of historyItem.labelsRemoved) {
        if (labelRemoved.message?.id) {
          // Find existing change record or create new one
          let change = labelChanges.find(c => c.messageId === labelRemoved.message!.id);
          if (!change) {
            change = {
              messageId: labelRemoved.message.id,
              labelsAdded: [],
              labelsRemoved: labelRemoved.labelIds || []
            };
            labelChanges.push(change);
          } else {
            change.labelsRemoved.push(...(labelRemoved.labelIds || []));
          }
        }
      }
    }
  }

  // Remove duplicates
  return {
    messagesAdded: [...new Set(messagesAdded)],
    messagesDeleted: [...new Set(messagesDeleted)],
    labelChanges
  };
}
```

### **Queue Configuration**

```typescript
// Add to queueDefinitions.ts

// Job schemas
const InitialSyncSchema = z.object({
  userId: z.number()
});

const IncrementalSyncSchema = z.object({
  userId: z.number()
});

const MessageBatchSchema = z.object({
  userId: z.number(),
  messageEntityIds: z.array(z.number()), // Database entity IDs, not Gmail message IDs
  batchNumber: z.number(),
  totalBatches: z.number().optional(),
  syncProgressId: z.number().optional(),
  syncType: z.enum(['initial', 'incremental'])
});

const LabelSyncSchema = z.object({
  userId: z.number()
});

// Queue configurations
const gmailSync = {
  options: {
    defaultJobOptions: {
      removeOnComplete: 50,
      removeOnFail: 100,
      attempts: 5,
      backoff: {
        type: 'exponential',
        delay: 5000
      },
    },
  },
  workers: {
    initialSync: {
      schema: InitialSyncSchema,
      processor: initialSyncProcessor,
      options: {
        concurrency: 1, // One full sync per user at a time
        limiter: {
          max: 3, // Conservative limit for initial syncs
          duration: 60000,
        },
      },
    },
    incrementalSync: {
      schema: IncrementalSyncSchema,
      processor: incrementalSyncProcessor,
      options: {
        concurrency: 5, // Multiple incremental syncs can run
        limiter: {
          max: 15, // More frequent for incremental updates
          duration: 60000,
        },
      },
    },
    messageBatch: {
      schema: MessageBatchSchema,
      processor: messageBatchProcessor,
      options: {
        concurrency: 8, // High concurrency for batch processing
        limiter: {
          max: 60, // Respect Gmail API quota limits
          duration: 60000,
        },
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
      processor: labelSyncProcessor,
      options: {
        concurrency: 3, // Multiple users can sync labels simultaneously
        limiter: {
          max: 10, // Labels don't change frequently
          duration: 60000,
        },
      },
    },
  },
},

// Sync state management queue for coordination
gmailMaintenance: {
  options: {
    defaultJobOptions: {
      removeOnComplete: 10,
      removeOnFail: 20,
      attempts: 2,
    },
  },
  workers: {
    syncStateCheck: {
      schema: z.object({ userId: z.number() }),
      processor: syncStateCheckProcessor,
      options: {
        concurrency: 2,
        limiter: {
          max: 20, // Health checks can be frequent
          duration: 60000,
        },
      },
    },
    scheduledIncrementalSync: {
      schema: z.object({}), // Runs for all eligible users
      processor: scheduledIncrementalSyncProcessor,
      options: {
        concurrency: 1, // Single scheduler process
      },
    },
  },
},
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

#### **SyncProgressService**
```typescript
// services/SyncProgressService.ts
import { SyncProgressRepository } from '@app/database/repositories';
import { SyncProgressEntity } from '@app/database/entities';
import { inject, singleton } from 'tsyringe';

@singleton()
export class SyncProgressService {
    constructor(
        @inject(SyncProgressRepository) protected syncProgressRepository: SyncProgressRepository
    ) {}

    async createSyncProgress(
        userId: number,
        syncType: 'initial' | 'incremental' | 'labels' = 'initial'
    ): Promise<SyncProgressEntity> {
        // Remove any existing progress for this user and sync type
        await this.syncProgressRepository.delete({ userId, syncType });

        const progress = this.syncProgressRepository.create({
            userId,
            syncType,
            status: 'pending',
            startedAt: new Date()
        });

        return this.syncProgressRepository.save(progress);
    }

    async updateSyncProgress(
        progressId: number,
        updates: Partial<{
            numProcessed: number;
            numTotal: number;
            batchesCompleted: number;
            batchesTotal: number;
            status: 'pending' | 'in_progress' | 'completed' | 'failed';
            nextPageToken: string | null;
        }>
    ): Promise<void> {
        await this.syncProgressRepository.update(progressId, {
            ...updates,
            updatedAt: new Date()
        });
    }

    async markSyncProgressFailed(progressId: number, errorMessage: string): Promise<void> {
        await this.syncProgressRepository.update(progressId, {
            status: 'failed',
            errorMessage,
            completedAt: new Date()
        });
    }

    async completeSyncProgress(progressId: number): Promise<void> {
        await this.syncProgressRepository.update(progressId, {
            status: 'completed',
            completedAt: new Date()
        });
    }

    async getSyncProgress(userId: number, syncType?: string): Promise<SyncProgressEntity | null> {
        const where: any = { userId };
        if (syncType) where.syncType = syncType;

        return this.syncProgressRepository.findOne({
            where,
            order: { createdAt: 'DESC' }
        });
    }

    async getActiveSyncProgress(userId: number): Promise<SyncProgressEntity[]> {
        return this.syncProgressRepository.find({
            where: {
                userId,
                status: In(['pending', 'in_progress'])
            },
            order: { createdAt: 'DESC' }
        });
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

#### **MessageBatch Processor**
```typescript
// workers/sync/MessageBatchProcessor.ts
export const messageBatchProcessor = async (job: Job<MessageBatchPayload>) => {
  const { userId, messageEntityIds, batchNumber, totalBatches, syncProgressId, syncType } = job.data;

  try {
    // Get message entities from database
    const messageEntities = await messageRepository.findBy({
      id: In(messageEntityIds),
      userId
    });

    const processedMessages = [];

    for (const entity of messageEntities) {
      // Fetch details from Gmail API
      const { data: gmailMessage } = await gmailService.fetchMessage(entity.messageId);

      // Process and update the entity with full details
      const processed = await messageProcessor.processMessage(gmailMessage, entity);

      // Mark as processed
      await messageRepository.update(entity.id, {
        detailsFetched: true,
        updatedAt: new Date()
      });

      processedMessages.push(processed);
    }

    // Update sync progress if this is part of initial sync
    if (syncProgressId && totalBatches) {
      await updateSyncProgress(syncProgressId, {
        batchesCompleted: batchNumber,
        batchesTotal: totalBatches,
        numProcessed: batchNumber * messageEntities.length
      });

      // Mark initial sync as completed if this is the final batch
      if (batchNumber === totalBatches && syncType === 'initial') {
        await updateUserSyncState(userId, {
          initialSyncCompleted: true,
          lastFullSyncAt: new Date()
        });
        await completeSyncProgress(syncProgressId);
      }
    }

    return {
      messagesProcessed: processedMessages.length,
      batchNumber,
      totalBatches,
      syncType,
      userId
    };

  } catch (error) {
    if (syncProgressId) {
      await markSyncProgressFailed(syncProgressId, `Batch ${batchNumber} failed: ${error.message}`);
    }
    throw error;
  }
};
```

### **Implementation Strategy**

#### **Phase 1: Foundation**
1. **Database Migration**: Add `LabelEntity` extending `AppEntity` with proper constraints
2. **User Entity Update**: Add sync state tracking fields (`historyId`, sync completion flags, timestamps)
3. **Repository Setup**: Create `LabelRepository` with user-scoped queries
4. **Service Extension**: Add label and history methods to `GmailService` with caching

#### **Phase 2: Core Processors**
1. **Label Sync**: Implement `labelSyncProcessor` with upsert logic and cleanup
2. **Initial Sync**: Create two-phase `initialSyncProcessor` (ID collection → batch processing)
3. **Message Batch**: Implement `messageBatchProcessor` with progress tracking
4. **Sync State**: Build `SyncStateService` for dependency management

#### **Phase 3: Incremental Sync**
1. **History Processing**: Add `incrementalSyncProcessor` with history API
2. **Change Detection**: Implement history change parsing and message diff logic
3. **Fallback Logic**: Handle expired history IDs gracefully
4. **Dependency Checks**: Ensure initial sync completion before incremental

#### **Phase 4: Integration & Scheduling**
1. **CLI Migration**: Replace direct sync calls with job scheduling
2. **Automated Scheduling**: Add cron jobs for regular incremental syncs
3. **Progress Monitoring**: Integrate BullBoard for real-time job tracking
4. **Error Recovery**: Implement comprehensive error handling and retry logic

#### **Phase 5: Performance & Reliability**
1. **Rate Limit Tuning**: Optimize queue configurations for Gmail quotas
2. **Large Mailbox Support**: Fine-tune batch sizes for 500k+ message accounts
3. **Monitoring & Alerts**: Add logging, metrics, and failure notifications
4. **Advanced Features**: Consider push notifications and webhook integration

This architecture transforms the sync system from a simple, blocking operation into a robust, scalable, and efficient background processing system that follows Gmail API best practices while providing comprehensive data import including labels.