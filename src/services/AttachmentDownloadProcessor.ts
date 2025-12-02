import { AttachmentRepository } from '@app/database/repositories';
import type { AttachmentDownloadPayload } from '@app/queues/types';
import { GmailService } from '@app/services/GmailService';
import { AppLogger } from '@app/utils/tokens';
import type { Logger } from 'pino';
import { inject, singleton } from 'tsyringe';

@singleton()
export class AttachmentDownloadProcessor {
    protected logger: Logger;

    constructor(
        @inject(AppLogger) logger: Logger,
        @inject(GmailService) private gmailService: GmailService,
        @inject(AttachmentRepository) private attachmentRepo: AttachmentRepository
    ) {
        this.logger = logger;
    }

    /**
     * Process attachment download job
     */
    async process(payload: AttachmentDownloadPayload): Promise<void> {
        const { userId, attachmentId, gmailAttachmentId, messageId, partId, filename, mimeType, sizeBytes } = payload;

        try {
            // Update status to downloading
            await this.attachmentRepo.updateDownloadStatus(attachmentId, 'downloading');

            this.logger.debug(
                {
                    userId,
                    attachmentId,
                    gmailAttachmentId,
                    messageId,
                    partId,
                    filename,
                    mimeType,
                    sizeBytes,
                },
                'Starting attachment download'
            );

            // Download attachment data from Gmail using Gmail's attachment ID
            const attachmentData = await this.gmailService.getAttachment(userId, messageId, gmailAttachmentId);

            if (!attachmentData?.data) {
                throw new Error('No attachment data received from Gmail API');
            }

            // TODO: Implement MinIO upload
            // For now, just store the download URL or mark as completed
            // In the future, this would:
            // 1. Upload to MinIO storage
            // 2. Generate presigned download URL
            // 3. Update attachment record with storage info

            // Mark as completed with download URL placeholder
            const downloadUrl = `attachment://${userId}/${messageId}/${partId}/${filename}`;
            await this.attachmentRepo.updateDownloadStatus(attachmentId, 'downloaded', downloadUrl);

            this.logger.info(
                {
                    userId,
                    attachmentId,
                    messageId,
                    partId,
                    filename,
                    downloadUrl,
                },
                'Attachment download completed'
            );
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown download error';

            // Mark as failed
            await this.attachmentRepo.updateDownloadStatus(attachmentId, 'failed', undefined, errorMessage);

            this.logger.error(
                {
                    userId,
                    attachmentId,
                    messageId,
                    partId,
                    filename,
                    error: errorMessage,
                },
                'Failed to download attachment'
            );

            throw error;
        }
    }
}
