import type { AppConfig } from '@app/types/AppConfig';
import { LogLevel } from '@app/types/LogLevel';
import { NodeEnv } from '@app/types/NodeEnv';
import { merge } from 'ts-deepmerge';

export const baseConfig: AppConfig = {
    nodeEnv: {
        env: NodeEnv.development,
        isDevelopment: true,
        isTesting: false,
    },
    logger: { usePretty: true, level: LogLevel.info },
    dbUrl: 'mysql://user@password@localhost:3306/dbname',
    google: {
        clientId: '',
        clientSecret: '',
    },
    workers: {
        enabled: true,
        gracefulShutdownTimeout: 30000,
        healthCheckInterval: 30000,
        autoRestart: true,
    },
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
