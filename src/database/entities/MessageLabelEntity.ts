import { EmailMessageEntity } from '@app/database/entities/EmailMessageEntity.ts';
import { LabelEntity } from '@app/database/entities/LabelEntity.ts';
import { AppEntity } from '@app/modules/typeorm/AppEntity.ts';
import { Column, Entity, Index, JoinColumn, ManyToOne, type Relation } from 'typeorm';

@Entity()
@Index(['messageId', 'labelId'], { unique: true })
export class MessageLabelEntity extends AppEntity {
    @Column()
    messageId: string; // Gmail message ID

    @Column()
    labelId: string; // Gmail label ID

    @Column()
    userId: number; // For efficient querying by user

    // Relationships
    @ManyToOne(() => EmailMessageEntity, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'message_id' })
    message: Relation<EmailMessageEntity>;

    @ManyToOne(() => LabelEntity, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'label_id' })
    label: Relation<LabelEntity>;
}
