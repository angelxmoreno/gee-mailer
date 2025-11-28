import { AppEntity } from '@app/modules/typeorm/AppEntity.ts';
import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany, type Relation } from 'typeorm';
import { DisplayNameEntity } from './DisplayNameEntity';
import { EmailAddressEntity } from './EmailAddressEntity';

@Entity()
@Index(['userId', 'primaryEmailAddressId'], { unique: true })
export class EmailContactEntity extends AppEntity {
    @Column()
    userId: number; // User who owns this contact

    @Column()
    primaryEmailAddressId: number; // FK to EmailAddressEntity

    @Column({ nullable: true })
    primaryDisplayNameId?: number | null; // FK to DisplayNameEntity (most common/recent)

    @Column({ nullable: true, default: null })
    emailCount?: number; // Computed field - updated via beforeSave hook

    @Column({ nullable: true, default: null })
    lastEmailDate?: Date | null; // Computed field - updated via beforeSave hook

    @Column({ default: 'header' })
    source: 'header' | 'google'; // Source of contact

    // Relationships
    @ManyToOne(() => EmailAddressEntity)
    @JoinColumn({ name: 'primary_email_address_id' })
    primaryEmailAddress: Relation<EmailAddressEntity>;

    @ManyToOne(() => DisplayNameEntity)
    @JoinColumn({ name: 'primary_display_name_id' })
    primaryDisplayName?: Relation<DisplayNameEntity>;

    @OneToMany(
        () => EmailAddressEntity,
        (address) => address.contact
    )
    emailAddresses: Relation<EmailAddressEntity[]>;
}
