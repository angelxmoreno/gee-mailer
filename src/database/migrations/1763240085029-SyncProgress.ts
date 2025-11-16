import type { MigrationInterface, QueryRunner } from 'typeorm';

export class SyncProgress1763240085029 implements MigrationInterface {
    name = 'SyncProgress1763240085029';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "sync_progresses" (
                "id" SERIAL NOT NULL,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                "deleted_at" TIMESTAMP,
                "user_id" integer NOT NULL,
                "next_page_token" character varying(64),
                "num_processed" integer NOT NULL DEFAULT '0',
                "num_total" integer NOT NULL DEFAULT '0',
                CONSTRAINT "sync_progresses_id_pk" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "sync_progresses_created_at" ON "sync_progresses" ("created_at")
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "sync_progresses_user_id" ON "sync_progresses" ("user_id")
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DROP INDEX "public"."sync_progresses_user_id"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."sync_progresses_created_at"
        `);
        await queryRunner.query(`
            DROP TABLE "sync_progresses"
        `);
    }
}
