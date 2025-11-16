import { EmailMessageEntity } from '@app/database/entities';
import { BaseRepositoryService } from '@app/modules/typeorm/BaseRepositoryService';
import type { MessageListResponse } from '@app/services/GmailService';
import { filterNullish } from '@app/utils/filterNullish';
import type { gmail_v1 } from 'googleapis';
import { inject, singleton } from 'tsyringe';
import { DataSource, type ObjectLiteral } from 'typeorm';

type MessageData = gmail_v1.Schema$Message;

@singleton()
export class EmailMessagesRepository extends BaseRepositoryService<EmailMessageEntity> {
    constructor(@inject(DataSource) dataSource: DataSource) {
        super(dataSource, EmailMessageEntity);
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
}
