import type { AppConfig } from '@app/types/AppConfig';
import type Keyv from '@keyvhq/core';
import type { Logger } from 'pino';
import type { InjectionToken } from 'tsyringe';

// Simple string-based injection tokens for consistency
export const AppLogger: InjectionToken<Logger> = 'Logger';
export const AppCache: InjectionToken<Keyv> = 'Cache';
export const AppConfigToken: InjectionToken<AppConfig> = 'AppConfig';
