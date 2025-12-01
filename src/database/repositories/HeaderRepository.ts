import { HeaderEntity } from '@app/database/entities';
import { BaseRepositoryService } from '@app/modules/typeorm/BaseRepositoryService';
import { inject, singleton } from 'tsyringe';
import { DataSource } from 'typeorm';

@singleton()
export class HeaderRepository extends BaseRepositoryService<HeaderEntity> {
    constructor(@inject(DataSource) dataSource: DataSource) {
        super(dataSource, HeaderEntity);
    }

    /**
     * Find headers for a specific message
     */
    async findByMessageId(userId: number, messageId: string): Promise<HeaderEntity[]> {
        return this.repository.find({
            where: { userId, messageId },
            order: { name: 'ASC' },
        });
    }

    /**
     * Find headers by message and header name
     */
    async findByMessageAndName(userId: number, messageId: string, name: string): Promise<HeaderEntity | null> {
        return this.repository.findOne({
            where: { userId, messageId, name },
        });
    }

    /**
     * Find headers by user and header name (useful for analytics)
     */
    async findByUserAndName(userId: number, name: string): Promise<HeaderEntity[]> {
        return this.repository.find({
            where: { userId, name },
            order: { createdAt: 'DESC' },
        });
    }

    /**
     * Bulk save headers for a message
     */
    async saveHeadersForMessage(
        userId: number,
        messageId: string,
        headers: Array<{ name: string; value: string | null }>
    ): Promise<HeaderEntity[]> {
        const headerEntities = headers.map((header) => {
            const entity = new HeaderEntity();
            entity.userId = userId;
            entity.messageId = messageId;
            entity.name = header.name;
            entity.value = header.value;
            return entity;
        });

        return this.repository.save(headerEntities);
    }
}
