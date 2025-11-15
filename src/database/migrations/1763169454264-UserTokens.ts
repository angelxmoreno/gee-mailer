import type { MigrationInterface, QueryRunner } from 'typeorm';

export class UserTokens1763169454264 implements MigrationInterface {
    public async up(_queryRunner: QueryRunner): Promise<void> {}

    public async down(_queryRunner: QueryRunner): Promise<void> {}
}
