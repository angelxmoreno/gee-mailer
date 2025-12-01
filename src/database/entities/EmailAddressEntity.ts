import { AppEntity } from '@app/modules/typeorm/AppEntity.ts';
import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany, type Relation } from 'typeorm';
import { DisplayNameEntity } from './DisplayNameEntity';
import { EmailAddressUsageEntity } from './EmailAddressUsageEntity';
import { EmailContactEntity } from './EmailContactEntity';

@Entity()
@Index(['userId', 'emailAddress'], { unique: true })
export class EmailAddressEntity extends AppEntity {
    @Column()
    userId: number; // For efficient querying

    @Column()
    emailAddress: string; // The actual email address (john@example.com)

    @Column({ nullable: true, default: null })
    usageCount?: number | null; // Computed field - DO NOT update manually

    @Column({ nullable: true, default: null })
    lastSeenDate?: Date | null; // Computed field - DO NOT update manually

    @Column({ default: false })
    isPrimary: boolean; // Is this the primary address for the contact?

    @Column({ nullable: true, default: null })
    contactId?: number | null; // FK to EmailContactEntity (nullable for orphaned addresses)

    // Relationships
    @ManyToOne(
        () => EmailContactEntity,
        (contact) => contact.emailAddresses,
        {
            onDelete: 'SET NULL',
        }
    )
    @JoinColumn({ name: 'contact_id' })
    contact?: Relation<EmailContactEntity>;

    @OneToMany(
        () => DisplayNameEntity,
        (displayName) => displayName.emailAddress
    )
    displayNames: Relation<DisplayNameEntity[]>;

    @OneToMany(
        () => EmailAddressUsageEntity,
        (usage) => usage.emailAddress
    )
    usages: Relation<EmailAddressUsageEntity[]>;
}
