import { z } from 'zod';
import { LogLevel } from './LogLevel';
import { NodeEnv } from './NodeEnv';

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
    dbUrl: z.url(),
    google: z.object({
        clientId: z.string(),
        clientSecret: z.string(),
    }),
    workers: z
        .object({
            enabled: z.boolean().default(true),
            gracefulShutdownTimeout: z.number().default(30000), // 30 seconds
            healthCheckInterval: z.number().default(30000), // 30 seconds
            autoRestart: z.boolean().default(true),
        })
        .default({
            enabled: true,
            gracefulShutdownTimeout: 30000,
            healthCheckInterval: 30000,
            autoRestart: true,
        }),
});

export type AppConfig = z.infer<typeof AppConfigSchema>;
