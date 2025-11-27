import type { MigrationInterface, QueryRunner } from 'typeorm';

export class LabelNames1764275960494 implements MigrationInterface {
    name = 'LabelNames1764275960494';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "message_labels" (
                "id" SERIAL NOT NULL,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                "deleted_at" TIMESTAMP,
                "message_id" integer NOT NULL,
                "label_id" integer NOT NULL,
                "user_id" integer NOT NULL,
                CONSTRAINT "message_labels_id_pk" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "message_labels_created_at" ON "message_labels" ("created_at")
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "message_labels_message_id_label_id" ON "message_labels" ("message_id", "label_id")
        `);
        await queryRunner.query(`
            ALTER TABLE "message_labels"
            ADD CONSTRAINT "message_labels_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "email_messages"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "message_labels"
            ADD CONSTRAINT "message_labels_label_id_fk" FOREIGN KEY ("label_id") REFERENCES "labels"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "message_labels" DROP CONSTRAINT "message_labels_label_id_fk"
        `);
        await queryRunner.query(`
            ALTER TABLE "message_labels" DROP CONSTRAINT "message_labels_message_id_fk"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."message_labels_message_id_label_id"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."message_labels_created_at"
        `);
        await queryRunner.query(`
            DROP TABLE "message_labels"
        `);
    }
}
