import { Queue } from 'bullmq';
import queueConfig from '../queueDefinitions';

export const emailSendQueue = new Queue('emailSend', {
    ...queueConfig.queues.emailSend.options,
    connection: queueConfig.connection,
});

export const dbOperationsQueue = new Queue('dbOperations', {
    ...queueConfig.queues.dbOperations.options,
    connection: queueConfig.connection,
});
