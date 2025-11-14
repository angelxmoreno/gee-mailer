import { beforeEach, describe, expect, test } from 'bun:test';
import { LogLevel } from '@app/types/LogLevel.ts';
import { NodeEnv } from '@app/types/NodeEnv.ts';
import { createConfig } from '@app/utils/createConfig.ts';

describe('createConfig', () => {
    const originalNodeEnv = Bun.env.NODE_ENV;
    const originalLoggerLevel = Bun.env.LOGGER_LEVEL;

    beforeEach(() => {
        Bun.env.NODE_ENV = originalNodeEnv;
        Bun.env.LOGGER_LEVEL = originalLoggerLevel;
    });

    test('should return the default configuration if no overrides are provided', () => {
        Bun.env.NODE_ENV = NodeEnv.development;
        Bun.env.LOGGER_LEVEL = LogLevel.info;

        const config = createConfig();

        expect(config).toEqual({
            nodeEnv: {
                env: NodeEnv.development,
                isDevelopment: true,
                isTesting: false,
            },
            logger: {
                usePretty: true,
                level: LogLevel.info,
            },
        });
    });

    test('should return the default configuration for a testing environment', () => {
        Bun.env.NODE_ENV = NodeEnv.test;
        Bun.env.LOGGER_LEVEL = LogLevel.debug;

        const config = createConfig();

        expect(config).toEqual({
            nodeEnv: {
                env: NodeEnv.test,
                isDevelopment: false,
                isTesting: true,
            },
            logger: {
                usePretty: true,
                level: LogLevel.debug,
            },
        });
    });

    test('should return the default configuration for a production environment', () => {
        Bun.env.NODE_ENV = NodeEnv.production;
        Bun.env.LOGGER_LEVEL = LogLevel.error;

        const config = createConfig();

        expect(config).toEqual({
            nodeEnv: {
                env: NodeEnv.production,
                isDevelopment: false,
                isTesting: false,
            },
            logger: {
                usePretty: false,
                level: LogLevel.error,
            },
        });
    });

    test('should merge the overrides with the default configuration', () => {
        Bun.env.NODE_ENV = NodeEnv.development;
        Bun.env.LOGGER_LEVEL = LogLevel.info;

        const overrides = {
            logger: {
                level: LogLevel.debug,
            },
        };

        const config = createConfig(overrides);

        expect(config).toEqual({
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
    });

    test('should throw an error if the merged configuration is invalid', () => {
        Bun.env.NODE_ENV = NodeEnv.development;
        Bun.env.LOGGER_LEVEL = LogLevel.info;

        const overrides = {
            logger: {
                level: 'invalid-level' as LogLevel,
            },
        };

        expect(() => createConfig(overrides)).toThrow();
    });
});
