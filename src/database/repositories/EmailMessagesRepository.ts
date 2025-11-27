import { EmailMessageEntity, HeaderEntity, MessagePartEntity } from '@app/database/entities';
import { BaseRepositoryService } from '@app/modules/typeorm/BaseRepositoryService';
import type { MessageData, MessageListResponse } from '@app/services/GmailService';
import { filterNullish } from '@app/utils/filterNullish';
import type { gmail_v1 } from 'googleapis';
import { inject, singleton } from 'tsyringe';
import { DataSource, type EntityManager, In, type ObjectLiteral } from 'typeorm';

export interface DetailedMessageData {
    entity: Partial<EmailMessageEntity>;
    headers: Array<Partial<HeaderEntity>>;
    parts: Array<Partial<MessagePartEntity>>;
}

@singleton()
export class EmailMessagesRepository extends BaseRepositoryService<EmailMessageEntity> {
    constructor(@inject(DataSource) dataSource: DataSource) {
        super(dataSource, EmailMessageEntity);
    }

    /**
     * 1. Convert Gmail API message to entity data
     */
    convertGmailMessageToEntity(userId: number, gmailMessage: MessageData): DetailedMessageData {
        if (!gmailMessage.id) {
            throw new Error('Message must have an ID');
        }

        // Create entity data
        const entity: Partial<EmailMessageEntity> = filterNullish({
            userId,
            messageId: gmailMessage.id,
            threadId: gmailMessage.threadId,
            labelIds: gmailMessage.labelIds,
            snippet: gmailMessage.snippet,
            historyId: gmailMessage.historyId,
            internalDate: gmailMessage.internalDate ? Number(gmailMessage.internalDate) : null,
            sizeEstimate: gmailMessage.sizeEstimate,
            payload: gmailMessage.payload,
            raw: gmailMessage.raw,
        });

        // Extract headers
        const headers: Array<Partial<HeaderEntity>> = [];
        if (gmailMessage.payload?.headers) {
            for (const header of gmailMessage.payload.headers) {
                if (header.name && header.value) {
                    headers.push({
                        userId,
                        messageId: gmailMessage.id,
                        name: header.name,
                        value: header.value,
                    });
                }
            }
        }

        // Extract parts
        const parts: Array<Partial<MessagePartEntity>> = [];
        if (gmailMessage.payload?.parts) {
            this.extractPartsRecursively(userId, gmailMessage.id, gmailMessage.payload.parts, parts);
        } else if (gmailMessage.payload?.body || gmailMessage.payload?.mimeType) {
            // Single part message - save the payload itself as a part
            this.extractPartsRecursively(userId, gmailMessage.id, [gmailMessage.payload], parts);
        }

        return { entity, headers, parts };
    }

    /**
     * Helper to recursively extract message parts
     */
    protected extractPartsRecursively(
        userId: number,
        messageId: string,
        parts: gmail_v1.Schema$MessagePart[],
        extractedParts: Array<Partial<MessagePartEntity>>
    ): void {
        for (const partData of parts) {
            const part: Partial<MessagePartEntity> = {
                userId,
                messageId,
                partId: partData.partId || '',
                mimeType: partData.mimeType || '',
                filename: partData.filename || null,
                body: partData.body?.data || null,
                sizeEstimate: partData.body?.size || null,
            };

            extractedParts.push(part);

            // Recurse for child parts - we'll handle hierarchy during save
            if (partData.parts && partData.parts.length > 0) {
                this.extractPartsRecursively(userId, messageId, partData.parts, extractedParts);
            }
        }
    }

    /**
     * 2. Save single message entity
     */
    async saveMessage(entity: Partial<EmailMessageEntity>): Promise<EmailMessageEntity> {
        return this.save(entity);
    }

    /**
     * 3. Bulk save simple message entities
     */
    async saveMessages(entities: Array<Partial<EmailMessageEntity>>): Promise<EmailMessageEntity[]> {
        if (!entities.length) {
            return [];
        }

        // Use upsert to handle duplicates
        await this.repository.upsert(entities as Parameters<typeof this.repository.upsert>[0], ['userId', 'messageId']);

        // Return the saved entities
        const messageIds = entities.map((e) => e.messageId).filter(Boolean) as string[];
        const userId = entities[0]?.userId;

        if (!userId) {
            return [];
        }

        return this.repository.find({
            where: {
                userId,
                messageId: messageIds.length === 1 ? messageIds[0] : In(messageIds),
            },
        });
    }

    /**
     * 4. Bulk save detailed messages with headers and parts
     */
    async saveDetailedMessages(detailedData: DetailedMessageData[]): Promise<EmailMessageEntity[]> {
        if (!detailedData.length) {
            return [];
        }

        return this.dataSource.transaction(async (manager) => {
            const savedMessages: EmailMessageEntity[] = [];

            for (const { entity, headers, parts } of detailedData) {
                // Save main message entity
                // biome-ignore lint/suspicious/noExplicitAny: TypeORM's `upsert` expects a `QueryDeepPartialEntity` which is not a public type.
                await manager.upsert(EmailMessageEntity, entity as any, ['userId', 'messageId']);

                const savedMessage = await manager.findOneByOrFail(EmailMessageEntity, {
                    userId: entity.userId,
                    messageId: entity.messageId,
                });

                // Save headers if any
                if (headers.length > 0) {
                    // biome-ignore lint/suspicious/noExplicitAny: TypeORM's `upsert` expects a `QueryDeepPartialEntity` which is not a public type.
                    await manager.upsert(HeaderEntity, headers as any, ['userId', 'messageId', 'name']);
                }

                // Save parts if any
                if (parts.length > 0) {
                    // For parts, we need to handle the hierarchy properly
                    await this.savePartsInTransaction(manager, parts);
                }

                savedMessages.push(savedMessage);
            }

            return savedMessages;
        });
    }

    /**
     * Helper to save message parts in transaction
     * Note: For now, we save parts without hierarchy.
     * Tree relationships can be established later if needed.
     */
    protected async savePartsInTransaction(
        manager: EntityManager,
        parts: Array<Partial<MessagePartEntity>>
    ): Promise<void> {
        // Save all parts using upsert
        for (const partData of parts) {
            // biome-ignore lint/suspicious/noExplicitAny: TypeORM's `upsert` expects a `QueryDeepPartialEntity` which is not a public type.
            await manager.upsert(MessagePartEntity, partData as any, ['userId', 'messageId', 'partId']);
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

    /**
     * Legacy method for saving message list from Gmail API
     */
    async saveMessageList(userId: number, messageList: MessageListResponse): Promise<ObjectLiteral[]> {
        if (!messageList.messages?.length) {
            return [];
        }

        const entities: Array<Partial<EmailMessageEntity>> = [];
        for (const message of messageList.messages) {
            if (message.id) {
                const { entity } = this.convertGmailMessageToEntity(userId, message);
                entities.push(entity);
            }
        }

        const { identifiers } = await this.repository.upsert(entities as Parameters<typeof this.repository.upsert>[0], [
            'userId',
            'messageId',
        ]);
        return identifiers;
    }
}
