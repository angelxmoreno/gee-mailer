import { SyncProgressEntity } from '@app/database/entities';
import { EmailMessagesRepository, SyncProgressRepository } from '@app/database/repositories';
import { CurrentUserService } from '@app/services/CurrentUserService';
import { GmailService } from '@app/services/GmailService';
import { AppCache, AppLogger } from '@app/utils/tokens';
import type Keyv from '@keyvhq/core';
import type { Logger } from 'pino';
import { inject, singleton } from 'tsyringe';

@singleton()
export class MailSyncService {
    protected logger: Logger;
    protected cache: Keyv;
    protected currentUser: CurrentUserService;
    protected syncRepo: SyncProgressRepository;
    protected messagesRepo: EmailMessagesRepository;
    protected gmailService: GmailService;

    constructor(
        @inject(AppLogger) logger: Logger,
        @inject(AppCache) cache: Keyv,
        @inject(CurrentUserService) currentUser: CurrentUserService,
        @inject(SyncProgressRepository) syncRepo: SyncProgressRepository,
        @inject(EmailMessagesRepository) messagesRepo: EmailMessagesRepository,
        @inject(GmailService) gmailService: GmailService
    ) {
        this.logger = logger.child({ module: 'MailSyncService' });
        this.cache = cache;
        this.currentUser = currentUser;
        this.syncRepo = syncRepo;
        this.messagesRepo = messagesRepo;
        this.gmailService = gmailService;
    }

    async sync() {
        const currentUser = await this.currentUser.getCurrentUserOrFail();
        let progress: SyncProgressEntity | null = null;

        // Get or create sync progress
        progress = await this.syncRepo.findOne({
            userId: currentUser.id,
        });

        if (!progress) {
            this.logger.info('📊 Getting Gmail profile information...');
            const profile = await this.gmailService.getProfile();
            const totalMessages = profile.data.messagesTotal || 0;

            // Create a proper entity instance
            const newProgress = new SyncProgressEntity();
            newProgress.userId = currentUser.id;
            newProgress.numTotal = totalMessages;
            newProgress.numProcessed = 0;
            newProgress.nextPageToken = null;

            progress = await this.syncRepo.save(newProgress);

            this.logger.info(`📧 Found ${totalMessages.toLocaleString()} total messages to process`);
        } else {
            const percentage =
                progress.numTotal > 0 ? Math.round((progress.numProcessed / progress.numTotal) * 100) : 0;
            this.logger.info(
                `📊 Resuming sync: ${progress.numProcessed.toLocaleString()}/${progress.numTotal.toLocaleString()} (${percentage}%)`
            );
        }

        // Process messages in batches
        while (progress.shouldStillFetch()) {
            this.logger.info(`⏳ Fetching next batch of messages...`);

            const messageList = await this.gmailService.fetchMessageList(progress.nextPageToken);
            const messages = await this.messagesRepo.saveMessageList(currentUser.id, messageList.data);

            if (messages.length === 0) {
                // No more messages, mark as finished
                progress.nextPageToken = 'finished';
                await this.syncRepo.save(progress);
                break;
            }

            // Update progress
            progress.numProcessed += messages.length;
            progress.nextPageToken = messageList.data.nextPageToken || 'finished';

            await this.syncRepo.save(progress);

            const percentage =
                progress.numTotal > 0 ? Math.round((progress.numProcessed / progress.numTotal) * 100) : 0;

            this.logger.info(
                `✨ Processed ${messages.length} messages | Total: ${progress.numProcessed.toLocaleString()}/${progress.numTotal.toLocaleString()} (${percentage}%)`
            );

            // Log individual message processing (optional - can be removed for production)
            this.logger.debug(
                {
                    userId: currentUser.id,
                    batchSize: messages.length,
                    totalProcessed: progress.numProcessed,
                    totalMessages: progress.numTotal,
                    nextPageToken: progress.nextPageToken,
                },
                'Batch processed'
            );

            // Small delay to avoid rate limiting
            if (progress.shouldStillFetch()) {
                await new Promise((resolve) => setTimeout(resolve, 100));
            }
        }

        const finalPercentage =
            progress.numTotal > 0 ? Math.round((progress.numProcessed / progress.numTotal) * 100) : 100;

        if (progress.nextPageToken === 'finished') {
            this.logger.info(
                `🎉 Sync completed! Processed ${progress.numProcessed.toLocaleString()} messages (${finalPercentage}%)`
            );
        }

        this.logger.info(
            {
                userId: currentUser.id,
                progress: {
                    processed: progress.numProcessed,
                    total: progress.numTotal,
                    percentage: finalPercentage,
                    isFinished: progress.nextPageToken === 'finished',
                },
            },
            'Sync session completed'
        );
    }
}
