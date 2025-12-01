import { AppEntity } from '@app/modules/typeorm/AppEntity.ts';
import { Column, Entity, Index, JoinColumn, ManyToOne, type Relation } from 'typeorm';
import { EmailMessageEntity } from './EmailMessageEntity';
import { MessagePartEntity } from './MessagePartEntity';

@Entity()
@Index(['userId', 'messageId', 'partId'], { unique: true })
@Index(['userId', 'mimeType'])
@Index(['userId', 'filename'])
export class AttachmentEntity extends AppEntity {
    @Column()
    @Index()
    userId: number; // For efficient querying

    @Column({ type: 'varchar', length: 64 })
    messageId: string; // Gmail message ID

    @Column({ type: 'varchar', length: 50 })
    partId: string; // Gmail part ID

    @Column({ type: 'varchar', length: 500 })
    filename: string; // Original filename

    @Column({ type: 'varchar', length: 200 })
    @Index()
    mimeType: string; // MIME type (image/jpeg, application/pdf, etc.)

    @Column()
    sizeBytes: number; // Size in bytes

    @Column({ type: 'varchar', length: 100, nullable: true, default: null })
    contentId?: string | null; // Content-ID for inline attachments

    @Column({ default: false })
    isInline: boolean; // Is this an inline attachment?

    @Column({ nullable: true, default: null })
    downloadUrl?: string | null; // MinIO/S3 URL after download

    @Column({ nullable: true, default: null })
    downloadedAt?: Date | null; // When was it downloaded locally

    @Column({ default: 'pending' })
    status: 'pending' | 'downloading' | 'downloaded' | 'failed'; // Download status

    @Column({ type: 'text', nullable: true, default: null })
    errorMessage?: string | null; // Error message if download failed

    // Relationships
    @ManyToOne(() => EmailMessageEntity, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'message_id', referencedColumnName: 'messageId' })
    message: Relation<EmailMessageEntity>;

    @ManyToOne(() => MessagePartEntity, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'part_id', referencedColumnName: 'partId' })
    messagePart: Relation<MessagePartEntity>;
}
