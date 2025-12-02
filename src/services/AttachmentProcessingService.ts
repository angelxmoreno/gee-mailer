import type { EmailMessageEntity, MessagePartEntity } from '@app/database/entities';
import { AttachmentRepository } from '@app/database/repositories';
import type { AttachmentDownloadPayload } from '@app/queues/types';
import { AppLogger } from '@app/utils/tokens';
import type { Logger } from 'pino';
import { inject, singleton } from 'tsyringe';

@singleton()
export class AttachmentProcessingService {
    protected logger: Logger;

    constructor(
        @inject(AppLogger) logger: Logger,
        @inject(AttachmentRepository) private attachmentRepo: AttachmentRepository
    ) {
        this.logger = logger;
    }

    /**
     * Process all message parts and extract attachments
     */
    async processMessageAttachments(
        userId: number,
        emailMessage: EmailMessageEntity,
        messageParts: MessagePartEntity[]
    ): Promise<void> {
        try {
            const attachmentParts = this.identifyAttachmentParts(messageParts);

            if (attachmentParts.length === 0) {
                this.logger.debug(
                    { userId, messageId: emailMessage.messageId },
                    'No attachments found in message parts'
                );
                return;
            }

            this.logger.debug(
                {
                    userId,
                    messageId: emailMessage.messageId,
                    attachmentCount: attachmentParts.length,
                },
                'Processing message attachments'
            );

            for (const part of attachmentParts) {
                await this.processAttachmentPart(userId, emailMessage.messageId, part);
            }

            this.logger.debug(
                {
                    userId,
                    messageId: emailMessage.messageId,
                    processedAttachments: attachmentParts.length,
                },
                'Completed attachment processing'
            );
        } catch (error) {
            this.logger.error(
                {
                    userId,
                    messageId: emailMessage.messageId,
                    error: error instanceof Error ? error.message : 'Unknown error',
                },
                'Failed to process message attachments'
            );
            throw error;
        }
    }

    /**
     * Identify which message parts are attachments
     */
    private identifyAttachmentParts(messageParts: MessagePartEntity[]): MessagePartEntity[] {
        return messageParts.filter((part) => {
            // Has a filename (most reliable indicator)
            if (part.filename && part.filename.trim()) {
                return true;
            }

            // Check for attachment-like MIME types without filename
            if (this.isAttachmentMimeType(part.mimeType)) {
                return true;
            }

            // Check for inline content that should be treated as attachment
            if (this.isInlineAttachment(part)) {
                return true;
            }

            return false;
        });
    }

    /**
     * Check if MIME type indicates an attachment
     */
    private isAttachmentMimeType(mimeType: string): boolean {
        const attachmentMimeTypes = [
            'application/',
            'image/',
            'audio/',
            'video/',
            'text/calendar',
            // Exclude text types that are typically message content
            // 'text/plain' and 'text/html' are usually message body
        ];

        // Exclude common body content types
        const excludedTypes = ['text/plain', 'text/html', 'multipart/'];

        if (excludedTypes.some((type) => mimeType.startsWith(type))) {
            return false;
        }

        return attachmentMimeTypes.some((type) => mimeType.startsWith(type));
    }

    /**
     * Check if this is an inline attachment (like embedded images)
     */
    private isInlineAttachment(part: MessagePartEntity): boolean {
        // Inline images or other media
        return (
            part.mimeType.startsWith('image/') ||
            part.mimeType.startsWith('audio/') ||
            part.mimeType.startsWith('video/')
        );
    }

