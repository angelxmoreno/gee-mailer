import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { AppConfig } from '@app/types/AppConfig';
import pino from 'pino';

const ensureLogsDirectory = (): string => {
    const logsDir = join(process.cwd(), 'logs');

    try {
        if (!existsSync(logsDir)) {
            mkdirSync(logsDir, { recursive: true });
        }
        return logsDir;
    } catch (error) {
        console.warn('Failed to create logs directory, falling back to stdout:', error);
        return '';
    }
};

export const createBaseLogger = (config: AppConfig) => {
    const { usePretty, level } = config.logger;
    const logsDir = ensureLogsDirectory();

    // For self-hosted deployments, simpler logging is often better
    const targets = [];

    // Console/pretty output for development or when file logging fails
    if (usePretty || !logsDir) {
        targets.push({
            target: 'pino-pretty',
            options: {
                destination: 2, // stderr
                colorize: usePretty,
                translateTime: 'SYS:standard',
                ignore: 'pid,hostname',
            },
            level,
        });
    }

    // Single log file for production (easier for self-hosted deployments)
    if (logsDir && !usePretty) {
        targets.push({
            target: 'pino/file',
            options: {
                destination: join(logsDir, 'app.log'),
                mkdir: true,
            },
            level,
        });
    }

    return pino({
        level, // Use configured log level
        transport: targets.length > 0 ? { targets } : undefined,
    });
};
