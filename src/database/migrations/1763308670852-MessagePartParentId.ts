import type { MigrationInterface, QueryRunner } from 'typeorm';

export class MessagePartParentId1763308670852 implements MigrationInterface {
    name = 'MessagePartParentId1763308670852';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "message_parts" DROP CONSTRAINT "message_parts_parent_part_id_fk"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."message_parts_parent_id"
        `);
        await queryRunner.query(`
            CREATE TABLE "message_parts_closure" (
                "id_ancestor" integer NOT NULL,
                "id_descendant" integer NOT NULL,
                CONSTRAINT "message_parts_closure_id_ancestor_id_descendant_pk" PRIMARY KEY ("id_ancestor", "id_descendant")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "message_parts_closure_id_ancestor" ON "message_parts_closure" ("id_ancestor")
        `);
        await queryRunner.query(`
            CREATE INDEX "message_parts_closure_id_descendant" ON "message_parts_closure" ("id_descendant")
        `);
        await queryRunner.query(`
            ALTER TABLE "message_parts" DROP COLUMN "parent_id"
        `);
        await queryRunner.query(`
            ALTER TABLE "message_parts"
            ADD CONSTRAINT "message_parts_parent_part_id_fk" FOREIGN KEY ("parent_part_id") REFERENCES "message_parts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "message_parts_closure"
            ADD CONSTRAINT "message_parts_closure_id_ancestor_fk" FOREIGN KEY ("id_ancestor") REFERENCES "message_parts"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "message_parts_closure"
            ADD CONSTRAINT "message_parts_closure_id_descendant_fk" FOREIGN KEY ("id_descendant") REFERENCES "message_parts"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "message_parts_closure" DROP CONSTRAINT "message_parts_closure_id_descendant_fk"
        `);
        await queryRunner.query(`
            ALTER TABLE "message_parts_closure" DROP CONSTRAINT "message_parts_closure_id_ancestor_fk"
        `);
        await queryRunner.query(`
            ALTER TABLE "message_parts" DROP CONSTRAINT "message_parts_parent_part_id_fk"
        `);
        await queryRunner.query(`
            ALTER TABLE "message_parts"
            ADD "parent_id" integer
        `);
        await queryRunner.query(`
            DROP INDEX "public"."message_parts_closure_id_descendant"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."message_parts_closure_id_ancestor"
        `);
        await queryRunner.query(`
            DROP TABLE "message_parts_closure"
        `);
        await queryRunner.query(`
            CREATE INDEX "message_parts_parent_id" ON "message_parts" ("parent_id")
        `);
        await queryRunner.query(`
            ALTER TABLE "message_parts"
            ADD CONSTRAINT "message_parts_parent_part_id_fk" FOREIGN KEY ("parent_part_id") REFERENCES "message_parts"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    }
}
