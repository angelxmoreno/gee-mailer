import { AppEntity } from '@app/modules/typeorm/AppEntity.ts';
import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany, type Relation } from 'typeorm';
import { EmailAddressEntity } from './EmailAddressEntity';
import { EmailAddressUsageEntity } from './EmailAddressUsageEntity';

@Entity()
@Index(['userId', 'emailAddressId', 'displayName'], { unique: true })
export class DisplayNameEntity extends AppEntity {
    @Column()
    userId: number; // For efficient querying

    @Column()
    emailAddressId: number; // FK to EmailAddressEntity

    @Column()
    displayName: string; // The display name ("John Doe", "John", "John D.", etc.)

    @Column({ nullable: true, default: null })
    usageCount?: number | null; // Computed field - DO NOT update manually

    @Column({ nullable: true, default: null })
    firstSeenDate?: Date | null; // When this display name was first seen

    @Column({ nullable: true, default: null })
    lastSeenDate?: Date | null; // Computed field - DO NOT update manually

    // Relationships
    @ManyToOne(
        () => EmailAddressEntity,
        (emailAddress) => emailAddress.displayNames,
        {
            onDelete: 'CASCADE',
        }
    )
    @JoinColumn({ name: 'email_address_id' })
    emailAddress: Relation<EmailAddressEntity>;

    @OneToMany(
        () => EmailAddressUsageEntity,
        (usage) => usage.displayName
    )
    usages: Relation<EmailAddressUsageEntity[]>;
}
