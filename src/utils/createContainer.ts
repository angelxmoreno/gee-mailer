import { UsersRepository } from '@app/database/repositories';
import { createDataSourceOptions } from '@app/modules/typeorm/createDataSourceOptions';
import { CurrentUserService } from '@app/services/CurrentUserService.ts';
import { OAuthService } from '@app/services/OAuthService.ts';
import type { AppConfig } from '@app/types/AppConfig';
import { createBaseLogger } from '@app/utils/createBaseLogger';
import { createCacheStore } from '@app/utils/createCacheStore';
import { AppCache, AppLogger } from '@app/utils/tokens';
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

    // Note: Services with @singleton() decorator are auto-registered by TSyringe
    // Only manually register services that need special configuration

    registerFactory(
        OAuthService,
        (c) =>
            new OAuthService(
                c.resolve(AppLogger),
                c.resolve(UsersRepository),
                c.resolve(CurrentUserService),
                config.google.clientId,
                config.google.clientSecret
            )
    );

    return appContainer;
};
