import { EmailMessageEntity, HeaderEntity, MessagePartEntity } from '@app/database/entities';
import { BaseRepositoryService } from '@app/modules/typeorm/BaseRepositoryService';
import type { MessageListResponse } from '@app/services/GmailService';
import { filterNullish } from '@app/utils/filterNullish';
import type { gmail_v1 } from 'googleapis';
import { inject, singleton } from 'tsyringe';
import { DataSource, type EntityManager, type ObjectLiteral } from 'typeorm';

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

        return this.dataSource.transaction(async (manager) => {
            // Upsert the main message entity
            const partial = this.createPartialMessage(userId, messageData);
            // biome-ignore lint/suspicious/noExplicitAny: TypeORM's `upsert` expects a `QueryDeepPartialEntity` which is not a public type.
            await manager.upsert(EmailMessageEntity, partial as any, ['userId', 'messageId']);
            const savedMessage = await manager.findOneByOrFail(EmailMessageEntity, {
                userId: partial.userId,
                messageId: partial.messageId,
            });

            if (messageData.payload) {
                // Upsert headers for the top-level payload
                const headers = this.extractHeaders(messageData.payload);
                if (headers.length > 0) {
                    const headerPartials = headers.map((h) => ({
                        userId,
                        messageId: savedMessage.messageId,
                        name: h.name,
                        value: h.value,
                    }));
                    await manager.upsert(HeaderEntity, headerPartials, ['userId', 'messageId', 'name']);
                }

                // Recursively save parts
                if (messageData.payload.parts && messageData.payload.parts.length > 0) {
                    await this.savePartsInTransaction(
                        manager,
                        userId,
                        savedMessage.messageId,
                        messageData.payload.parts
                    );
                } else if (messageData.payload.body || messageData.payload.mimeType) {
                    // Single part message - save the payload itself as a part
                    await this.savePartsInTransaction(manager, userId, savedMessage.messageId, [messageData.payload]);
                }
            }

            return savedMessage;
        });
    }

    protected async savePartsInTransaction(
        manager: EntityManager,
        userId: number,
        messageId: string,
        parts: gmail_v1.Schema$MessagePart[],
        parentPart?: MessagePartEntity
    ): Promise<void> {
        for (const partData of parts) {
            // 1. Check if the part already exists
            let partEntity = await manager.findOne(MessagePartEntity, {
                where: {
                    userId,
                    messageId,
                    partId: partData.partId || '',
                },
            });

            // 2. If it doesn't exist, create a new one
            if (!partEntity) {
                partEntity = new MessagePartEntity();
            }

            // 3. Populate/update the entity's data
            partEntity.userId = userId;
            partEntity.messageId = messageId;
            partEntity.partId = partData.partId || '';
            partEntity.mimeType = partData.mimeType || '';
            partEntity.filename = partData.filename || null;
            partEntity.body = partData.body?.data || null;
            partEntity.sizeEstimate = partData.body?.size || null;
            if (parentPart) {
                partEntity.parentPart = parentPart;
            }

            // 4. Save the entity. `save` will handle inserts, updates, and tree relationships.
            const savedPart = await manager.save(partEntity);

            // 5. Recurse for child parts
            if (partData.parts && partData.parts.length > 0) {
                await this.savePartsInTransaction(manager, userId, messageId, partData.parts, savedPart);
            }
        }
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
