import 'reflect-metadata';
import { appContainer } from '@app/config.ts';
import { closeDatabase, initializeDatabase } from '@app/modules/typeorm/createDataSourceOptions.ts';
import { enqueueIncrementalSync, enqueueInitialSync, enqueueLabelSync } from '@app/queues/generated/producers';
import { CurrentUserService } from '@app/services/CurrentUserService.ts';
import { SyncStateService } from '@app/services/SyncStateService.ts';
import { AppLogger } from '@app/utils/tokens';
import { DataSource } from 'typeorm';

const main = async () => {
    const logger = appContainer.resolve(AppLogger);
    const ds = appContainer.resolve(DataSource);
    await initializeDatabase(ds);

    try {
        const currentUserService = appContainer.resolve(CurrentUserService);
        const syncStateService = appContainer.resolve(SyncStateService);
        const currentUser = await currentUserService.getCurrentUser();

        if (!currentUser) {
            logger.error('❌ No user is currently authenticated.');
            logger.debug('💡 Please run `bun src/cli/auth.ts` to authenticate first.');
            process.exit(1);
        }

        const maskedEmail = currentUser.email.replace(/(.{1,3})[^@]*@/, '$1***@');
        logger.info(`🔄 Starting sync for user ${currentUser.id} (${maskedEmail})`);

        // Get current sync state to determine what sync operations are needed
        const syncState = await syncStateService.getUserSyncState(currentUser.id);

        logger.info('📊 Checking sync requirements...');

        let jobsEnqueued = false;

        // Enqueue label sync if needed
        if (syncState.needsLabelSync) {
            logger.info('📋 Enqueueing label sync...');
            await enqueueLabelSync({ userId: currentUser.id });
            jobsEnqueued = true;
        }

        // Enqueue appropriate sync type based on user state
        if (syncState.needsInitialSync) {
            logger.info('🚀 Enqueueing initial sync (this may take a while)...');
            await enqueueInitialSync({ userId: currentUser.id });
            jobsEnqueued = true;
        } else if (syncState.canIncrementalSync) {
            logger.info('⚡ Enqueueing incremental sync...');
            await enqueueIncrementalSync({ userId: currentUser.id });
            jobsEnqueued = true;
        } else {
            logger.warn('⚠️ Cannot perform sync - initial setup incomplete');
            logger.debug('💡 User may need to complete initial sync first');
        }

        if (jobsEnqueued) {
            logger.info('✅ Sync jobs enqueued successfully!');
            logger.info('⏳ Jobs are now processing in the background via workers');
            logger.debug('💡 Use `bun run workers:start` to ensure workers are running');
        } else {
            logger.warn('⚠️ No sync jobs were enqueued');
        }
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
