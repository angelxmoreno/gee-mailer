import 'reflect-metadata';
import { appContainer } from '@app/config';
import { UsersRepository } from '@app/database/repositories';
import { closeDatabase, initializeDatabase } from '@app/modules/typeorm/createDataSourceOptions';
import { CurrentUserService } from '@app/services/CurrentUserService';
import { OAuthService } from '@app/services/OAuthService';
import { TokenRefreshService } from '@app/services/TokenRefreshService';
import { DataSource } from 'typeorm';

interface AuthCommand {
    name: string;
    description: string;
    handler: () => Promise<void>;
}

export const authCommands: Record<string, AuthCommand> = {
    login: {
        name: 'login',
        description: 'Authenticate with Google OAuth',
        handler: async () => {
            const ds = appContainer.resolve(DataSource);
            await initializeDatabase(ds);

            try {
                const oauth = appContainer.resolve(OAuthService);
                const currentUser = appContainer.resolve(CurrentUserService);

                const result = await oauth.authorizeAndSaveUser();
                await currentUser.setCurrentUser(result.user);

                console.log('✅ Authentication successful!');
                console.log(`📧 Logged in as: ${result.user.email}`);
                console.log('🔑 Tokens:', {
                    hasAccessToken: !!result.tokens.access_token,
                    hasRefreshToken: !!result.tokens.refresh_token,
                    expiryDate: result.tokens.expiry_date
                        ? new Date(result.tokens.expiry_date).toLocaleString()
                        : 'Unknown',
                });
            } catch (error) {
                console.error('❌ Authentication failed:', error instanceof Error ? error.message : error);
                process.exit(1);
            } finally {
                await closeDatabase(ds);
            }
        },
    },

    logout: {
        name: 'logout',
        description: 'Clear authentication tokens',
        handler: async () => {
            const ds = appContainer.resolve(DataSource);
            await initializeDatabase(ds);

            try {
                const userRepo = appContainer.resolve(UsersRepository);
                const currentUser = appContainer.resolve(CurrentUserService);

                const user = await currentUser.getCurrentUser();
                if (user) {
                    await userRepo.clearTokens(user.id);
                    await currentUser.clearCurrentUser();
                    console.log('✅ Logged out successfully');
                    console.log(`📧 Cleared tokens for: ${user.email}`);
                } else {
                    console.log('ℹ️  No user currently authenticated');
                }
            } catch (error) {
                console.error('❌ Logout failed:', error instanceof Error ? error.message : error);
                process.exit(1);
            } finally {
                await closeDatabase(ds);
            }
        },
    },

    status: {
        name: 'status',
        description: 'Check authentication status',
        handler: async () => {
            const ds = appContainer.resolve(DataSource);
            await initializeDatabase(ds);

            try {
                const currentUser = appContainer.resolve(CurrentUserService);
                const tokenRefreshService = appContainer.resolve(TokenRefreshService);

                const user = await currentUser.getCurrentUser();
                if (!user) {
                    console.log('❌ Not authenticated');
                    console.log('💡 Run `bun auth login` to authenticate');
                    return;
                }

                console.log(`✅ Authenticated as: ${user.email}`);
                console.log(`👤 User ID: ${user.id}`);
                console.log(`🆔 Google UID: ${user.googleUid}`);

                if (user.tokenExpiryDate) {
                    const now = new Date();
                    const expiryDate = new Date(user.tokenExpiryDate);
                    const timeUntilExpiry = expiryDate.getTime() - now.getTime();
                    const hoursUntilExpiry = Math.floor(timeUntilExpiry / (1000 * 60 * 60));
                    const minutesUntilExpiry = Math.floor((timeUntilExpiry % (1000 * 60 * 60)) / (1000 * 60));

                    console.log(`📅 Token expires: ${expiryDate.toLocaleString()}`);

                    if (timeUntilExpiry > 0) {
                        console.log(`⏰ Time until expiry: ${hoursUntilExpiry}h ${minutesUntilExpiry}m`);

                        const isExpiringSoon = await tokenRefreshService.isTokenExpiringSoon(user.id);
                        if (isExpiringSoon) {
                            console.log('⚠️  Token expires soon - will auto-refresh on next API call');
                        } else {
                            console.log('🟢 Token is valid');
                        }
                    } else {
                        console.log('🔴 Token has expired - will auto-refresh on next API call');
                    }
                } else {
                    console.log('⚠️  No token expiry date available');
                }

                console.log(`🔑 Has access token: ${!!user.accessToken}`);
                console.log(`🔄 Has refresh token: ${!!user.refreshToken}`);
            } catch (error) {
                console.error('❌ Status check failed:', error instanceof Error ? error.message : error);
                process.exit(1);
            } finally {
                await closeDatabase(ds);
            }
        },
    },

    refresh: {
        name: 'refresh',
        description: 'Manually refresh authentication tokens',
        handler: async () => {
            const ds = appContainer.resolve(DataSource);
            await initializeDatabase(ds);

            try {
                const currentUser = appContainer.resolve(CurrentUserService);
                const tokenRefreshService = appContainer.resolve(TokenRefreshService);

                const user = await currentUser.getCurrentUser();
                if (!user) {
                    console.log('❌ No user currently authenticated');
                    console.log('💡 Run `bun auth login` to authenticate first');
                    return;
                }

                console.log(`🔄 Refreshing tokens for ${user.email}...`);
                const success = await tokenRefreshService.refreshAccessToken(user.id);

                if (success) {
                    console.log('✅ Tokens refreshed successfully');

                    // Get updated user info
                    const updatedUser = await currentUser.getCurrentUser();
                    if (updatedUser?.tokenExpiryDate) {
                        console.log(`📅 New expiry: ${updatedUser.tokenExpiryDate.toLocaleString()}`);
                    }
                } else {
                    console.log('❌ Failed to refresh tokens');
                    console.log('💡 Please run `bun auth login` to re-authenticate');
                }
            } catch (error) {
                console.error('❌ Token refresh failed:', error instanceof Error ? error.message : error);
                process.exit(1);
            } finally {
                await closeDatabase(ds);
            }
        },
    },
};

export const authCommand = {
    name: 'auth',
    description: 'OAuth authentication management',
    subcommands: authCommands,
};
