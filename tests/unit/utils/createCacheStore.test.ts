import { describe, expect, it } from 'bun:test';
import { createCacheStore } from '@app/utils/createCacheStore';

describe('createCacheStore', () => {
    describe('cache creation logic', () => {
        it('should create in-memory Keyv instance when dsn is empty or undefined', () => {
            const cache1 = createCacheStore('');
            const cache2 = createCacheStore();
            const cache3 = createCacheStore(undefined);

            expect(cache1).toBeDefined();
            expect(cache1.constructor.name).toBe('Keyv');
            expect(cache2).toBeDefined();
            expect(cache2.constructor.name).toBe('Keyv');
            expect(cache3).toBeDefined();
            expect(cache3.constructor.name).toBe('Keyv');
        });

        it.skip('should create Keyv instance with Redis store for redis:// DSN', () => {
            const cache = createCacheStore('redis://localhost:6379');

            expect(cache).toBeDefined();
            expect(cache.constructor.name).toBe('Keyv');
        });

        it('should create Keyv instance with SQLite store for sqlite:// DSN', () => {
            const cache = createCacheStore('sqlite://cache.db');

            expect(cache).toBeDefined();
            expect(cache.constructor.name).toBe('Keyv');
        });

        it('should create in-memory Keyv instance for unsupported DSN protocols', () => {
            const cache1 = createCacheStore('postgresql://localhost:5432');
            const cache2 = createCacheStore('invalid-url');
            const cache3 = createCacheStore('http://example.com');

            expect(cache1).toBeDefined();
            expect(cache1.constructor.name).toBe('Keyv');
            expect(cache2).toBeDefined();
            expect(cache2.constructor.name).toBe('Keyv');
            expect(cache3).toBeDefined();
            expect(cache3.constructor.name).toBe('Keyv');
        });
    });
});
