import type { MigrationInterface, QueryRunner } from 'typeorm';

export class HeaderIndex1764526147376 implements MigrationInterface {
    name = 'HeaderIndex1764526147376';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DROP INDEX "public"."email_address_usages_user_id_email_address_id_email_message_id"
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "email_address_usages_user_id_email_address_id_email_message_id_header_type" ON "email_address_usages" (
                "user_id",
                "email_address_id",
                "email_message_id",
                "header_type"
            )
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DROP INDEX "public"."email_address_usages_user_id_email_address_id_email_message_id_header_type"
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "email_address_usages_user_id_email_address_id_email_message_id" ON "email_address_usages" (
                "user_id",
                "email_address_id",
                "email_message_id"
            )
        `);
    }
}
