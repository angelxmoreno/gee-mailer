import { UserEntity } from '@app/database/entities';
import { BaseRepositoryService } from '@app/modules/typeorm/BaseRepositoryService';
import { inject, singleton } from 'tsyringe';
import { DataSource } from 'typeorm';

export interface SaveUserTokensData {
    googleUid: string;
    name: string;
    email: string;
    accessToken: string;
    refreshToken?: string;
    tokenExpiryDate?: Date;
}

@singleton()
export class UsersRepository extends BaseRepositoryService<UserEntity> {
    constructor(@inject(DataSource) dataSource: DataSource) {
        super(dataSource, UserEntity);
    }

    async saveUserWithTokens(data: SaveUserTokensData): Promise<UserEntity> {
        // Check if user already exists by email or googleUid
        let user = await this.repository.findOne({
            where: [{ email: data.email }, { googleUid: data.googleUid }],
        });

        if (user) {
            // Update existing user
            Object.assign(user, {
                name: data.name,
                email: data.email,
                googleUid: data.googleUid,
                accessToken: data.accessToken,
                refreshToken: data.refreshToken || user.refreshToken,
                tokenExpiryDate: data.tokenExpiryDate || null,
            });
        } else {
            // Create new user
            user = this.repository.create({
                name: data.name,
                email: data.email,
                googleUid: data.googleUid,
                accessToken: data.accessToken,
                refreshToken: data.refreshToken || null,
                tokenExpiryDate: data.tokenExpiryDate || null,
            });
        }

        return this.repository.save(user);
    }

    async findByGoogleUid(googleUid: string): Promise<UserEntity | null> {
        return this.repository.findOne({ where: { googleUid } });
    }

    async findByEmail(email: string): Promise<UserEntity | null> {
        return this.repository.findOne({ where: { email } });
    }
}
