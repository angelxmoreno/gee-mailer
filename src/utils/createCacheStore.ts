import Keyv, { type Store } from '@keyvhq/core';
import KeyvRedis from '@keyvhq/redis';
import KeyvSQLite from '@keyvhq/sqlite';

export const createCacheStore = (dsn?: string): Keyv => {
    try {
        let store: Store<unknown> | undefined;

        if (dsn?.startsWith('sqlite://')) {
            store = new KeyvSQLite(dsn);
        } else if (dsn?.startsWith('redis://')) {
            store = new KeyvRedis(dsn);
        }

        return store ? new Keyv({ store }) : new Keyv();
    } catch (error) {
        console.warn('Failed to connect to cache store, falling back to in-memory cache:', error);
        return new Keyv(); // Fallback to in-memory cache
    }
};
