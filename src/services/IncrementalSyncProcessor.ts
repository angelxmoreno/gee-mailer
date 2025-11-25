import type { EmailMessageEntity } from '@app/database/entities';
import { EmailMessagesRepository, SyncProgressRepository } from '@app/database/repositories';
import type { MessageBatchPayload } from '@app/queues/types.ts';
import { GmailService } from '@app/services/GmailService.ts';
import { SyncStateService } from '@app/services/SyncStateService.ts';
import { inject, singleton } from 'tsyringe';

@singleton()
export class IncrementalSyncProcessor {
    protected gmailService: GmailService;
    protected syncProgressRepo: SyncProgressRepository;
    protected emailMessagesRepo: EmailMessagesRepository;
    protected syncStateService: SyncStateService;

    constructor(
        @inject(GmailService) gmailService: GmailService,
        @inject(SyncProgressRepository) syncProgressRepo: SyncProgressRepository,
        @inject(EmailMessagesRepository) emailMessagesRepo: EmailMessagesRepository,
        @inject(SyncStateService) syncStateService: SyncStateService
    ) {
        this.gmailService = gmailService;
        this.syncProgressRepo = syncProgressRepo;
        this.emailMessagesRepo = emailMessagesRepo;
        this.syncStateService = syncStateService;
    }

    async process(userId: number, enqueueMessageBatch: (payload: MessageBatchPayload) => Promise<void>) {
        try {
            // Create sync progress tracking
            const syncProgress = await this.syncProgressRepo.createSyncProgress(userId, 'incremental');

            // Get current user sync state to get historyId
            const syncState = await this.syncStateService.getUserSyncState(userId);
            if (!syncState.canIncrementalSync || !syncState.user?.historyId) {
                throw new Error('User cannot perform incremental sync - missing historyId or incomplete initial sync');
            }

            // Fetch history changes from Gmail using history API
            const historyResponse = await this.gmailService.fetchHistory(syncState.user.historyId);

            // Extract messages from history changes
            const messageEntities: Array<Partial<EmailMessageEntity>> = [];
            for (const historyItem of historyResponse.data) {
                // Process messagesAdded from history
                if (historyItem.messagesAdded) {
                    for (const addedItem of historyItem.messagesAdded) {
                        if (addedItem.message?.id) {
                            messageEntities.push({
                                userId,
                                messageId: addedItem.message.id,
                                threadId: addedItem.message.threadId,
                            });
                        }
                    }
                }
            }

            if (messageEntities.length > 0) {
                await this.emailMessagesRepo.saveMessages(messageEntities);
            }

            // Get the latest historyId for updating user state
            const latestHistoryId = await this.gmailService.getCurrentHistoryId();

            // Start message batch processing for new messages
            if (messageEntities.length > 0) {
                await enqueueMessageBatch({
                    userId,
                    batchSize: 25, // Smaller batch size for incremental
                    syncType: 'incremental',
                    syncProgressId: syncProgress.id,
                    lastIncrementalSyncAt: syncState.user.lastIncrementalSyncAt || undefined,
                });
            }

            // Update sync progress and user state
            await this.syncProgressRepo.updateProgress(syncProgress, {
                numTotal: messageEntities.length,
                status: messageEntities.length > 0 ? 'in_progress' : 'completed',
            });

            // Update user's historyId and last incremental sync time only after successful processing
            await this.syncStateService.updateUserSyncState(userId, {
                historyId: latestHistoryId,
                lastIncrementalSyncAt: new Date(),
            });

            if (messageEntities.length === 0) {
                await this.syncProgressRepo.markCompleted(syncProgress);
            }

            return {
                userId,
                action: messageEntities.length > 0 ? 'started' : 'completed',
                newMessages: messageEntities.length,
                syncProgressId: syncProgress.id,
            };
        } catch (error) {
            // Note: syncProgress may not be created if error occurs early
            console.error(
                { userId, error: error instanceof Error ? error.message : 'Unknown error' },
                'Incremental sync failed'
            );
            throw error;
        }
    }
}
