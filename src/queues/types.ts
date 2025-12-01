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
    lastIncrementalSyncAt: z.coerce.date().optional(), // For incremental sync filtering
});

export const LabelSyncSchema = UserIdentifier;

export const AttachmentDownloadSchema = UserIdentifier.extend({
    attachmentId: z.number(),
    messageId: z.string(),
    partId: z.string(),
    filename: z.string(),
    mimeType: z.string(),
    sizeBytes: z.number(),
});

// Type inference for better TypeScript support
export type UserIdentifierPayload = z.infer<typeof UserIdentifier>;
export type InitialSyncPayload = z.infer<typeof InitialSyncSchema>;
export type IncrementalSyncPayload = z.infer<typeof IncrementalSyncSchema>;
export type MessageBatchPayload = z.infer<typeof MessageBatchSchema>;
export type LabelSyncPayload = z.infer<typeof LabelSyncSchema>;
export type AttachmentDownloadPayload = z.infer<typeof AttachmentDownloadSchema>;
