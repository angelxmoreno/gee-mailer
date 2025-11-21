import type { EmailMessageEntity } from '@app/database/entities';
import { EmailMessagesRepository, SyncProgressRepository } from '@app/database/repositories';
import type { MessageBatchPayload } from '@app/queues/types.ts';
import { GmailService } from '@app/services/GmailService.ts';
import { inject, singleton } from 'tsyringe';

@singleton()
export class InitialSyncProcessor {
    protected gmailService: GmailService;
    protected syncProgressRepo: SyncProgressRepository;
    protected emailMessagesRepo: EmailMessagesRepository;

    constructor(
        @inject(GmailService) gmailService: GmailService,
        @inject(SyncProgressRepository) syncProgressRepo: SyncProgressRepository,
        @inject(EmailMessagesRepository) emailMessagesRepo: EmailMessagesRepository
    ) {
        this.gmailService = gmailService;
        this.syncProgressRepo = syncProgressRepo;
        this.emailMessagesRepo = emailMessagesRepo;
    }

    async process(userId: number, enqueueMessageBatch: (payload: MessageBatchPayload) => Promise<void>) {
        try {
            // Create sync progress tracking
            const syncProgress = await this.syncProgressRepo.createSyncProgress(userId, 'initial');

            // Fetch message list from Gmail
            const messageList = await this.gmailService.fetchMessageList();

            // Save message entities (simple version without full details)
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

            await this.emailMessagesRepo.saveMessages(messageEntities);

            // Start message batch processing
            await enqueueMessageBatch({
                userId,
                batchSize: 50,
                syncType: 'initial',
                syncProgressId: syncProgress.id,
            });

            // Update sync progress
            await this.syncProgressRepo.updateProgress(syncProgress, {
                numTotal: messageList.data.messages?.length || 0,
                status: 'in_progress',
            });

            return {
                userId,
                action: 'started',
                totalMessages: messageList.data.messages?.length || 0,
                syncProgressId: syncProgress.id,
            };
        } catch (error) {
            // Note: syncProgress may not be created if error occurs early
            console.error(
                { userId, error: error instanceof Error ? error.message : 'Unknown error' },
                'Initial sync failed'
            );
            throw error;
        }
    }
}
