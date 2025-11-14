import { createDataSourceOptions } from '@app/modules/typeorm/createDataSourceOptions';
import type { AppConfig } from '@app/types/AppConfig';
import { createBaseLogger } from '@app/utils/createBaseLogger';
import { createCacheStore } from '@app/utils/createCacheStore';
import type Keyv from '@keyvhq/core';
import type { Logger } from 'pino';
import { container, type DependencyContainer, type InjectionToken, instanceCachingFactory } from 'tsyringe';
import { DataSource } from 'typeorm';

// Simple string-based injection tokens for consistency
export const AppLogger: InjectionToken<Logger> = 'Logger';
export const AppCache: InjectionToken<Keyv> = 'Cache';

export const createContainer = (config: AppConfig): DependencyContainer => {
    const appContainer = container.createChildContainer();

    // Utility function to reduce DI registration boilerplate
    const registerFactory = <T>(token: InjectionToken<T>, factory: (container: DependencyContainer) => T) => {
        appContainer.register<T>(token, {
            useFactory: instanceCachingFactory<T>(factory),
        });
    };

    // Register logger with error handling
    registerFactory(AppLogger, () => createBaseLogger(config));

    // Register base Keyv instance
    registerFactory(AppCache, () => createCacheStore(config.cacheUrl));

    // create typeorm datasource
    registerFactory(DataSource, () => new DataSource(createDataSourceOptions(config)));

    return appContainer;
};
