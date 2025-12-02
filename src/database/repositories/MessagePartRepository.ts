import { MessagePartEntity } from '@app/database/entities';
import { BaseRepositoryService } from '@app/modules/typeorm/BaseRepositoryService';
import type { gmail_v1 } from 'googleapis';
import { inject, singleton } from 'tsyringe';
import { DataSource } from 'typeorm';

@singleton()
export class MessagePartRepository extends BaseRepositoryService<MessagePartEntity> {
    constructor(@inject(DataSource) dataSource: DataSource) {
        super(dataSource, MessagePartEntity);
    }

    /**
     * Find all parts for a specific message with hierarchy
     */
    async findByMessageId(userId: number, messageId: string): Promise<MessagePartEntity[]> {
        return this.repository.find({
            where: { userId, messageId },
            relations: ['childParts'],
            order: { partId: 'ASC' },
        });
    }

    /**
     * Find root parts (no parent) for a message
     */
    async findRootPartsByMessageId(userId: number, messageId: string): Promise<MessagePartEntity[]> {
        return this.repository
            .createQueryBuilder('part')
            .where('part.userId = :userId', { userId })
            .andWhere('part.messageId = :messageId', { messageId })
            .andWhere('part.parentId IS NULL')
            .leftJoinAndSelect('part.childParts', 'childParts')
            .orderBy('part.partId', 'ASC')
            .getMany();
    }

    /**
     * Find attachments for a message (parts with filenames)
     */
    async findAttachmentsByMessageId(userId: number, messageId: string): Promise<MessagePartEntity[]> {
        return this.repository
            .createQueryBuilder('part')
            .where('part.userId = :userId', { userId })
            .andWhere('part.messageId = :messageId', { messageId })
            .andWhere('part.filename IS NOT NULL')
            .andWhere('part.filename != :empty', { empty: '' })
            .orderBy('part.filename', 'ASC')
            .getMany();
    }

    /**
     * Find parts by MIME type for a message
     */
    async findByMessageIdAndMimeType(
        userId: number,
        messageId: string,
        mimeType: string
    ): Promise<MessagePartEntity[]> {
        return this.repository.find({
            where: { userId, messageId, mimeType },
            order: { partId: 'ASC' },
        });
    }

    /**
     * Find text content parts (text/plain, text/html)
     */
    async findTextPartsByMessageId(userId: number, messageId: string): Promise<MessagePartEntity[]> {
        return this.repository
            .createQueryBuilder('part')
            .where('part.userId = :userId', { userId })
            .andWhere('part.messageId = :messageId', { messageId })
            .andWhere('part.mimeType LIKE :textType', { textType: 'text/%' })
            .orderBy('part.partId', 'ASC')
            .getMany();
    }

    /**
     * Recursively build and save message parts hierarchy
     */
    async savePartsForMessage(
        userId: number,
        messageId: string,
        parts: gmail_v1.Schema$MessagePart[],
        parentPart?: MessagePartEntity
    ): Promise<MessagePartEntity[]> {
        const savedParts: MessagePartEntity[] = [];

        for (const part of parts) {
            const entity = new MessagePartEntity();
            entity.userId = userId;
            entity.messageId = messageId;
            entity.partId = part.partId || '';
            if (parentPart) {
                entity.parentPart = parentPart;
            }
            entity.mimeType = part.mimeType || '';
            entity.filename = part.filename || null;
            entity.body = part.body?.data || null;
            entity.sizeEstimate = part.body?.size || null;

            const savedPart = await this.repository.save(entity);
            savedParts.push(savedPart);

            // Recursively save child parts
            if (part.parts && part.parts.length > 0) {
                const childParts = await this.savePartsForMessage(userId, messageId, part.parts, savedPart);
                savedParts.push(...childParts);
            }
        }

        return savedParts;
    }
}
