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
        // 1. Prioritize finding user by the unique and reliable googleUid
        let user = await this.findByGoogleUid(data.googleUid);

        if (user) {
            // User found by googleUid, update their info.
            // This is the most common and secure path.
            Object.assign(user, {
                name: data.name,
                email: data.email, // Update email in case it changed in Google account
                accessToken: data.accessToken,
                refreshToken: data.refreshToken || user.refreshToken,
                tokenExpiryDate: data.tokenExpiryDate || null,
            });
        } else {
            // No user with this googleUid. Check if the email is already in use.
            const userByEmail = await this.findByEmail(data.email);
            if (userByEmail) {
                // A user with this email exists, but a different (or no) googleUid.
                // This is a potential account merge/takeover scenario.
                // For now, we will update this existing user, effectively linking the Google account.
                // A more robust implementation might require user confirmation.
                user = userByEmail;
                Object.assign(user, {
                    name: data.name,
                    googleUid: data.googleUid, // Link the googleUid
                    accessToken: data.accessToken,
                    refreshToken: data.refreshToken || user.refreshToken,
                    tokenExpiryDate: data.tokenExpiryDate || null,
                });
            } else {
                // No user found by googleUid or email, create a new one.
                user = this.repository.create({
                    name: data.name,
                    email: data.email,
                    googleUid: data.googleUid,
                    accessToken: data.accessToken,
                    refreshToken: data.refreshToken || null,
                    tokenExpiryDate: data.tokenExpiryDate || null,
                });
            }
        }

        return this.repository.save(user);
    }

    async findByGoogleUid(googleUid: string): Promise<UserEntity | null> {
        return this.repository.findOne({ where: { googleUid } });
    }

    async findByEmail(email: string): Promise<UserEntity | null> {
        return this.repository.findOne({ where: { email } });
    }

    async clearTokens(userId: number): Promise<void> {
        await this.repository.update(userId, {
            accessToken: null,
            refreshToken: null,
            tokenExpiryDate: null,
        });
    }
}
