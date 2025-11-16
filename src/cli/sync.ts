import 'reflect-metadata';
import { appContainer } from '@app/config.ts';
import { closeDatabase, initializeDatabase } from '@app/modules/typeorm/createDataSourceOptions.ts';
import { CurrentUserService } from '@app/services/CurrentUserService.ts';
import { MailSyncService } from '@app/services/MailSyncService.ts';
import { AppLogger } from '@app/utils/tokens';
import { DataSource } from 'typeorm';

const main = async () => {
    const logger = appContainer.resolve(AppLogger);
    const ds = appContainer.resolve(DataSource);
    await initializeDatabase(ds);

    try {
        const currentUserService = appContainer.resolve(CurrentUserService);
        const currentUser = await currentUserService.getCurrentUser();

        if (!currentUser) {
            logger.error('❌ No user is currently authenticated.');
            logger.debug('💡 Please run `bun src/cli/auth.ts` to authenticate first.');
            process.exit(1);
        }

        logger.debug(`🔄 Starting sync for ${currentUser.name} (${currentUser.email})`);
        logger.debug('📧 Fetching Gmail data...\n');

        const syncService = appContainer.resolve(MailSyncService);
        await syncService.sync();

        logger.debug('\n✅ Sync completed successfully!');
    } catch (error) {
        if (error instanceof Error) {
            if (error.message === 'No current user') {
                logger.error('❌ No user is currently authenticated.');
                logger.debug('💡 Please run `bun src/cli/auth.ts` to authenticate first.');
            } else if (error.message.includes('token')) {
                logger.error(error, `❌ Authentication token error: ${error.message}`);
                logger.debug('💡 Try running `bun src/cli/auth.ts` to refresh your authentication.');
            } else {
                logger.error(error, `❌ Sync failed: ${error.message}`);
                logger.debug('📝 Check logs for more details.');
            }
        } else {
            logger.error(error, '❌ Unexpected error occurred');
        }
        process.exit(1);
    } finally {
        await closeDatabase(ds);
    }
};

void main();
