import type { MigrationInterface, QueryRunner } from 'typeorm';

export class MessagePartEntityonDeleteCASCADE1763319969593 implements MigrationInterface {
    name = 'MessagePartEntityonDeleteCASCADE1763319969593';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "message_parts" DROP CONSTRAINT "message_parts_parent_part_id_fk"
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
            ALTER TABLE "message_parts"
            ADD CONSTRAINT "message_parts_parent_part_id_fk" FOREIGN KEY ("parent_part_id") REFERENCES "message_parts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    }
}
