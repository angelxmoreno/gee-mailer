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

            // Fetch message list from Gmail using history API
            const messageList = await this.gmailService.fetchMessageList(syncState.user.historyId);

            // Save new message entities
            const messageEntities: Array<Partial<EmailMessageEntity>> = [];
            for (const message of messageList.data.messages || []) {
                if (message.id) {
                    messageEntities.push({
                        userId,
                        messageId: message.id,
                        threadId: message.threadId,
                    });
                }
            }

            if (messageEntities.length > 0) {
                await this.emailMessagesRepo.saveMessages(messageEntities);
            }

            // Start message batch processing for new messages
            if (messageEntities.length > 0) {
                await enqueueMessageBatch({
                    userId,
                    batchSize: 25, // Smaller batch size for incremental
                    syncType: 'incremental',
                    syncProgressId: syncProgress.id,
                    lastIncrementalSyncAt: new Date(),
                });
            }

            // Update sync progress and user state
            await this.syncProgressRepo.updateProgress(syncProgress, {
                numTotal: messageEntities.length,
                status: messageEntities.length > 0 ? 'in_progress' : 'completed',
            });

            // Update user's last incremental sync time
            await this.syncStateService.updateUserSyncState(userId, {
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
