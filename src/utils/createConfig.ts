import { type AppConfig, AppConfigSchema } from '@app/types/AppConfig.ts';
import { LogLevel } from '@app/types/LogLevel.ts';
import { NodeEnv } from '@app/types/NodeEnv.ts';
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
    };

    const config = merge(appConfigEnv, overrides ?? {});
    return AppConfigSchema.parse(config);
};
