import { DisplayNameEntity } from '@app/database/entities/DisplayNameEntity.ts';
import { BaseRepositoryService } from '@app/modules/typeorm/BaseRepositoryService';
import { inject, singleton } from 'tsyringe';
import { DataSource } from 'typeorm';

@singleton()
export class DisplayNameRepository extends BaseRepositoryService<DisplayNameEntity> {
    constructor(@inject(DataSource) dataSource: DataSource) {
        super(dataSource, DisplayNameEntity);
    }

    /**
     * Find or create a display name for an email address
     */
    async findOrCreate(userId: number, emailAddressId: number, displayName: string): Promise<DisplayNameEntity> {
        let nameEntity = await this.repository.findOne({
            where: { userId, emailAddressId, displayName },
        });

        if (!nameEntity) {
            nameEntity = await this.repository.save({
                userId,
                emailAddressId,
                displayName,
                usageCount: null, // Will be computed via hooks
                firstSeenDate: new Date(),
                lastSeenDate: null, // Will be computed via hooks
            });
        }

        return nameEntity;
    }

    /**
     * Get all display names for an email address
     */
    async findByEmailAddress(emailAddressId: number): Promise<DisplayNameEntity[]> {
        return this.repository.find({
            where: { emailAddressId },
            order: { usageCount: 'DESC', lastSeenDate: 'DESC' },
        });
    }

    /**
     * Get most frequently used display name for an email address
     */
    async getMostUsed(emailAddressId: number): Promise<DisplayNameEntity | null> {
        return this.repository.findOne({
            where: { emailAddressId },
            order: { usageCount: 'DESC', lastSeenDate: 'DESC' },
        });
    }

    /**
     * Get recent display names for an email address
     */
    async getRecent(emailAddressId: number, limit: number = 5): Promise<DisplayNameEntity[]> {
        return this.repository.find({
            where: { emailAddressId },
            order: { lastSeenDate: 'DESC' },
            take: limit,
        });
    }

    /**
     * Find display names by pattern
     */
    async searchByName(userId: number, namePattern: string, limit: number = 20): Promise<DisplayNameEntity[]> {
        return this.repository
            .createQueryBuilder('displayName')
            .where('displayName.userId = :userId', { userId })
            .andWhere('displayName.displayName ILIKE :pattern', { pattern: `%${namePattern}%` })
            .orderBy('displayName.usageCount', 'DESC')
            .take(limit)
            .getMany();
    }
}
