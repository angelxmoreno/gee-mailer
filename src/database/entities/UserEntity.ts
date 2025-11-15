import { AppEntity } from '@app/modules/typeorm/AppEntity';
import { Column, Entity, Index } from 'typeorm';

@Entity()
export class UserEntity extends AppEntity {
    @Column({ type: 'varchar', length: 50, nullable: false })
    name: string;

    @Column({ type: 'varchar', length: 200, nullable: false })
    @Index({ unique: true })
    email: string;

    @Column({ type: 'varchar', length: 200, nullable: true })
    @Index({ unique: true })
    googleUid?: string | null;

    @Column({ type: 'text', nullable: true })
    accessToken?: string | null;

    @Column({ type: 'text', nullable: true })
    refreshToken?: string | null;

    @Column({ type: 'date', nullable: true })
    tokenExpiryDate: Date | null;
}
