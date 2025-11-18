import { Worker } from 'bullmq';
import queueConfig from '../queueDefinitions';

export const afterSignUpEmailWorker = new Worker(
    'emailSend',
    queueConfig.queues.emailSend.workers.afterSignUpEmail.processor,
    {
        ...queueConfig.queues.emailSend.workers.afterSignUpEmail.options,
        connection: queueConfig.connection,
    }
);

export const dbCleanUpWorker = new Worker('dbOperations', queueConfig.queues.dbOperations.workers.dbCleanUp.processor, {
    ...queueConfig.queues.dbOperations.workers.dbCleanUp.options,
    connection: queueConfig.connection,
});
