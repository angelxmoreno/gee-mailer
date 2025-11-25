import type { EmailMessageEntity } from '@app/database/entities';
import { EmailMessagesRepository } from '@app/database/repositories';
import type { MessageBatchPayload } from '@app/queues/types.ts';
import { GmailService } from '@app/services/GmailService.ts';
import { MessageProcessingService } from '@app/services/MessageProcessingService.ts';
import { inject, singleton } from 'tsyringe';
import { type FindOptionsWhere, IsNull } from 'typeorm';

@singleton()
export class MessageBatchProcessor {
    protected gmailService: GmailService;
    protected messageRepository: EmailMessagesRepository;
    protected messageProcessingService: MessageProcessingService;

    constructor(
        @inject(GmailService) gmailService: GmailService,
        @inject(EmailMessagesRepository) messageRepository: EmailMessagesRepository,
        @inject(MessageProcessingService) messageProcessingService: MessageProcessingService
    ) {
        this.gmailService = gmailService;
        this.messageRepository = messageRepository;
        this.messageProcessingService = messageProcessingService;
    }

    async process(jobData: MessageBatchPayload, enqueueMessageBatch: (payload: MessageBatchPayload) => Promise<void>) {
        const { userId, batchSize, syncType, syncProgressId, lastIncrementalSyncAt } = jobData;

        // Different query strategies based on sync type
        const whereClause: FindOptionsWhere<EmailMessageEntity> = { userId, internalDate: IsNull() };
        let orderClause: Record<string, string> = {};

        if (syncType === 'initial') {
            // Initial sync: process all unprocessed messages, oldest first for stable progress
            orderClause = { createdAt: 'ASC' };
        } else if (syncType === 'incremental') {
            // Incremental sync: prioritize recent messages, newest first for faster user feedback
            orderClause = { createdAt: 'DESC' };
            // No createdAt filter - process all unprocessed messages by internalDate only
        }

        const unprocessedMessages = await this.messageRepository.repository.find({
            where: whereClause,
            take: batchSize,
            order: orderClause,
            select: ['id', 'messageId', 'createdAt'],
        });

        // Process each message
        for (const entity of unprocessedMessages) {
            const { data: gmailMessage } = await this.gmailService.fetchMessage(entity.messageId);
            // Update entity with Gmail data including internalDate
            await this.messageProcessingService.processGmailMessage(entity, gmailMessage);
        }

        // Check for remaining messages with same filter criteria
        const remainingCount = await this.messageRepository.repository.count({ where: whereClause });

        if (remainingCount > 0) {
            // Schedule next batch with same parameters
            await enqueueMessageBatch({
                userId,
                batchSize,
                syncType,
                syncProgressId,
                lastIncrementalSyncAt,
            });
        }

        console.log(`[${syncType}] Processed ${unprocessedMessages.length} messages for user ${userId}`);

        return {
            userId,
            syncType,
            messagesProcessed: unprocessedMessages.length,
            remainingMessages: remainingCount,
        };
    }
}
