import { type AppConfig, AppConfigSchema } from '@app/types/AppConfig';
import { LogLevel } from '@app/types/LogLevel';
import { NodeEnv } from '@app/types/NodeEnv';
import type { DeepPartial } from '@ts-types/deep-partial';
import { merge } from 'ts-deepmerge';

export const createConfig = (overrides?: DeepPartial<AppConfig>): AppConfig => {
    const env = (Bun.env.NODE_ENV || NodeEnv.development) as NodeEnv;
    const isDevelopment = env === NodeEnv.development;
    const isTesting = env === NodeEnv.test;

    const appConfigEnv: AppConfig = {
        nodeEnv: {
            env,
            isDevelopment,
            isTesting,
        },
        logger: {
            usePretty: isDevelopment || isTesting,
            level: (Bun.env.LOGGER_LEVEL as LogLevel) || LogLevel.info,
        },
        cacheUrl: Bun.env.CACHE_URL,
        dbUrl: Bun.env.DATABASE_URL || 'mysql://user@password@localhost:3306/dbname',
        google: {
            clientId: String(Bun.env.GOOGLE_CLIENT_ID),
            clientSecret: String(Bun.env.GOOGLE_CLIENT_SECRET),
        },
    };

    const config = merge(appConfigEnv, overrides ?? {});
    return AppConfigSchema.parse(config);
};
