import type { AppConfig } from '@app/types/AppConfig';
import { LogLevel } from '@app/types/LogLevel.ts';
import { NodeEnv } from '@app/types/NodeEnv.ts';
import { merge } from 'ts-deepmerge';

export const baseConfig: AppConfig = {
    nodeEnv: {
        env: NodeEnv.development,
        isDevelopment: true,
        isTesting: false,
    },
    logger: { usePretty: true, level: LogLevel.info },
};

export const developmentConfig: AppConfig = merge(baseConfig, {
    nodeEnv: {
        env: NodeEnv.development,
        isDevelopment: true,
        isTesting: false,
    },
    logger: {
        usePretty: true,
        level: LogLevel.debug,
    },
});

export const productionConfig: AppConfig = merge(baseConfig, {
    nodeEnv: {
        env: NodeEnv.production,
        isDevelopment: false,
        isTesting: false,
    },
    logger: {
        usePretty: false,
        level: LogLevel.info,
    },
});

export const testConfig: AppConfig = merge(baseConfig, {
    nodeEnv: {
        env: NodeEnv.test,
        isDevelopment: false,
        isTesting: true,
    },
    logger: {
        usePretty: true,
        level: LogLevel.warn,
    },
});
