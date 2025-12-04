import type { UserEntity } from '@app/database/entities';
import type { AppConfig } from '@app/types/AppConfig';
import { AppConfigToken, AppLogger } from '@app/utils/tokens';
import { type Auth, google } from 'googleapis';
import type { Logger } from 'pino';
import { inject, singleton } from 'tsyringe';

export type OAuth2Client = Auth.OAuth2Client;
export type Credentials = Auth.Credentials;

export interface OAuth2ClientOptions {
    redirectUri?: string;
    enableTokenEvents?: boolean;
}

/**
 * Factory for creating OAuth2Client instances with consistent configuration
 */
@singleton()
export class OAuth2ClientFactory {
    constructor(
        @inject(AppConfigToken) protected config: AppConfig,
        @inject(AppLogger) protected logger: Logger
    ) {}

    /**
     * Creates OAuth2Client for authorization flow (with redirect URI and event handling)
     */
    createAuthorizationClient(callbackPort = 3000): OAuth2Client {
        const redirectUri = `http://127.0.0.1:${callbackPort}/oauth2callback`;

        const options = {
            clientId: this.config.google.clientId,
            clientSecret: this.config.google.clientSecret,
            redirectUri,
        };

        this.logger.debug(
            {
                ...options,
                clientSecret: '*********************',
            },
            'Creating OAuth2Client for authorization'
        );

        const oauth2Client = new google.auth.OAuth2(options);

        // Add token event handling for authorization flows
        oauth2Client.on('tokens', (tokens) => {
            if (tokens.refresh_token) {
                this.logger.info('Refresh token received in authorization flow');
            } else {
                this.logger.info('No refresh token in authorization response');
            }
        });

        return oauth2Client;
    }

    /**
     * Creates OAuth2Client for API operations (no redirect URI, minimal logging)
     */
    createApiClient(): OAuth2Client {
        const options = {
            clientId: this.config.google.clientId,
            clientSecret: this.config.google.clientSecret,
        };

        this.logger.debug('Creating OAuth2Client for API operations');

        return new google.auth.OAuth2(options);
    }

    /**
     * Creates OAuth2Client with pre-set credentials
     */
    createFromCredentials(credentials: Credentials): OAuth2Client {
        const oauth2Client = this.createApiClient();
        oauth2Client.setCredentials(credentials);

        this.logger.debug('Created OAuth2Client with existing credentials');

        return oauth2Client;
    }

    /**
     * Creates OAuth2Client with refresh token only (for token refresh operations)
     */
    createForRefresh(refreshToken: string): OAuth2Client {
        const oauth2Client = this.createApiClient();
        oauth2Client.setCredentials({
            refresh_token: refreshToken,
        });

        this.logger.debug('Created OAuth2Client for token refresh');

        return oauth2Client;
    }

    /**
     * Creates OAuth2Client with complete user credentials (for Gmail API operations)
     */
    createForApiCalls(user: UserEntity): OAuth2Client {
        const oauth2Client = this.createApiClient();

        if (!user.accessToken) {
            throw new Error('User has no access token - authentication required');
        }

        oauth2Client.setCredentials({
            access_token: user.accessToken,
            refresh_token: user.refreshToken || undefined,
            expiry_date: user.tokenExpiryDate?.getTime() || undefined,
        });

        this.logger.debug({ userId: user.id }, 'Created OAuth2Client for API calls');

        return oauth2Client;
    }
}
