import { exec } from 'node:child_process';
import { createServer } from 'node:http';
import { URL } from 'node:url';
import type { UserEntity } from '@app/database/entities';
import type { UsersRepository } from '@app/database/repositories';
import type { CurrentUserService } from '@app/services/CurrentUserService';
import { type Auth, google } from 'googleapis';
import type { Logger } from 'pino';

export type OAuth2Client = Auth.OAuth2Client;
export type Credentials = Auth.Credentials;

export interface AuthorizationResult {
    tokens: Credentials;
    userCode?: string;
}

export interface GoogleUserInfo {
    id: string;
    email: string;
    name: string;
    picture?: string;
}

export class OAuthService {
    protected oauth2Client: OAuth2Client;
    protected logger: Logger;
    protected scopes = [
        'https://www.googleapis.com/auth/gmail.labels',
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/gmail.metadata',
        'https://www.googleapis.com/auth/userinfo.profile',
        'https://www.googleapis.com/auth/userinfo.email',
    ];
    protected userRepo: UsersRepository;
    protected currentUserService: CurrentUserService;
    protected callbackPort = 3000;

    constructor(
        logger: Logger,
        userRepo: UsersRepository,
        currentUserService: CurrentUserService,
        clientId: string,
        clientSecret: string
    ) {
        this.logger = logger;
        this.userRepo = userRepo;
        this.currentUserService = currentUserService;
        this.oauth2Client = this.createOauth2Client(clientId, clientSecret);
    }

    protected createOauth2Client(clientId: string, clientSecret: string): OAuth2Client {
        const options = {
            clientId,
            clientSecret,
            redirectUri: `http://127.0.0.1:${this.callbackPort}/oauth2callback`,
        };
        this.logger.debug(
            {
                ...options,
                clientSecret: '*********************',
            },
            'creating OAuth2Client'
        );
        const oauth2Client = new google.auth.OAuth2(options);

        oauth2Client.on('tokens', (tokens) => {
            if (tokens.refresh_token) {
                this.logger.info(tokens, 'refresh token detected');
            } else {
                this.logger.info(tokens, 'no refresh token detected');
            }
        });

        return oauth2Client;
    }

    /**
     * Exchanges an authorization code for access and refresh tokens.
     * @param code The authorization code received from Google.
     * @returns An object containing the access token, refresh token, and expiry date.
     */
    public async getTokens(code: string): Promise<Credentials> {
        const { tokens } = await this.oauth2Client.getToken(code);
        this.oauth2Client.setCredentials(tokens);
        this.logger.info('Successfully retrieved OAuth tokens.');
        return tokens;
    }

    /**
     * Sets the credentials for the OAuth2 client.
     * This should be called with stored refresh tokens to re-establish a session.
     * @param tokens The credentials to set, typically including a refresh token.
     */
    public setCredentials(tokens: Credentials): void {
        this.oauth2Client.setCredentials(tokens);
        this.logger.debug('OAuth2 client credentials set.');
    }

