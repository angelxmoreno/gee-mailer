import { AppEntity } from '@app/modules/typeorm/AppEntity.ts';
import { Column, Entity, Index, OneToMany, type Relation } from 'typeorm';
import { HeaderEntity } from './HeaderEntity';
import { MessagePartEntity } from './MessagePartEntity';

@Entity()
@Index(['userId', 'messageId'], { unique: true })
export class EmailMessageEntity extends AppEntity {
    @Column({ type: 'varchar', length: 64 })
    @Index({ unique: true })
    messageId: string; // Gmail message ID (string, not number)

    @Column({ type: 'int', nullable: false })
    @Index()
    userId: number; // Gmail message ID (string, not number)

    @Column({ type: 'varchar', length: 64, nullable: true })
    @Index()
    threadId?: string | null;

    // Gmail labels (["INBOX", "STARRED", ...])
    @Column('simple-array', { nullable: true })
    labelIds?: string[] | null;

    @Column({ type: 'jsonb', nullable: true })
    classificationLabelValues?: unknown | null;

    // Excerpt from message body
    @Column({ type: 'text', nullable: true })
    snippet?: string | null;

    // Gmail provides this as a string too (int64)
    @Column({ type: 'varchar', length: 64, nullable: true })
    @Index()
    historyId?: string | null;

    // Epoch ms (int64), store as bigint
    @Column({ type: 'bigint', nullable: true })
    @Index()
    internalDate?: number | null;

    // Estimated message size
    @Column({ type: 'integer', nullable: true })
    sizeEstimate?: number | null;

    // Full MIME payload with headers, body, parts (MessagePart structure)
    @Column({ type: 'jsonb', nullable: true })
    payload?: unknown | null;

    // Optional RAW base64-URL body
    @Column({ type: 'text', nullable: true })
    raw?: string | null;

    // Relationships
    @OneToMany(
        () => HeaderEntity,
        (header) => header.message,
        { cascade: true }
    )
    headers: Relation<HeaderEntity[]>;

    @OneToMany(
        () => MessagePartEntity,
        (part) => part.message,
        { cascade: true }
    )
    messageParts: Relation<MessagePartEntity[]>;
}
