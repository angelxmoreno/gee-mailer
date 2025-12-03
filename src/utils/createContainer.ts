import { createDataSourceOptions } from '@app/modules/typeorm/createDataSourceOptions';
import type { AppConfig } from '@app/types/AppConfig';
import { createBaseLogger } from '@app/utils/createBaseLogger';
import { createCacheStore } from '@app/utils/createCacheStore';
import { AppCache, AppConfigToken, AppLogger } from '@app/utils/tokens';
import { TaggedKeyv } from 'tagged-keyv-wrapper';
import { container, type DependencyContainer, type InjectionToken, instanceCachingFactory } from 'tsyringe';
import { DataSource } from 'typeorm';

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
    registerFactory(TaggedKeyv, (c) => new TaggedKeyv(c.resolve(AppCache)));

    // create typeorm datasource
    registerFactory(DataSource, () => new DataSource(createDataSourceOptions(config)));

    // Register AppConfig for dependency injection
    appContainer.registerInstance(AppConfigToken, config);

    // Note: Services with @singleton() decorator are auto-registered by TSyringe
    // OAuth2ClientFactory, CurrentUserService, and OAuthService are all @singleton()
    // Only manually register services that need special configuration

    return appContainer;
};
