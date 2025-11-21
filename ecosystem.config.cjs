module.exports = {
    apps: [
        {
            name: 'gee-mailer-api',
            script: 'src/index.ts',
            interpreter: 'bun',
            instances: process.env.API_INSTANCES || 'max',
            exec_mode: 'cluster',
            env: {
                NODE_ENV: 'development',
                PORT: 3000,
                WORKER_ENABLED: false, // Disable workers in API process
            },
            env_production: {
                NODE_ENV: 'production',
                PORT: 3000,
                WORKER_ENABLED: false,
            },
            error_file: './logs/api-error.log',
            out_file: './logs/api-out.log',
            log_file: './logs/api-combined.log',
            time: true,
            max_restarts: 10,
            min_uptime: '10s',
            kill_timeout: 30000,
        },
        {
            name: 'gee-mailer-workers',
            script: 'src/workers.ts',
            interpreter: 'bun',
            // WORKER_INSTANCES should be tuned for workload, not just queue count
            instances: process.env.WORKER_INSTANCES || 4,
            exec_mode: 'cluster',
            env: {
                NODE_ENV: 'development',
                WORKER_ENABLED: true,
                // Worker processes automatically discover and run all defined workers
            },
            env_production: {
                NODE_ENV: 'production',
                WORKER_ENABLED: true,
            },
            error_file: './logs/workers-error.log',
            out_file: './logs/workers-out.log',
            log_file: './logs/workers-combined.log',
            time: true,
            max_restarts: 10,
            min_uptime: '10s',
            kill_timeout: 30000,
            // Worker-specific settings
            watch: false, // Don't watch for file changes in production workers
            ignore_watch: ['node_modules', 'logs'],
            // Graceful shutdown for workers
            listen_timeout: 5000,
        },
    ],
};
