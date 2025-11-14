import type { DataSourceOptions } from 'typeorm';

export const parseDsnString = (dsn: string): Partial<DataSourceOptions> => {
    if (dsn.startsWith('sqlite://')) {
        // Handle SQLite URLs manually
        const match = dsn.match(/^sqlite:\/\/([^?]+)(?:\?(.*))?$/);
        if (!match) {
            throw new Error('Invalid SQLite DSN');
        }

        const [, path, queryString] = match;
        const queryParams = new URLSearchParams(queryString || '');

        return {
            type: 'sqlite',
            database: path,
            synchronize: queryParams.get('synchronize') === 'true',
            logging: queryParams.get('logging') === 'true',
            migrationsRun: queryParams.get('migrationsRun') === 'true',
        };
    }

    const url = new URL(dsn);

    // Extract database type from protocol
    const type = url.protocol.replace(':', '') as 'mysql' | 'postgres';
    const queryParams = url.searchParams;
    let connectionOptions: Partial<DataSourceOptions> = {
        type,
        host: url.hostname,
        port: url.port ? parseInt(url.port, 10) : undefined,
        username: url.username,
        password: url.password,
        database: url.pathname.slice(1),
        synchronize: queryParams.get('synchronize') === 'true',
        logging: queryParams.get('logging') === 'true',
        migrationsRun: queryParams.get('migrationsRun') === 'true',
    };

    if (['mysql'].includes(type)) {
        connectionOptions = {
            ...connectionOptions,
            timezone: queryParams.get('timezone') ?? 'UTC',
            charset: queryParams.get('charset') ?? 'utf8mb4',
        } as Partial<DataSourceOptions>;
    }
    return connectionOptions;
};
