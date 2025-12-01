import { EmailContactEntity } from '@app/database/entities/EmailContactEntity.ts';
import { BaseRepositoryService } from '@app/modules/typeorm/BaseRepositoryService';
import { inject, singleton } from 'tsyringe';
import { DataSource } from 'typeorm';

@singleton()
export class EmailContactRepository extends BaseRepositoryService<EmailContactEntity> {
    constructor(@inject(DataSource) dataSource: DataSource) {
        super(dataSource, EmailContactEntity);
    }

    /**
     * Find contact by any of their email addresses
     */
    async findByEmailAddress(userId: number, emailAddress: string): Promise<EmailContactEntity | null> {
        return this.repository
            .createQueryBuilder('contact')
            .innerJoin('contact.emailAddresses', 'address')
            .where('contact.userId = :userId', { userId })
            .andWhere('address.emailAddress = :emailAddress', { emailAddress })
            .getOne();
    }

    /**
     * Get top contacts by email count
     */
    async getTopContacts(userId: number, limit: number = 20): Promise<EmailContactEntity[]> {
        return this.repository.find({
            where: { userId },
            order: { emailCount: 'DESC' },
            take: limit,
            relations: ['primaryEmailAddress', 'primaryDisplayName'],
        });
    }

    /**
     * Find contact by primary email address ID
     */
    async findByPrimaryEmailAddress(userId: number, primaryEmailAddressId: number): Promise<EmailContactEntity | null> {
        return this.repository.findOne({
            where: { userId, primaryEmailAddressId },
            relations: ['primaryEmailAddress', 'primaryDisplayName'],
        });
    }

    /**
     * Create contact for an email address
     */
    async createForEmailAddress(
        userId: number,
        emailAddressId: number,
        primaryDisplayNameId?: number
    ): Promise<EmailContactEntity> {
        const entityToSave = {
            userId,
            primaryEmailAddressId: emailAddressId,
            primaryDisplayNameId: primaryDisplayNameId || undefined,
            source: 'header' as 'header' | 'google',
            emailCount: undefined,
            lastEmailDate: undefined,
        };

        return this.repository.save(entityToSave);
    }
}