    /**
     * Launches the browser and starts a local server to handle the OAuth callback.
     * Provides a complete CLI-friendly authorization flow.
     * @returns Promise that resolves with the authorization tokens
     */
    public async authorizeWithBrowser(): Promise<AuthorizationResult> {
        return new Promise((resolve, reject) => {
            const authUrl = this.oauth2Client.generateAuthUrl({
                access_type: 'offline',
                prompt: 'consent',
                scope: this.scopes,
            });

            // Create local server to handle callback
            const server = createServer((req, res) => {
                if (!req.url) {
                    res.writeHead(400, { 'Content-Type': 'text/html' });
                    res.end('<h1>Bad Request</h1><p>No URL provided</p>');
                    return;
                }

                const url = new URL(req.url, `http://localhost:${this.callbackPort}`);

                if (url.pathname === '/oauth2callback') {
                    const code = url.searchParams.get('code');
                    const error = url.searchParams.get('error');

                    if (error) {
                        res.writeHead(400, { 'Content-Type': 'text/html' });
                        res.end(`<h1>Authorization Error</h1><p>${error}</p><p>You can close this window.</p>`);
                        server.close();
                        reject(new Error(`Authorization error: ${error}`));
                        return;
                    }

                    if (code) {
                        res.writeHead(200, { 'Content-Type': 'text/html' });
                        res.end(
                            '<h1>Authorization Successful!</h1><p>You can close this window and return to the terminal.</p>'
                        );
                        server.close();

                        // Exchange code for tokens
                        this.getTokens(code)
                            .then((tokens) => {
                                resolve({ tokens });
                            })
                            .catch(reject);
                    } else {
                        res.writeHead(400, { 'Content-Type': 'text/html' });
                        res.end('<h1>Missing Authorization Code</h1><p>You can close this window.</p>');
                        server.close();
                        reject(new Error('No authorization code received'));
                    }
                } else {
                    res.writeHead(404, { 'Content-Type': 'text/html' });
                    res.end('<h1>Not Found</h1>');
                }
            });

            // Start server
            server.listen(this.callbackPort, () => {
                this.logger.info(`OAuth callback server started on port ${this.callbackPort}`);
                console.log('🔐 Starting OAuth authorization...');
                console.log('📱 Opening your browser for Google authentication...');
                console.log("\n💡 If the browser doesn't open automatically, visit this URL:");
                console.log(`   ${authUrl}\n`);

                // Launch browser
                this.launchBrowser(authUrl);
            });

            // Handle server errors
            server.on('error', (err) => {
                this.logger.error(err, 'OAuth callback server error');
                reject(err);
            });

            // Set timeout
            setTimeout(() => {
                server.close();
                reject(new Error('Authorization timeout - please try again'));
            }, 300000); // 5 minutes
        });
    }

    /**
     * Launches the default browser with the authorization URL
     */
    protected launchBrowser(url: string): void {
        let command: string;

        switch (process.platform) {
            case 'win32':
                command = `start "${url}"`;
                break;
            case 'darwin':
                command = `open "${url}"`;
                break;
            default:
                command = `xdg-open "${url}"`;
                break;
        }

        exec(command, (error) => {
            if (error) {
                this.logger.error(error, 'Failed to launch browser automatically');
                console.log('⚠️  Could not open browser automatically');
            } else {
                this.logger.debug('Browser launched successfully');
            }
        });
    }

    /**
     * Gets user information from Google using the current credentials
     */
    async getUserInfo(): Promise<GoogleUserInfo> {
        const oauth2 = google.oauth2({ version: 'v2', auth: this.oauth2Client });
        const { data } = await oauth2.userinfo.get();

        if (!data.id || !data.email || !data.name) {
            throw new Error('Failed to get complete user information from Google');
        }

        return {
            id: data.id,
            email: data.email,
            name: data.name,
            picture: data.picture || undefined,
        };
    }

    /**
     * Complete authorization flow that gets tokens and saves user information
     */
    async authorizeAndSaveUser(): Promise<{ user: UserEntity; tokens: Credentials }> {
        const result = await this.authorizeWithBrowser();

        // Set credentials so we can make API calls
        this.setCredentials(result.tokens);

        // Get user info from Google
        const userInfo = await this.getUserInfo();

        // Save user with tokens to database
        if (!result.tokens.access_token) {
            throw new Error('No access token received from Google');
        }

        const user = await this.userRepo.saveUserWithTokens({
            googleUid: userInfo.id,
            name: userInfo.name,
            email: userInfo.email,
            accessToken: result.tokens.access_token,
            refreshToken: result.tokens.refresh_token || undefined,
            tokenExpiryDate: result.tokens.expiry_date ? new Date(result.tokens.expiry_date) : undefined,
        });

        // Set as current user
        await this.currentUserService.setCurrentUser(user);

        this.logger.info({ userId: user.id, email: user.email }, 'User authenticated and saved as current user');

        return { user, tokens: result.tokens };
    }
}
