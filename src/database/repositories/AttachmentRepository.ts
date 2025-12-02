import { AttachmentEntity } from '@app/database/entities/AttachmentEntity.ts';
import { BaseRepositoryService } from '@app/modules/typeorm/BaseRepositoryService';
import { inject, singleton } from 'tsyringe';
import { DataSource } from 'typeorm';

@singleton()
export class AttachmentRepository extends BaseRepositoryService<AttachmentEntity> {
    constructor(@inject(DataSource) dataSource: DataSource) {
        super(dataSource, AttachmentEntity);
    }

    /**
     * Find or create an attachment record using atomic upsert
     */
    async findOrCreate(
        userId: number,
        messageId: string,
        partId: string,
        filename: string,
        mimeType: string,
        sizeBytes: number,
        contentId?: string,
        isInline: boolean = false
    ): Promise<AttachmentEntity> {
        const attachmentData = {
            userId,
            messageId,
            partId,
            filename,
            mimeType,
            sizeBytes,
            contentId: contentId || null,
            isInline,
            status: 'pending' as const,
        };

        // Use atomic upsert to prevent race conditions and update existing records
        await this.repository.upsert(attachmentData, ['userId', 'messageId', 'partId']);

        // Return the created/updated attachment
        const attachment = await this.repository.findOneByOrFail({
            userId,
            messageId,
            partId,
        });

        return attachment;
    }

    /**
     * Get attachments for a specific message
     */
    async findByMessageId(userId: number, messageId: string): Promise<AttachmentEntity[]> {
        return this.repository.find({
            where: { userId, messageId },
            order: { filename: 'ASC' },
            relations: ['messagePart'],
        });
    }

    /**
     * Get attachments by status
     */
    async findByStatus(
        userId: number,
        status: 'pending' | 'downloading' | 'downloaded' | 'failed',
        limit: number = 50
    ): Promise<AttachmentEntity[]> {
        return this.repository.find({
            where: { userId, status },
            order: { createdAt: 'ASC' },
            take: limit,
        });
    }

    /**
     * Get attachments by MIME type
     */
    async findByMimeType(userId: number, mimeType: string, limit: number = 100): Promise<AttachmentEntity[]> {
        return this.repository.find({
            where: { userId, mimeType },
            order: { createdAt: 'DESC' },
            take: limit,
        });
    }

    /**
     * Update download status
     */
    async updateDownloadStatus(
        userId: number,
        attachmentId: number,
        status: 'downloading' | 'downloaded' | 'failed',
        downloadUrl?: string,
        errorMessage?: string
    ): Promise<void> {
        const updateData: {
            status: 'downloading' | 'downloaded' | 'failed';
            downloadedAt: Date | null;
            downloadUrl?: string;
            errorMessage?: string;
        } = {
            status,
            downloadedAt: status === 'downloaded' ? new Date() : null,
        };

        if (downloadUrl) {
            updateData.downloadUrl = downloadUrl;
        }

        if (errorMessage) {
            updateData.errorMessage = errorMessage;
        }

        await this.repository.update({ id: attachmentId, userId }, updateData);
    }

    /**
     * Get attachment statistics for a user
     */
    async getAttachmentStats(userId: number): Promise<{
        totalCount: number;
        totalSizeBytes: number;
        downloadedCount: number;
        pendingCount: number;
        failedCount: number;
        topMimeTypes: Array<{ mimeType: string; count: number }>;
    }> {
        const stats = await this.repository
            .createQueryBuilder('attachment')
            .select([
                'COUNT(*) as total_count',
                'SUM(attachment.sizeBytes) as total_size_bytes',
                "COUNT(CASE WHEN attachment.status = 'downloaded' THEN 1 END) as downloaded_count",
                "COUNT(CASE WHEN attachment.status = 'pending' THEN 1 END) as pending_count",
                "COUNT(CASE WHEN attachment.status = 'failed' THEN 1 END) as failed_count",
            ])
            .where('attachment.userId = :userId', { userId })
            .getRawOne();

        const mimeTypeStats = await this.repository
            .createQueryBuilder('attachment')
            .select(['attachment.mimeType as mime_type', 'COUNT(*) as count'])
            .where('attachment.userId = :userId', { userId })
            .groupBy('attachment.mimeType')
            .orderBy('count', 'DESC')
            .limit(10)
            .getRawMany();

        return {
            totalCount: Number.parseInt(stats.total_count, 10) || 0,
            totalSizeBytes: Number.parseInt(stats.total_size_bytes, 10) || 0,
            downloadedCount: Number.parseInt(stats.downloaded_count, 10) || 0,
            pendingCount: Number.parseInt(stats.pending_count, 10) || 0,
            failedCount: Number.parseInt(stats.failed_count, 10) || 0,
            topMimeTypes: mimeTypeStats.map((stat) => ({
                mimeType: stat.mime_type,
                count: Number.parseInt(stat.count, 10),
            })),
        };
    }

    /**
     * Find large attachments above size threshold
     */
    async findLargeAttachments(
        userId: number,
        sizeThresholdMb: number = 10,
        limit: number = 50
    ): Promise<AttachmentEntity[]> {
        const sizeThresholdBytes = sizeThresholdMb * 1024 * 1024; // Convert MB to bytes

        return this.repository
            .createQueryBuilder('attachment')
            .where('attachment.userId = :userId', { userId })
            .andWhere('attachment.sizeBytes >= :sizeThreshold', { sizeThreshold: sizeThresholdBytes })
            .orderBy('attachment.sizeBytes', 'DESC')
            .take(limit)
            .getMany();
    }
}
