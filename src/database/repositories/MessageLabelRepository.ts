import { MessageLabelEntity } from '@app/database/entities/MessageLabelEntity.ts';
import { BaseRepositoryService } from '@app/modules/typeorm/BaseRepositoryService';
import { inject, singleton } from 'tsyringe';
import { DataSource, In } from 'typeorm';

@singleton()
export class MessageLabelRepository extends BaseRepositoryService<MessageLabelEntity> {
    constructor(@inject(DataSource) dataSource: DataSource) {
        super(dataSource, MessageLabelEntity);
    }

    /**
     * Add labels to a message
     */
    async addLabelsToMessage(messageId: string, labelIds: string[], userId: number): Promise<void> {
        const entities = labelIds.map((labelId) => ({
            messageId,
            labelId,
            userId,
        }));

        await this.saveMany(entities);
    }

    /**
     * Remove labels from a message
     */
    async removeLabelsFromMessage(messageId: string, labelIds: string[], userId: number): Promise<void> {
        const entities = await this.repository.find({
            where: {
                messageId,
                labelId: labelIds.length > 0 ? In(labelIds) : undefined,
                userId,
            },
        });

        if (entities.length > 0) {
            await this.deleteMany(entities.map((e) => e.id));
        }
    }

    /**
     * Replace all labels for a message
     */
    async replaceMessageLabels(messageId: string, labelIds: string[], userId: number): Promise<void> {
        // Remove all existing labels for this message
        const existingLabels = await this.repository.find({
            where: { messageId, userId },
        });

        if (existingLabels.length > 0) {
            await this.deleteMany(existingLabels.map((e) => e.id));
        }

        // Add new labels
        if (labelIds.length > 0) {
            await this.addLabelsToMessage(messageId, labelIds, userId);
        }
    }

    /**
     * Get all labels for a message
     */
    async getMessageLabels(messageId: string, userId: number): Promise<string[]> {
        const entities = await this.repository.find({
            where: { messageId, userId },
        });

        return entities.map((e) => e.labelId);
    }
}
