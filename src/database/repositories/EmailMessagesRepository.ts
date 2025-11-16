import { EmailMessageEntity } from '@app/database/entities';
import { BaseRepositoryService } from '@app/modules/typeorm/BaseRepositoryService';
import type { MessageListResponse } from '@app/services/GmailService';
import { filterNullish } from '@app/utils/filterNullish';
import type { gmail_v1 } from 'googleapis';
import { inject, singleton } from 'tsyringe';
import { DataSource, type ObjectLiteral } from 'typeorm';
import { HeaderRepository } from './HeaderRepository';
import { MessagePartRepository } from './MessagePartRepository';

type MessageData = gmail_v1.Schema$Message;

@singleton()
export class EmailMessagesRepository extends BaseRepositoryService<EmailMessageEntity> {
    protected headerRepository: HeaderRepository;
    protected messagePartRepository: MessagePartRepository;

    constructor(
        @inject(DataSource) dataSource: DataSource,
        @inject(HeaderRepository) headerRepository: HeaderRepository,
        @inject(MessagePartRepository) messagePartRepository: MessagePartRepository
    ) {
        super(dataSource, EmailMessageEntity);
        this.headerRepository = headerRepository;
        this.messagePartRepository = messagePartRepository;
    }

    /**
     * Helper to create partial entity data, excluding null/undefined values to prevent overwriting
     */
    protected createPartialMessage(userId: number, message: MessageData): Partial<EmailMessageEntity> {
        if (!message.id) {
            throw new Error('Message must have an ID');
        }

        const partial = {
            userId,
            messageId: message.id,
            threadId: message.threadId,
            labelIds: message.labelIds,
            snippet: message.snippet,
            historyId: message.historyId,
            internalDate: message.internalDate ? Number(message.internalDate) : null,
            sizeEstimate: message.sizeEstimate,
            payload: message.payload,
            raw: message.raw,
        };

        return filterNullish(partial);
    }

    /**
     * Save messages from list API (minimal data, preserve existing detailed data)
     */
    async saveMessageList(userId: number, messageList: MessageListResponse): Promise<ObjectLiteral[]> {
        if (!messageList.messages?.length) {
            return [];
        }

        const partials: Array<Partial<EmailMessageEntity>> = [];
        for (const message of messageList.messages) {
            if (message.id) {
                const partial = this.createPartialMessage(userId, message);
                partials.push(partial);
            }
        }

        const { identifiers } = await this.repository.upsert(partials as Parameters<typeof this.upsert>[0], [
            'userId',
            'messageId',
        ]);
        return identifiers;
    }

    /**
     * Save individual detailed message
     */
    async saveMessage(userId: number, messageData: MessageData): Promise<EmailMessageEntity> {
        const partial = this.createPartialMessage(userId, messageData);

        return this.upsert(partial as Parameters<typeof this.upsert>[0], ['userId', 'messageId']);
    }

    /**
     * Extract headers from Gmail API payload
     */
    protected extractHeaders(payload: gmail_v1.Schema$MessagePart): Array<{ name: string; value: string | null }> {
        if (!payload?.headers) {
            return [];
        }

        return payload.headers
            .map((header) => ({
                name: header.name || '',
                value: header.value || null,
            }))
            .filter((h) => h.name); // Only include headers with names
    }

    /**
     * Save detailed message with headers and message parts
     */
    async saveDetailedMessage(userId: number, messageData: MessageData): Promise<EmailMessageEntity> {
        if (!messageData.id) {
            throw new Error('Message must have an ID');
        }

        // Save the main message
        const savedMessage = await this.saveMessage(userId, messageData);

        // Extract and save headers from the payload
        if (messageData.payload) {
            const headers = this.extractHeaders(messageData.payload);
            if (headers.length > 0) {
                await this.headerRepository.saveHeadersForMessage(userId, messageData.id, headers);
            }

            // Extract and save message parts (if they exist)
            if (messageData.payload.parts && messageData.payload.parts.length > 0) {
                await this.messagePartRepository.savePartsForMessage(userId, messageData.id, messageData.payload.parts);
            } else if (messageData.payload.body || messageData.payload.mimeType) {
                // Single part message - save the payload itself as a part
                await this.messagePartRepository.savePartsForMessage(userId, messageData.id, [messageData.payload]);
            }
        }

        return savedMessage;
    }

    /**
     * Find message with all related data (headers and parts)
     */
    async findDetailedMessage(messageId: string): Promise<EmailMessageEntity | null> {
        return this.repository.findOne({
            where: { messageId },
            relations: ['headers', 'messageParts'],
        });
    }
}
