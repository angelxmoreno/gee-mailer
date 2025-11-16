import type { MigrationInterface, QueryRunner } from 'typeorm';

export class ExtendedMessage1763304057870 implements MigrationInterface {
    name = 'ExtendedMessage1763304057870';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "headers" (
                "id" SERIAL NOT NULL,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                "deleted_at" TIMESTAMP,
                "user_id" integer NOT NULL,
                "message_id" character varying(64) NOT NULL,
                "name" character varying(200) NOT NULL,
                "value" text,
                CONSTRAINT "headers_id_pk" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "headers_created_at" ON "headers" ("created_at")
        `);
        await queryRunner.query(`
            CREATE INDEX "headers_user_id" ON "headers" ("user_id")
        `);
        await queryRunner.query(`
            CREATE INDEX "headers_message_id" ON "headers" ("message_id")
        `);
        await queryRunner.query(`
            CREATE INDEX "headers_name" ON "headers" ("name")
        `);
        await queryRunner.query(`
            CREATE INDEX "headers_user_id_name" ON "headers" ("user_id", "name")
        `);
        await queryRunner.query(`
            CREATE INDEX "headers_message_id_name" ON "headers" ("message_id", "name")
        `);
        await queryRunner.query(`
            CREATE TABLE "message_parts" (
                "id" SERIAL NOT NULL,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                "deleted_at" TIMESTAMP,
                "user_id" integer NOT NULL,
                "message_id" character varying(64) NOT NULL,
                "part_id" character varying(50) NOT NULL,
                "parent_id" integer,
                "mime_type" character varying(200) NOT NULL,
                "filename" character varying(500),
                "body" text,
                "size_estimate" integer,
                "parent_part_id" integer,
                CONSTRAINT "message_parts_id_pk" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "message_parts_created_at" ON "message_parts" ("created_at")
        `);
        await queryRunner.query(`
            CREATE INDEX "message_parts_user_id" ON "message_parts" ("user_id")
        `);
        await queryRunner.query(`
            CREATE INDEX "message_parts_message_id" ON "message_parts" ("message_id")
        `);
        await queryRunner.query(`
            CREATE INDEX "message_parts_parent_id" ON "message_parts" ("parent_id")
        `);
        await queryRunner.query(`
            CREATE INDEX "message_parts_mime_type" ON "message_parts" ("mime_type")
        `);
        await queryRunner.query(`
            CREATE INDEX "message_parts_user_id_mime_type" ON "message_parts" ("user_id", "mime_type")
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "message_parts_message_id_part_id" ON "message_parts" ("message_id", "part_id")
        `);
        await queryRunner.query(`
            ALTER TABLE "headers"
            ADD CONSTRAINT "headers_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "email_messages"("message_id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "message_parts"
            ADD CONSTRAINT "message_parts_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "email_messages"("message_id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "message_parts"
            ADD CONSTRAINT "message_parts_parent_part_id_fk" FOREIGN KEY ("parent_part_id") REFERENCES "message_parts"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "message_parts" DROP CONSTRAINT "message_parts_parent_part_id_fk"
        `);
        await queryRunner.query(`
            ALTER TABLE "message_parts" DROP CONSTRAINT "message_parts_message_id_fk"
        `);
        await queryRunner.query(`
            ALTER TABLE "headers" DROP CONSTRAINT "headers_message_id_fk"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."message_parts_message_id_part_id"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."message_parts_user_id_mime_type"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."message_parts_mime_type"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."message_parts_parent_id"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."message_parts_message_id"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."message_parts_user_id"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."message_parts_created_at"
        `);
        await queryRunner.query(`
            DROP TABLE "message_parts"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."headers_message_id_name"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."headers_user_id_name"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."headers_name"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."headers_message_id"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."headers_user_id"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."headers_created_at"
        `);
        await queryRunner.query(`
            DROP TABLE "headers"
        `);
    }
}
