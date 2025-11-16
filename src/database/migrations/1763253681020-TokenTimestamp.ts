import type { MigrationInterface, QueryRunner } from 'typeorm';

export class TokenTimestamp1763253681020 implements MigrationInterface {
    name = 'TokenTimestamp1763253681020';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "users" DROP COLUMN "token_expiry_date"
        `);
        await queryRunner.query(`
            ALTER TABLE "users"
            ADD "token_expiry_date" TIMESTAMP
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "users" DROP COLUMN "token_expiry_date"
        `);
        await queryRunner.query(`
            ALTER TABLE "users"
            ADD "token_expiry_date" date
        `);
    }
}
