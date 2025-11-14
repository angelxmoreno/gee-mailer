import { InflectionNamingStrategy } from '@app/modules/typeorm/naming-strategy/InflectionNamingStrategy';
import { parseDsnString } from '@app/modules/typeorm/parseDsnString';
import type { AppConfig } from '@app/types/AppConfig';
import { createBaseLogger } from '@app/utils/createBaseLogger';
import type { Logger } from 'pino';
import type { DataSource, DataSourceOptions } from 'typeorm';
import { TypeOrmPinoLogger } from 'typeorm-pino-logger';

export function createDataSourceOptions(config: AppConfig): DataSourceOptions {
    const typeormLogger = new TypeOrmPinoLogger(createBaseLogger(config), {
        logQueries: false,
        logSchemaOperations: false,
        messageFilter: (_message, type) => type === 'general2',
    });
    const parsedUrlConfigs = parseDsnString(config.dbUrl);
    const RootPath = `${__dirname}/../..`;
    return {
        ...parsedUrlConfigs,
        entities: [`${RootPath}/database/entities/*Entity.{ts,js}`],
        migrations: [`${RootPath}/database/migrations/*.{ts,js}`],
        migrationsTableName: 'typeorm_migrations',
        namingStrategy: new InflectionNamingStrategy(),
        logger: typeormLogger,
    } as DataSourceOptions;
}

/**
 * Initialize and return a database connection
 * Apps should use this with their own configuration
 */
export async function initializeDatabase(ds: DataSource, logger?: Logger): Promise<DataSource> {
    try {
        if (!ds.isInitialized) {
            await ds.initialize();
            const message = `Database connection initialized (${ds.options.database})`;
            if (logger) {
                logger.info(message);
            } else {
                console.log(`✅ ${message}`);
            }
        }
        return ds;
    } catch (error) {
        const message = 'Error during database initialization';
        if (logger) {
            logger.error({ error }, message);
        } else {
            console.error(`❌ ${message}:`, error);
        }
        throw error;
    }
}

/**
 * Gracefully close database connection
 */
export async function closeDatabase(ds: DataSource, logger?: Logger): Promise<void> {
    try {
        if (ds.isInitialized) {
            await ds.destroy();
            const message = `Database connection closed (${ds.options.database})`;
            if (logger) {
                logger.info(message);
            } else {
                console.log(`✅ ${message}`);
            }
        }
    } catch (error) {
        const message = 'Error closing database connection';
        if (logger) {
            logger.error({ error }, message);
        } else {
            console.error(`❌ ${message}:`, error);
        }
        throw error;
    }
}
