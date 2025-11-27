import type { EmailMessageEntity } from '@app/database/entities';
import { EmailMessagesRepository, MessageLabelRepository } from '@app/database/repositories';
import { AppLogger } from '@app/utils/tokens';
import type { gmail_v1 } from 'googleapis';
import type { Logger } from 'pino';
import { inject, singleton } from 'tsyringe';

type GmailMessage = gmail_v1.Schema$Message;

@singleton()
export class MessageProcessingService {
    protected logger: Logger;
    protected emailMessagesRepo: EmailMessagesRepository;
    protected messageLabelRepo: MessageLabelRepository;

    constructor(
        @inject(AppLogger) logger: Logger,
        @inject(EmailMessagesRepository) emailMessagesRepo: EmailMessagesRepository,
        @inject(MessageLabelRepository) messageLabelRepo: MessageLabelRepository
    ) {
        this.logger = logger;
        this.emailMessagesRepo = emailMessagesRepo;
        this.messageLabelRepo = messageLabelRepo;
    }

    /**
     * Process Gmail API message and update entity
     * Handles complex data transformation and business logic
     */
    async processGmailMessage(
        messageEntity: EmailMessageEntity,
        gmailMessage: GmailMessage
    ): Promise<EmailMessageEntity> {
        try {
            // Extract important headers for business logic
            const headers = this.extractImportantHeaders(gmailMessage.payload?.headers);

            // Apply business rules for message processing
            const processedData = this.applyMessageProcessingRules(gmailMessage, headers);

            // Convert processed Gmail data to entity format
            const { entity: entityUpdates } = this.emailMessagesRepo.convertGmailMessageToEntity(
                messageEntity.userId,
                processedData
            );

            // Update entity with processed data
            const updatedEntity = await this.emailMessagesRepo.update(messageEntity, entityUpdates);

            // Update label relationships if labelIds are present
            if (processedData.labelIds && Array.isArray(processedData.labelIds)) {
                await this.messageLabelRepo.replaceMessageLabels(
                    messageEntity.messageId,
                    processedData.labelIds,
                    messageEntity.userId
                );
            }

            this.logger.debug(
                {
                    messageId: gmailMessage.id,
                    userId: messageEntity.userId,
                    hasPayload: !!gmailMessage.payload,
                    headerCount: gmailMessage.payload?.headers?.length || 0,
                    labelCount: processedData.labelIds?.length || 0,
                },
                'Gmail message processed successfully'
            );

            return updatedEntity;
        } catch (error) {
            this.logger.error(
                {
                    messageId: gmailMessage.id,
                    userId: messageEntity.userId,
                    error: error instanceof Error ? error.message : 'Unknown error',
                },
                'Failed to process Gmail message'
            );
            throw error;
        }
    }

    /**
     * Extract important headers for business logic
     */
    protected extractImportantHeaders(headers?: gmail_v1.Schema$MessagePartHeader[]): Record<string, string> {
        if (!headers) return {};

        const importantHeaders = [
            'From',
            'To',
            'Cc',
            'Bcc',
            'Subject',
            'Date',
            'Message-ID',
            'In-Reply-To',
            'References',
            'Content-Type',
            'X-Gmail-Labels',
        ];

        const extracted: Record<string, string> = {};

        for (const header of headers) {
            if (header.name && header.value && importantHeaders.includes(header.name)) {
                extracted[header.name] = header.value;
            }
        }

        return extracted;
    }

    /**
     * Apply business rules for message processing
     */
    protected applyMessageProcessingRules(gmailMessage: GmailMessage, headers: Record<string, string>): GmailMessage {
        // Create a copy to avoid mutating original
        const processedMessage: GmailMessage = {
            ...gmailMessage,
        };

        // Business rule: Ensure internalDate is always set
        if (!processedMessage.internalDate && headers.Date) {
            const parsedDate = this.parseHeaderDate(headers.Date);
            if (parsedDate) {
                processedMessage.internalDate = parsedDate.toString();
            }
        }

        // Business rule: Normalize snippet length
        if (processedMessage.snippet && processedMessage.snippet.length > 500) {
            processedMessage.snippet = `${processedMessage.snippet.substring(0, 497)}...`;
        }

        // Business rule: Extract classification labels if present
        // Note: classificationLabelValues is not part of Gmail API schema, removing this business rule
        // if (headers['X-Gmail-Labels']) {
        //     processedMessage.classificationLabelValues = this.parseGmailLabels(headers['X-Gmail-Labels']);
        // }

        // Business rule: Ensure labelIds is always an array
        if (!processedMessage.labelIds) {
            processedMessage.labelIds = [];
        }

        return processedMessage;
    }

    /**
     * Parse date from email headers
     */
    protected parseHeaderDate(dateHeader: string): number | null {
        try {
            const date = new Date(dateHeader);
            if (!Number.isNaN(date.getTime())) {
                return date.getTime();
            }
        } catch {
            // Ignore parse errors
        }
        return null;
    }

    /**
     * Parse Gmail-specific label information
     */
    protected parseGmailLabels(labelHeader: string): Record<string, unknown> | null {
        try {
            // Gmail sometimes includes special label information in headers
            // This would contain business logic for parsing that data
            const labels = labelHeader.split(',').map((l) => l.trim());
            return { extractedLabels: labels };
        } catch {
            return null;
        }
    }

    /**
     * Check if message needs detailed processing
     */
    async needsDetailedProcessing(messageEntity: EmailMessageEntity): Promise<boolean> {
        // Business rule: Process if internalDate is missing or payload is empty
        const needsProcessing = !messageEntity.internalDate || !messageEntity.payload;

        this.logger.debug(
            {
                messageId: messageEntity.messageId,
                needsProcessing,
                hasInternalDate: !!messageEntity.internalDate,
                hasPayload: !!messageEntity.payload,
            },
            'Checked if message needs detailed processing'
        );

        return needsProcessing;
    }
}
