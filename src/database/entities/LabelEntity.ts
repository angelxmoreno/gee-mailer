import { UserEntity } from '@app/database/entities/UserEntity.ts';
import { AppEntity } from '@app/modules/typeorm/AppEntity.ts';
import { Column, Entity, Index, JoinColumn, ManyToOne, type Relation } from 'typeorm';

@Entity()
// Unique constraint for labelId + userId combination
@Index(['labelId', 'userId'], { unique: true })
export class LabelEntity extends AppEntity {
    @Column()
    labelId: string; // Gmail label ID

    @Column()
    userId: number; // FK to user - one label belongs to one user

    @Column()
    name: string;

    @Column({ type: 'enum', enum: ['system', 'user'] })
    type: 'system' | 'user';

    @Column({ nullable: true })
    color: string;

    @Column({ default: true })
    labelListVisibility: boolean;

    @Column({ default: true })
    messageListVisibility: boolean;

    @Column({ default: 0 })
    messagesTotal: number;

    @Column({ default: 0 })
    messagesUnread: number;

    @Column({ default: 0 })
    threadsTotal: number;

    @Column({ default: 0 })
    threadsUnread: number;

    // Relationship to user
    @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'user_id' })
    user: Relation<UserEntity>;
}
