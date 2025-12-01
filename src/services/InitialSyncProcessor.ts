import type { EmailMessageEntity } from '@app/database/entities';
import { EmailMessagesRepository, SyncProgressRepository } from '@app/database/repositories';
import type { MessageBatchPayload } from '@app/queues/types.ts';
import { GmailService } from '@app/services/GmailService.ts';
import { AppLogger } from '@app/utils/tokens';
import type { Logger } from 'pino';
import { inject, singleton } from 'tsyringe';

@singleton()
export class InitialSyncProcessor {
    protected gmailService: GmailService;
    protected syncProgressRepo: SyncProgressRepository;
    protected emailMessagesRepo: EmailMessagesRepository;
    protected logger: Logger;

    constructor(
        @inject(GmailService) gmailService: GmailService,
        @inject(SyncProgressRepository) syncProgressRepo: SyncProgressRepository,
        @inject(EmailMessagesRepository) emailMessagesRepo: EmailMessagesRepository,
        @inject(AppLogger) logger: Logger
    ) {
        this.gmailService = gmailService;
        this.syncProgressRepo = syncProgressRepo;
        this.emailMessagesRepo = emailMessagesRepo;
        this.logger = logger;
    }

    async process(
        userId: number,
        enqueueMessageBatch: (payload: MessageBatchPayload) => Promise<void>
    ): Promise<{
        userId: number;
        action: string;
        totalMessages: number;
        syncProgressId: number;
    }> {
        try {
            // Create sync progress tracking
            const syncProgress = await this.syncProgressRepo.createSyncProgress(userId, 'initial');

            // Fetch all pages of messages from Gmail
            const allMessageEntities: Array<Partial<EmailMessageEntity>> = [];
            let pageToken: string | null | undefined;
            let totalMessages = 0;

            do {
                this.logger.debug({ userId, pageToken }, 'Fetching Gmail message list page');
                const messageList = await this.gmailService.fetchMessageList(pageToken);

                // Save message entities (simple version without full details)
                const pageEntities: Array<Partial<EmailMessageEntity>> = [];
                for (const message of messageList.data.messages || []) {
                    if (message.id) {
                        pageEntities.push({
                            userId,
                            messageId: message.id,
                            threadId: message.threadId,
                        });
                    }
                }

                if (pageEntities.length > 0) {
                    await this.emailMessagesRepo.saveMessages(pageEntities);
                    allMessageEntities.push(...pageEntities);
                }

                totalMessages += pageEntities.length;
                pageToken = messageList.data.nextPageToken;

                this.logger.info(
                    {
                        userId,
                        pageMessages: pageEntities.length,
                        totalMessages,
                        hasMorePages: !!pageToken,
                    },
                    'Processed Gmail message list page (message details and contacts will be processed in batches)'
                );
            } while (pageToken);

            // Start message batch processing
            await enqueueMessageBatch({
                userId,
                batchSize: 50,
                syncType: 'initial',
                syncProgressId: syncProgress.id,
            });

            // Update sync progress with total count from all pages
            await this.syncProgressRepo.updateProgress(syncProgress, {
                numTotal: totalMessages,
                status: 'in_progress',
            });

            return {
                userId,
                action: 'started',
                totalMessages,
                syncProgressId: syncProgress.id,
            };
        } catch (error) {
            // Note: syncProgress may not be created if error occurs early
            this.logger.error(
                { userId, error: error instanceof Error ? error.message : 'Unknown error' },
                'Initial sync failed'
            );
            throw error;
        }
    }
}
