import type { MigrationInterface, QueryRunner } from 'typeorm';

export class EmailMessages1763265138549 implements MigrationInterface {
    name = 'EmailMessages1763265138549';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "email_messages" (
                "id" SERIAL NOT NULL,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                "deleted_at" TIMESTAMP,
                "message_id" character varying(64) NOT NULL,
                "user_id" integer NOT NULL,
                "thread_id" character varying(64),
                "label_ids" text,
                "classification_label_values" jsonb,
                "snippet" text,
                "history_id" character varying(64),
                "internal_date" bigint,
                "size_estimate" integer,
                "payload" jsonb,
                "raw" text,
                CONSTRAINT "email_messages_id_pk" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "email_messages_created_at" ON "email_messages" ("created_at")
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "email_messages_message_id" ON "email_messages" ("message_id")
        `);
        await queryRunner.query(`
            CREATE INDEX "email_messages_user_id" ON "email_messages" ("user_id")
        `);
        await queryRunner.query(`
            CREATE INDEX "email_messages_thread_id" ON "email_messages" ("thread_id")
        `);
        await queryRunner.query(`
            CREATE INDEX "email_messages_history_id" ON "email_messages" ("history_id")
        `);
        await queryRunner.query(`
            CREATE INDEX "email_messages_internal_date" ON "email_messages" ("internal_date")
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DROP INDEX "public"."email_messages_internal_date"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."email_messages_history_id"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."email_messages_thread_id"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."email_messages_user_id"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."email_messages_message_id"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."email_messages_created_at"
        `);
        await queryRunner.query(`
            DROP TABLE "email_messages"
        `);
    }
}