    /**
     * Process a single attachment part
     */
    private async processAttachmentPart(userId: number, messageId: string, part: MessagePartEntity): Promise<void> {
        try {
            // Determine filename - use part filename or generate one
            const filename = this.determineFilename(part);

            // Determine if this is inline content
            const isInline = this.isInlineAttachment(part);

            // Create or update attachment record
            const attachment = await this.attachmentRepo.findOrCreate(
                userId,
                messageId,
                part.partId,
                filename,
                part.mimeType,
                part.sizeEstimate || 0,
                undefined, // contentId - could be extracted from headers if needed
                isInline
            );

            // Enqueue download job for the attachment
            await this.enqueueAttachmentDownload({
                userId,
                attachmentId: attachment.id,
                messageId,
                partId: part.partId,
                filename,
                mimeType: part.mimeType,
                sizeBytes: part.sizeEstimate || 0,
            });

            this.logger.debug(
                {
                    userId,
                    messageId,
                    partId: part.partId,
                    filename,
                    mimeType: part.mimeType,
                    size: part.sizeEstimate,
                    isInline,
                    attachmentId: attachment.id,
                },
                'Processed attachment part and enqueued download'
            );
        } catch (error) {
            this.logger.error(
                {
                    userId,
                    messageId,
                    partId: part.partId,
                    error: error instanceof Error ? error.message : 'Unknown error',
                },
                'Failed to process attachment part'
            );
            // Don't rethrow - continue processing other attachments
        }
    }

    /**
     * Determine appropriate filename for attachment
     */
    private determineFilename(part: MessagePartEntity): string {
        // Use provided filename if available
        if (part.filename && part.filename.trim()) {
            return part.filename.trim();
        }

        // Generate filename based on MIME type and part ID
        const extension = this.getExtensionFromMimeType(part.mimeType);
        return `attachment_${part.partId}${extension}`;
    }

    /**
     * Get file extension from MIME type
     */
    private getExtensionFromMimeType(mimeType: string): string {
        const mimeToExt: Record<string, string> = {
            'image/jpeg': '.jpg',
            'image/png': '.png',
            'image/gif': '.gif',
            'image/svg+xml': '.svg',
            'application/pdf': '.pdf',
            'application/zip': '.zip',
            'application/json': '.json',
            'application/xml': '.xml',
            'text/plain': '.txt',
            'text/csv': '.csv',
            'text/calendar': '.ics',
            'audio/mpeg': '.mp3',
            'audio/wav': '.wav',
            'video/mp4': '.mp4',
            'video/avi': '.avi',
        };

        return mimeToExt[mimeType] || '.dat';
    }

    /**
     * Get attachment statistics for a user
     */
    async getAttachmentStats(userId: number) {
        return this.attachmentRepo.getAttachmentStats(userId);
    }

    /**
     * Find attachments for a specific message
     */
    async getMessageAttachments(userId: number, messageId: string) {
        return this.attachmentRepo.findByMessageId(userId, messageId);
    }

    /**
     * Find large attachments above threshold
     */
    async getLargeAttachments(userId: number, sizeThresholdMb: number = 10, limit: number = 50) {
        return this.attachmentRepo.findLargeAttachments(userId, sizeThresholdMb, limit);
    }

    /**
     * Enqueue attachment download job
     */
    protected async enqueueAttachmentDownload(payload: AttachmentDownloadPayload): Promise<void> {
        try {
            const { Queue } = await import('bullmq');
            const attachmentQueue = new Queue('attachments', {
                connection: {
                    host: process.env.REDIS_HOST ?? 'localhost',
                    port: Number.parseInt(process.env.REDIS_PORT ?? '4379', 10),
                    password: process.env.REDIS_PASSWORD,
                    db: Number.parseInt(process.env.REDIS_DB ?? '0', 10),
                },
            });

            await attachmentQueue.add('downloadAttachment', payload, {
                removeOnComplete: 50,
                removeOnFail: 100,
                attempts: 3,
                backoff: { type: 'exponential', delay: 3000 },
            });

            this.logger.debug(
                {
                    userId: payload.userId,
                    attachmentId: payload.attachmentId,
                    messageId: payload.messageId,
                    partId: payload.partId,
                },
                'Enqueued attachment download job'
            );
        } catch (error) {
            this.logger.error(
                {
                    userId: payload.userId,
                    attachmentId: payload.attachmentId,
                    error: error instanceof Error ? error.message : 'Unknown error',
                },
                'Failed to enqueue attachment download job'
            );
            // Don't throw - attachment processing should continue even if queue fails
        }
    }
}
