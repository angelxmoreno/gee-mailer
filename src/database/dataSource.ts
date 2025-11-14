import { appConfig } from '@app/config';
import { createDataSourceOptions } from '@app/modules/typeorm/createDataSourceOptions';
import { DataSource } from 'typeorm';

/**
 * Package-level data source for migrations and package internal use
 */
const dataSourceOptions = createDataSourceOptions(appConfig);
export const AppDataSource = new DataSource(dataSourceOptions);
