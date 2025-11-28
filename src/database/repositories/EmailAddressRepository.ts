import { EmailAddressEntity } from '@app/database/entities/EmailAddressEntity.ts';
import { BaseRepositoryService } from '@app/modules/typeorm/BaseRepositoryService';
import { inject, singleton } from 'tsyringe';
import { DataSource, IsNull } from 'typeorm';

@singleton()
export class EmailAddressRepository extends BaseRepositoryService<EmailAddressEntity> {
    constructor(@inject(DataSource) dataSource: DataSource) {
        super(dataSource, EmailAddressEntity);
    }

    /**
     * Find or create an email address
     */
    async findOrCreate(userId: number, emailAddress: string): Promise<EmailAddressEntity> {
        let address = await this.repository.findOne({
            where: { userId, emailAddress },
        });

        if (!address) {
            address = await this.repository.save({
                userId,
                emailAddress,
                isPrimary: false,
                usageCount: null, // Will be computed via hooks
                lastSeenDate: null, // Will be computed via hooks
                contactId: null,
            });
        }

        return address;
    }

    /**
     * Find email address with relations
     */
    async findWithRelations(userId: number, emailAddress: string): Promise<EmailAddressEntity | null> {
        return this.repository.findOne({
            where: { userId, emailAddress },
            relations: ['contact', 'displayNames'],
        });
    }

    /**
     * Get all email addresses for a contact
     */
    async findByContactId(contactId: number): Promise<EmailAddressEntity[]> {
        return this.repository.find({
            where: { contactId },
            order: { isPrimary: 'DESC', usageCount: 'DESC' },
        });
    }

    /**
     * Update contact association
     */
    async updateContactId(emailAddressId: number, contactId: number, isPrimary: boolean = false): Promise<void> {
        await this.repository.update(emailAddressId, {
            contactId,
            isPrimary,
        });
    }

    /**
     * Find orphaned email addresses (no contact)
     */
    async findOrphaned(userId: number, limit: number = 100): Promise<EmailAddressEntity[]> {
        return this.repository.find({
            where: { userId, contactId: IsNull() },
            take: limit,
            order: { usageCount: 'DESC' },
        });
    }
}
