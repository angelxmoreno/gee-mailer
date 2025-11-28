import { EmailAddressUsageEntity } from '@app/database/entities/EmailAddressUsageEntity.ts';
import { BaseRepositoryService } from '@app/modules/typeorm/BaseRepositoryService';
import { inject, singleton } from 'tsyringe';
import { DataSource, MoreThan } from 'typeorm';

@singleton()
export class EmailAddressUsageRepository extends BaseRepositoryService<EmailAddressUsageEntity> {
    constructor(@inject(DataSource) dataSource: DataSource) {
        super(dataSource, EmailAddressUsageEntity);
    }

    /**
     * Create usage record
     */
    async createUsage(
        userId: number,
        emailAddressId: number,
        emailMessageId: number,
        headerType: 'from' | 'to' | 'cc' | 'bcc',
        displayNameId?: number,
        usedAt: Date = new Date()
    ): Promise<EmailAddressUsageEntity> {
        return this.repository.save({
            userId,
            emailAddressId,
            displayNameId,
            emailMessageId,
            headerType,
            usedAt,
        });
    }

    /**
     * Get usage statistics for an email address
     */
    async getUsageStats(emailAddressId: number): Promise<{
        totalUsage: number;
        fromCount: number;
        toCount: number;
        ccCount: number;
        bccCount: number;
        firstUsed: Date | null;
        lastUsed: Date | null;
    }> {
        const stats = await this.repository
            .createQueryBuilder('usage')
            .select([
                'COUNT(*) as total_usage',
                "COUNT(CASE WHEN usage.headerType = 'from' THEN 1 END) as from_count",
                "COUNT(CASE WHEN usage.headerType = 'to' THEN 1 END) as to_count",
                "COUNT(CASE WHEN usage.headerType = 'cc' THEN 1 END) as cc_count",
                "COUNT(CASE WHEN usage.headerType = 'bcc' THEN 1 END) as bcc_count",
                'MIN(usage.usedAt) as first_used',
                'MAX(usage.usedAt) as last_used',
            ])
            .where('usage.emailAddressId = :emailAddressId', { emailAddressId })
            .getRawOne();

        return {
            totalUsage: Number.parseInt(stats.total_usage, 10) || 0,
            fromCount: Number.parseInt(stats.from_count, 10) || 0,
            toCount: Number.parseInt(stats.to_count, 10) || 0,
            ccCount: Number.parseInt(stats.cc_count, 10) || 0,
            bccCount: Number.parseInt(stats.bcc_count, 10) || 0,
            firstUsed: stats.first_used || null,
            lastUsed: stats.last_used || null,
        };
    }

    /**
     * Get recent usage for an email address
     */
    async getRecentUsage(
        emailAddressId: number,
        days: number = 30,
        limit: number = 50
    ): Promise<EmailAddressUsageEntity[]> {
        const since = new Date();
        since.setDate(since.getDate() - days);

        return this.repository.find({
            where: {
                emailAddressId,
                usedAt: MoreThan(since),
            },
            order: { usedAt: 'DESC' },
            take: limit,
            relations: ['displayName', 'emailMessage'],
        });
    }

    /**
     * Get usage by header type
     */
    async getUsageByHeaderType(
        emailAddressId: number,
        headerType: 'from' | 'to' | 'cc' | 'bcc'
    ): Promise<EmailAddressUsageEntity[]> {
        return this.repository.find({
            where: { emailAddressId, headerType },
            order: { usedAt: 'DESC' },
            relations: ['displayName', 'emailMessage'],
        });
    }

    /**
     * Check if usage record already exists
     */
    async existsForMessage(userId: number, emailAddressId: number, emailMessageId: number): Promise<boolean> {
        const count = await this.repository.count({
            where: { userId, emailAddressId, emailMessageId },
        });
        return count > 0;
    }
}
