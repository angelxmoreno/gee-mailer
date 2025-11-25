import type { MigrationInterface, QueryRunner } from 'typeorm';

export class IndexFixes1764052277142 implements MigrationInterface {
    name = 'IndexFixes1764052277142';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DROP INDEX "public"."labels_label_id_user_id"
        `);
        await queryRunner.query(`
            ALTER TABLE "labels" DROP CONSTRAINT "labels_label_id_unique"
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "labels_label_id_user_id" ON "labels" ("label_id", "user_id")
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DROP INDEX "public"."labels_label_id_user_id"
        `);
        await queryRunner.query(`
            ALTER TABLE "labels"
            ADD CONSTRAINT "labels_label_id_unique" UNIQUE ("label_id")
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "labels_label_id_user_id" ON "labels" ("label_id", "user_id")
        `);
    }
}
