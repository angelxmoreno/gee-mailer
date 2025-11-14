import { z } from 'zod';
import { LogLevel } from './LogLevel.ts';
import { NodeEnv } from './NodeEnv.ts';

export const AppConfigSchema = z.object({
    nodeEnv: z.object({
        env: z.enum([NodeEnv.development, NodeEnv.test, NodeEnv.production]),
        isDevelopment: z.boolean(),
        isTesting: z.boolean(),
    }),
    logger: z.object({
        usePretty: z.boolean().optional().default(true),
        level: z.enum(LogLevel).optional().default(LogLevel.info),
    }),
    cacheUrl: z.url().optional(),
});

export type AppConfig = z.infer<typeof AppConfigSchema>;
