import { AppEntity } from '@app/modules/typeorm/AppEntity';
import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany, type Relation } from 'typeorm';
import { EmailMessageEntity } from './EmailMessageEntity';

@Entity()
@Index(['messageId', 'partId'], { unique: true })
@Index(['userId', 'mimeType'])
export class MessagePartEntity extends AppEntity {
    @Column({ type: 'int', nullable: false })
    @Index()
    userId: number;

    @Column({ type: 'varchar', length: 64, nullable: false })
    @Index()
    messageId: string;

    @ManyToOne(
        () => EmailMessageEntity,
        (message) => message.messageParts,
        { onDelete: 'CASCADE' }
    )
    @JoinColumn({ name: 'message_id', referencedColumnName: 'messageId' })
    message: Relation<EmailMessageEntity>;

    @Column({ type: 'varchar', length: 50, nullable: false })
    partId: string;

    @Column({ type: 'int', nullable: true })
    @Index()
    parentId?: number | null;

    @ManyToOne(
        () => MessagePartEntity,
        (part) => part.childParts,
        { onDelete: 'CASCADE' }
    )
    parentPart?: Relation<MessagePartEntity> | null;

    @OneToMany(
        () => MessagePartEntity,
        (part) => part.parentPart
    )
    childParts: Relation<MessagePartEntity[]>;

    @Column({ type: 'varchar', length: 200, nullable: false })
    @Index()
    mimeType: string;

    @Column({ type: 'varchar', length: 500, nullable: true })
    filename?: string | null;

    @Column({ type: 'text', nullable: true })
    body?: string | null;

    @Column({ type: 'integer', nullable: true })
    sizeEstimate?: number | null;
}
