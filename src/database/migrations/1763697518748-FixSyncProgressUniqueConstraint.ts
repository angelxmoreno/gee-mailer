import type { MigrationInterface, QueryRunner } from 'typeorm';

export class FixSyncProgressUniqueConstraint1763697518748 implements MigrationInterface {
    name = 'FixSyncProgressUniqueConstraint1763697518748';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DROP INDEX "public"."sync_progresses_user_id"
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "sync_progresses_user_id_sync_type" ON "sync_progresses" ("user_id", "sync_type")
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DROP INDEX "public"."sync_progresses_user_id_sync_type"
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "sync_progresses_user_id" ON "sync_progresses" ("user_id")
        `);
    }
}
