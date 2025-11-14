import { AppEntity } from '@app/modules/typeorm/AppEntity';
import { Column, Entity, Index } from 'typeorm';

@Entity()
export class UserEntity extends AppEntity {
    @Column({ type: 'varchar', length: 50, nullable: false })
    name: string;

    @Column({ type: 'varchar', length: 200, nullable: false })
    @Index({ unique: true })
    email: string;

    @Column({ type: 'varchar', length: 200, nullable: false })
    @Index({ unique: true })
    googleUid: string;
}
