import type { MigrationInterface, QueryRunner } from 'typeorm';

export class EmailMessagesIndex1763265257682 implements MigrationInterface {
    name = 'EmailMessagesIndex1763265257682';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE UNIQUE INDEX "email_messages_user_id_message_id" ON "email_messages" ("user_id", "message_id")
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DROP INDEX "public"."email_messages_user_id_message_id"
        `);
    }
}
