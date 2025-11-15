import 'reflect-metadata';
import { appContainer } from '@app/config.ts';
import { closeDatabase, initializeDatabase } from '@app/modules/typeorm/createDataSourceOptions.ts';
import { OAuthService } from '@app/services/OAuthService.ts';
import { DataSource } from 'typeorm';

const main = async () => {
    const ds = appContainer.resolve(DataSource);
    await initializeDatabase(ds);
    const oauth = appContainer.resolve(OAuthService);

    try {
        const result = await oauth.authorizeAndSaveUser();
        console.log('✅ Authorization successful!');
        console.log('Tokens received:', {
            hasAccessToken: !!result.tokens.access_token,
            hasRefreshToken: !!result.tokens.refresh_token,
            expiryDate: result.tokens.expiry_date,
        });
    } catch (error) {
        console.error('❌ Authorization failed:', error instanceof Error ? error.message : error);
    } finally {
        await closeDatabase(ds);
    }
};

void main();
