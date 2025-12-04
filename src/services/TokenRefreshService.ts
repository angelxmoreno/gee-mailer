import type { UserEntity } from '@app/database/entities';
import { UsersRepository } from '@app/database/repositories';
import { OAuth2ClientFactory } from '@app/factories/OAuth2ClientFactory';
import { AppLogger } from '@app/utils/tokens';
import type { Logger } from 'pino';
import { inject, singleton } from 'tsyringe';

@singleton()
export class TokenRefreshService {
    protected oauth2ClientFactory: OAuth2ClientFactory;
    protected userRepo: UsersRepository;
    protected logger: Logger;

    constructor(
        @inject(UsersRepository) userRepo: UsersRepository,
        @inject(AppLogger) logger: Logger,
        @inject(OAuth2ClientFactory) oauth2ClientFactory: OAuth2ClientFactory
    ) {
        this.userRepo = userRepo;
        this.logger = logger;
        this.oauth2ClientFactory = oauth2ClientFactory;
    }

    async refreshTokensIfNeeded(userId: number): Promise<boolean> {
        const user = await this.userRepo.findById(userId);
        if (!user?.refreshToken) {
            return false;
        }

        if (this.isUserTokenExpiringSoon(user, 5)) {
            return await this.refreshAccessToken(userId);
        }

        return true; // Token is still valid
    }

    async refreshAccessToken(userId: number): Promise<boolean> {
        try {
            const user = await this.userRepo.findByIdOrFail(userId);
            if (!user.refreshToken) {
                throw new Error('No refresh token available');
            }

            const oauth2Client = this.oauth2ClientFactory.createForRefresh(user.refreshToken);

            const { credentials } = await oauth2Client.refreshAccessToken();

            // Update user with new tokens (encrypted automatically via transformer)
            if (!credentials.access_token) {
                throw new Error('No access token received from refresh operation');
            }

            await this.userRepo.update(user, {
                accessToken: credentials.access_token,
                tokenExpiryDate: credentials.expiry_date ? new Date(credentials.expiry_date) : null,
                refreshToken: credentials.refresh_token || user.refreshToken,
            });

            this.logger.info({ userId }, 'Tokens refreshed successfully');
            return true;
        } catch (error) {
            this.logger.error({ userId, error }, 'Failed to refresh tokens');
            return false;
        }
    }

    async isTokenExpiringSoon(userId: number, bufferMinutes = 5): Promise<boolean> {
        const user = await this.userRepo.findById(userId);
        if (!user) return true; // Assume expired if user not found
        return this.isUserTokenExpiringSoon(user, bufferMinutes);
    }

    /**
     * Checks if a user's token is expiring soon (private helper to avoid code duplication)
     */
    private isUserTokenExpiringSoon(user: UserEntity, bufferMinutes = 5): boolean {
        if (!user.tokenExpiryDate) return true; // Assume expired if no expiry date

        const expiryBuffer = bufferMinutes * 60 * 1000;
        const now = new Date();
        const expiryWithBuffer = new Date(user.tokenExpiryDate.getTime() - expiryBuffer);

        return now >= expiryWithBuffer;
    }

    // Note: Token refresh is on-demand only for the current active user
    // Background refresh scheduling for all users is not implemented
    // as it doesn't align with the single-user workflow
}
