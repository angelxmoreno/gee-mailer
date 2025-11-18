import type { z } from 'zod';
import queueConfig from '../queueDefinitions';
import { dbOperationsQueue, emailSendQueue } from './queues';

export const enqueueAfterSignUpEmail = async (
    data: z.infer<typeof queueConfig.queues.emailSend.workers.afterSignUpEmail.schema>
) => {
    // Validate with schema
    const validatedData = queueConfig.queues.emailSend.workers.afterSignUpEmail.schema.parse(data);

    // Add to queue with validated data
    return await emailSendQueue.add('afterSignUpEmail', validatedData);
};

export const enqueueDbCleanUp = async () => {
    return await dbOperationsQueue.add('dbCleanUp', undefined);
};
