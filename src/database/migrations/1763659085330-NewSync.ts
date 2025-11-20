import type { MigrationInterface, QueryRunner } from 'typeorm';

export class NewSync1763659085330 implements MigrationInterface {
    name = 'NewSync1763659085330';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TYPE "public"."labels_type_enum" AS ENUM('system', 'user')
        `);
        await queryRunner.query(`
            CREATE TABLE "labels" (
                "id" SERIAL NOT NULL,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                "deleted_at" TIMESTAMP,
                "label_id" character varying NOT NULL,
                "user_id" integer NOT NULL,
                "name" character varying NOT NULL,
                "type" "public"."labels_type_enum" NOT NULL,
                "color" character varying,
                "label_list_visibility" boolean NOT NULL DEFAULT true,
                "message_list_visibility" boolean NOT NULL DEFAULT true,
                "messages_total" integer NOT NULL DEFAULT '0',
                "messages_unread" integer NOT NULL DEFAULT '0',
                "threads_total" integer NOT NULL DEFAULT '0',
                "threads_unread" integer NOT NULL DEFAULT '0',
                CONSTRAINT "labels_label_id_unique" UNIQUE ("label_id"),
                CONSTRAINT "labels_id_pk" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "labels_created_at" ON "labels" ("created_at")
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "labels_label_id_user_id" ON "labels" ("label_id", "user_id")
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."sync_progresses_sync_type_enum" AS ENUM('initial', 'incremental', 'labels')
        `);
        await queryRunner.query(`
            ALTER TABLE "sync_progresses"
            ADD "sync_type" "public"."sync_progresses_sync_type_enum" NOT NULL DEFAULT 'initial'
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."sync_progresses_status_enum" AS ENUM('pending', 'in_progress', 'completed', 'failed')
        `);
        await queryRunner.query(`
            ALTER TABLE "sync_progresses"
            ADD "status" "public"."sync_progresses_status_enum" NOT NULL DEFAULT 'pending'
        `);
        await queryRunner.query(`
            ALTER TABLE "sync_progresses"
            ADD "batches_total" integer NOT NULL DEFAULT '0'
        `);
        await queryRunner.query(`
            ALTER TABLE "sync_progresses"
            ADD "batches_completed" integer NOT NULL DEFAULT '0'
        `);
        await queryRunner.query(`
            ALTER TABLE "sync_progresses"
            ADD "error_message" text
        `);
        await queryRunner.query(`
            ALTER TABLE "sync_progresses"
            ADD "started_at" TIMESTAMP
        `);
        await queryRunner.query(`
            ALTER TABLE "sync_progresses"
            ADD "completed_at" TIMESTAMP
        `);
        await queryRunner.query(`
            ALTER TABLE "users"
            ADD "history_id" character varying
        `);
        await queryRunner.query(`
            ALTER TABLE "users"
            ADD "initial_sync_completed" boolean NOT NULL DEFAULT false
        `);
        await queryRunner.query(`
            ALTER TABLE "users"
            ADD "label_sync_completed" boolean NOT NULL DEFAULT false
        `);
        await queryRunner.query(`
            ALTER TABLE "users"
            ADD "last_full_sync_at" TIMESTAMP
        `);
        await queryRunner.query(`
            ALTER TABLE "users"
            ADD "last_incremental_sync_at" TIMESTAMP
        `);
        await queryRunner.query(`
            CREATE INDEX "email_messages_user_id_internal_date" ON "email_messages" ("user_id", "internal_date")
        `);
        await queryRunner.query(`
            ALTER TABLE "labels"
            ADD CONSTRAINT "labels_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "labels" DROP CONSTRAINT "labels_user_id_fk"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."email_messages_user_id_internal_date"
        `);
        await queryRunner.query(`
            ALTER TABLE "users" DROP COLUMN "last_incremental_sync_at"
        `);
        await queryRunner.query(`
            ALTER TABLE "users" DROP COLUMN "last_full_sync_at"
        `);
        await queryRunner.query(`
            ALTER TABLE "users" DROP COLUMN "label_sync_completed"
        `);
        await queryRunner.query(`
            ALTER TABLE "users" DROP COLUMN "initial_sync_completed"
        `);
        await queryRunner.query(`
            ALTER TABLE "users" DROP COLUMN "history_id"
        `);
        await queryRunner.query(`
            ALTER TABLE "sync_progresses" DROP COLUMN "completed_at"
        `);
        await queryRunner.query(`
            ALTER TABLE "sync_progresses" DROP COLUMN "started_at"
        `);
        await queryRunner.query(`
            ALTER TABLE "sync_progresses" DROP COLUMN "error_message"
        `);
        await queryRunner.query(`
            ALTER TABLE "sync_progresses" DROP COLUMN "batches_completed"
        `);
        await queryRunner.query(`
            ALTER TABLE "sync_progresses" DROP COLUMN "batches_total"
        `);
        await queryRunner.query(`
            ALTER TABLE "sync_progresses" DROP COLUMN "status"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."sync_progresses_status_enum"
        `);
        await queryRunner.query(`
            ALTER TABLE "sync_progresses" DROP COLUMN "sync_type"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."sync_progresses_sync_type_enum"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."labels_label_id_user_id"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."labels_created_at"
        `);
        await queryRunner.query(`
            DROP TABLE "labels"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."labels_type_enum"
        `);
    }
}
