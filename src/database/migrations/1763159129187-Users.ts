import type { MigrationInterface, QueryRunner } from 'typeorm';

export class Users1763159129187 implements MigrationInterface {
    name = 'Users1763159129187';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "users" (
                "id" SERIAL NOT NULL,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                "deleted_at" TIMESTAMP,
                "name" character varying(50) NOT NULL,
                "email" character varying(200) NOT NULL,
                "google_uid" character varying(200) NOT NULL,
                CONSTRAINT "users_id_pk" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "users_created_at" ON "users" ("created_at")
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "users_email" ON "users" ("email")
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "users_google_uid" ON "users" ("google_uid")
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DROP INDEX "public"."users_google_uid"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."users_email"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."users_created_at"
        `);
        await queryRunner.query(`
            DROP TABLE "users"
        `);
    }
}
