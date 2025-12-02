import { AppEntity } from '@app/modules/typeorm/AppEntity';
import { Column, Entity, Index, JoinColumn, ManyToOne, type Relation, Tree, TreeChildren, TreeParent } from 'typeorm';
import { EmailMessageEntity } from './EmailMessageEntity';

@Entity()
@Tree('closure-table')
@Index(['userId', 'messageId', 'partId'], { unique: true })
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

    @TreeParent({ onDelete: 'CASCADE' })
    parentPart?: Relation<MessagePartEntity> | null;

    @TreeChildren()
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

    @Column({ type: 'varchar', length: 100, nullable: true })
    gmailAttachmentId?: string | null; // Gmail's attachment ID from body.attachmentId
}
