import { EmailMessageEntity } from '@app/database/entities/EmailMessageEntity.ts';
import { AppEntity } from '@app/modules/typeorm/AppEntity.ts';
import { Column, Entity, Index, JoinColumn, ManyToOne, type Relation } from 'typeorm';
import { DisplayNameEntity } from './DisplayNameEntity';
import { EmailAddressEntity } from './EmailAddressEntity';

@Entity()
@Index(['userId', 'emailAddressId', 'emailMessageId', 'headerType'], { unique: true })
export class EmailAddressUsageEntity extends AppEntity {
    @Column()
    userId: number; // For efficient querying

    @Column()
    emailAddressId: number; // FK to EmailAddressEntity

    @Column({ nullable: true, default: null })
    displayNameId?: number | null; // FK to DisplayNameEntity (what display name was used)

    @Column()
    emailMessageId: number; // FK to EmailMessageEntity

    @Column({ type: 'enum', enum: ['from', 'to', 'cc', 'bcc'] })
    headerType: 'from' | 'to' | 'cc' | 'bcc'; // Which header this address appeared in

    @Column()
    usedAt: Date; // When this usage occurred

    // Relationships
    @ManyToOne(
        () => EmailAddressEntity,
        (emailAddress) => emailAddress.usages,
        {
            onDelete: 'CASCADE',
        }
    )
    @JoinColumn({ name: 'email_address_id' })
    emailAddress: Relation<EmailAddressEntity>;

    @ManyToOne(
        () => DisplayNameEntity,
        (displayName) => displayName.usages,
        {
            onDelete: 'SET NULL',
        }
    )
    @JoinColumn({ name: 'display_name_id' })
    displayName?: Relation<DisplayNameEntity>;

    @ManyToOne(() => EmailMessageEntity, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'email_message_id' })
    emailMessage: Relation<EmailMessageEntity>;
}
