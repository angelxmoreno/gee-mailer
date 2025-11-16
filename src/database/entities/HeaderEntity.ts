import { AppEntity } from '@app/modules/typeorm/AppEntity';
import { Column, Entity, Index, JoinColumn, ManyToOne, type Relation } from 'typeorm';
import { EmailMessageEntity } from './EmailMessageEntity';

@Entity()
@Index(['messageId', 'name'])
@Index(['userId', 'name'])
export class HeaderEntity extends AppEntity {
    @Column({ type: 'int', nullable: false })
    @Index()
    userId: number;

    @Column({ type: 'varchar', length: 64, nullable: false })
    @Index()
    messageId: string;

    @ManyToOne(
        () => EmailMessageEntity,
        (message) => message.headers,
        { onDelete: 'CASCADE' }
    )
    @JoinColumn({ name: 'message_id', referencedColumnName: 'messageId' })
    message: Relation<EmailMessageEntity>;

    @Column({ type: 'varchar', length: 200, nullable: false })
    @Index()
    name: string;

    @Column({ type: 'text', nullable: true })
    value: string | null;
}
