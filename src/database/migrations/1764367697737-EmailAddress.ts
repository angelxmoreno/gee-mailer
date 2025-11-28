import type { MigrationInterface, QueryRunner } from 'typeorm';

export class EmailAddress1764367697737 implements MigrationInterface {
    name = 'EmailAddress1764367697737';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TYPE "public"."email_address_usages_header_type_enum" AS ENUM('from', 'to', 'cc', 'bcc')
        `);
        await queryRunner.query(`
            CREATE TABLE "email_address_usages" (
                "id" SERIAL NOT NULL,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                "deleted_at" TIMESTAMP,
                "user_id" integer NOT NULL,
                "email_address_id" integer NOT NULL,
                "display_name_id" integer,
                "email_message_id" integer NOT NULL,
                "header_type" "public"."email_address_usages_header_type_enum" NOT NULL,
                "used_at" TIMESTAMP NOT NULL,
                CONSTRAINT "email_address_usages_id_pk" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "email_address_usages_created_at" ON "email_address_usages" ("created_at")
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "email_address_usages_user_id_email_address_id_email_message_id" ON "email_address_usages" (
                "user_id",
                "email_address_id",
                "email_message_id"
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "email_contacts" (
                "id" SERIAL NOT NULL,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                "deleted_at" TIMESTAMP,
                "user_id" integer NOT NULL,
                "primary_email_address_id" integer NOT NULL,
                "primary_display_name_id" integer,
                "email_count" integer,
                "last_email_date" TIMESTAMP,
                "source" character varying NOT NULL DEFAULT 'header',
                CONSTRAINT "email_contacts_id_pk" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "email_contacts_created_at" ON "email_contacts" ("created_at")
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "email_contacts_user_id_primary_email_address_id" ON "email_contacts" ("user_id", "primary_email_address_id")
        `);
        await queryRunner.query(`
            CREATE TABLE "email_addresses" (
                "id" SERIAL NOT NULL,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                "deleted_at" TIMESTAMP,
                "user_id" integer NOT NULL,
                "email_address" character varying NOT NULL,
                "usage_count" integer,
                "last_seen_date" TIMESTAMP,
                "is_primary" boolean NOT NULL DEFAULT false,
                "contact_id" integer,
                CONSTRAINT "email_addresses_id_pk" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "email_addresses_created_at" ON "email_addresses" ("created_at")
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "email_addresses_user_id_email_address" ON "email_addresses" ("user_id", "email_address")
        `);
        await queryRunner.query(`
            CREATE TABLE "display_names" (
                "id" SERIAL NOT NULL,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                "deleted_at" TIMESTAMP,
                "user_id" integer NOT NULL,
                "email_address_id" integer NOT NULL,
                "display_name" character varying NOT NULL,
                "usage_count" integer,
                "first_seen_date" TIMESTAMP,
                "last_seen_date" TIMESTAMP,
                CONSTRAINT "display_names_id_pk" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "display_names_created_at" ON "display_names" ("created_at")
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "display_names_user_id_email_address_id_display_name" ON "display_names" ("user_id", "email_address_id", "display_name")
        `);
        await queryRunner.query(`
            ALTER TABLE "email_address_usages"
            ADD CONSTRAINT "email_address_usages_email_address_id_fk" FOREIGN KEY ("email_address_id") REFERENCES "email_addresses"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "email_address_usages"
            ADD CONSTRAINT "email_address_usages_display_name_id_fk" FOREIGN KEY ("display_name_id") REFERENCES "display_names"("id") ON DELETE
            SET NULL ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "email_address_usages"
            ADD CONSTRAINT "email_address_usages_email_message_id_fk" FOREIGN KEY ("email_message_id") REFERENCES "email_messages"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "email_contacts"
            ADD CONSTRAINT "email_contacts_primary_email_address_id_fk" FOREIGN KEY ("primary_email_address_id") REFERENCES "email_addresses"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "email_contacts"
            ADD CONSTRAINT "email_contacts_primary_display_name_id_fk" FOREIGN KEY ("primary_display_name_id") REFERENCES "display_names"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "email_addresses"
            ADD CONSTRAINT "email_addresses_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "email_contacts"("id") ON DELETE
            SET NULL ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "display_names"
            ADD CONSTRAINT "display_names_email_address_id_fk" FOREIGN KEY ("email_address_id") REFERENCES "email_addresses"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "display_names" DROP CONSTRAINT "display_names_email_address_id_fk"
        `);
        await queryRunner.query(`
            ALTER TABLE "email_addresses" DROP CONSTRAINT "email_addresses_contact_id_fk"
        `);
        await queryRunner.query(`
            ALTER TABLE "email_contacts" DROP CONSTRAINT "email_contacts_primary_display_name_id_fk"
        `);
        await queryRunner.query(`
            ALTER TABLE "email_contacts" DROP CONSTRAINT "email_contacts_primary_email_address_id_fk"
        `);
        await queryRunner.query(`
            ALTER TABLE "email_address_usages" DROP CONSTRAINT "email_address_usages_email_message_id_fk"
        `);
        await queryRunner.query(`
            ALTER TABLE "email_address_usages" DROP CONSTRAINT "email_address_usages_display_name_id_fk"
        `);
        await queryRunner.query(`
            ALTER TABLE "email_address_usages" DROP CONSTRAINT "email_address_usages_email_address_id_fk"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."display_names_user_id_email_address_id_display_name"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."display_names_created_at"
        `);
        await queryRunner.query(`
            DROP TABLE "display_names"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."email_addresses_user_id_email_address"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."email_addresses_created_at"
        `);
        await queryRunner.query(`
            DROP TABLE "email_addresses"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."email_contacts_user_id_primary_email_address_id"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."email_contacts_created_at"
        `);
        await queryRunner.query(`
            DROP TABLE "email_contacts"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."email_address_usages_user_id_email_address_id_email_message_id"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."email_address_usages_created_at"
        `);
        await queryRunner.query(`
            DROP TABLE "email_address_usages"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."email_address_usages_header_type_enum"
        `);
    }
}
