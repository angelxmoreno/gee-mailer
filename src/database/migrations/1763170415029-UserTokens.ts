import type { MigrationInterface, QueryRunner } from 'typeorm';

export class UserTokens1763170415029 implements MigrationInterface {
    name = 'UserTokens1763170415029';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "users"
            ADD "access_token" text
        `);
        await queryRunner.query(`
            ALTER TABLE "users"
            ADD "refresh_token" text
        `);
        await queryRunner.query(`
            ALTER TABLE "users"
            ADD "token_expiry_date" date
        `);
        await queryRunner.query(`
            ALTER TABLE "users"
            ALTER COLUMN "google_uid" DROP NOT NULL
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "users"
            ALTER COLUMN "google_uid"
            SET NOT NULL
        `);
        await queryRunner.query(`
            ALTER TABLE "users" DROP COLUMN "token_expiry_date"
        `);
        await queryRunner.query(`
            ALTER TABLE "users" DROP COLUMN "refresh_token"
        `);
        await queryRunner.query(`
            ALTER TABLE "users" DROP COLUMN "access_token"
        `);
    }
}
