import type { MigrationInterface, QueryRunner } from 'typeorm';

export class BetterIndexes1764282386557 implements MigrationInterface {
    name = 'BetterIndexes1764282386557';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DROP INDEX "public"."message_labels_message_id_label_id"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."message_parts_message_id_part_id"
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "message_labels_user_id_message_id_label_id" ON "message_labels" ("user_id", "message_id", "label_id")
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "message_parts_user_id_message_id_part_id" ON "message_parts" ("user_id", "message_id", "part_id")
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DROP INDEX "public"."message_parts_user_id_message_id_part_id"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."message_labels_user_id_message_id_label_id"
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "message_parts_message_id_part_id" ON "message_parts" ("message_id", "part_id")
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "message_labels_message_id_label_id" ON "message_labels" ("message_id", "label_id")
        `);
    }
}
