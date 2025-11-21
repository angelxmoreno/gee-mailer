import { z } from 'zod';

// Reusable base schemas
export const UserIdentifier = z.object({
    userId: z.number(),
});

// Gmail sync job schemas
export const InitialSyncSchema = UserIdentifier;

export const IncrementalSyncSchema = UserIdentifier;

export const MessageBatchSchema = UserIdentifier.extend({
    batchSize: z.number().default(50),
    syncProgressId: z.number().optional(),
    syncType: z.enum(['initial', 'incremental']),
    lastIncrementalSyncAt: z.date().optional(), // For incremental sync filtering
});

export const LabelSyncSchema = UserIdentifier;

// Type inference for better TypeScript support
export type UserIdentifierPayload = z.infer<typeof UserIdentifier>;
export type InitialSyncPayload = z.infer<typeof InitialSyncSchema>;
export type IncrementalSyncPayload = z.infer<typeof IncrementalSyncSchema>;
export type MessageBatchPayload = z.infer<typeof MessageBatchSchema>;
export type LabelSyncPayload = z.infer<typeof LabelSyncSchema>;
