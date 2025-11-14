import { describe, expect, it } from 'bun:test';
import { createBaseLogger } from '@app/utils/createBaseLogger';
import { developmentConfig, productionConfig, testConfig } from '../../helpers/test-configs';

describe('createBaseLogger', () => {
    describe('development configuration', () => {
        it('should create pino logger instance with correct level', () => {
            const logger = createBaseLogger(developmentConfig);

            expect(logger).toBeDefined();
            expect(logger.constructor.name).toBe('Pino');
            expect(logger.level).toBe('debug');
        });
    });

    describe('production configuration', () => {
        it('should create pino logger instance with correct level', () => {
            const logger = createBaseLogger(productionConfig);

            expect(logger).toBeDefined();
            expect(logger.constructor.name).toBe('Pino');
            expect(logger.level).toBe('info');
        });
    });

    describe('test configuration', () => {
        it('should create pino logger instance with correct level', () => {
            const logger = createBaseLogger(testConfig);

            expect(logger).toBeDefined();
            expect(logger.constructor.name).toBe('Pino');
            expect(logger.level).toBe('warn');
        });
    });
});
