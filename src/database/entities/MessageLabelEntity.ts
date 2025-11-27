import { EmailMessageEntity } from '@app/database/entities/EmailMessageEntity.ts';
import { LabelEntity } from '@app/database/entities/LabelEntity.ts';
import { AppEntity } from '@app/modules/typeorm/AppEntity.ts';
import { Column, Entity, Index, JoinColumn, ManyToOne, type Relation } from 'typeorm';

@Entity()
@Index(['messageId', 'labelId'], { unique: true })
export class MessageLabelEntity extends AppEntity {
    @Column({ name: 'message_id' })
    messageId: number; // FK to EmailMessageEntity.id

    @Column({ name: 'label_id' })
    labelId: number; // FK to LabelEntity.id

    @Column({ name: 'user_id' })
    userId: number; // FK to UserEntity.id

    // Relationships
    @ManyToOne(() => EmailMessageEntity, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'message_id' })
    message: Relation<EmailMessageEntity>;

    @ManyToOne(() => LabelEntity, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'label_id' })
    label: Relation<LabelEntity>;
}
