import { CreateDateColumn, DeleteDateColumn, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export abstract class AppEntity {
    @PrimaryGeneratedColumn('increment')
    id: number;

    @CreateDateColumn()
    @Index()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    @DeleteDateColumn()
    deletedAt?: Date | null;
}
