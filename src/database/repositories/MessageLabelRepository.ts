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
    async addLabelsToMessage(messageId: number, labelIds: number[], userId: number): Promise<void> {
        if (labelIds.length === 0) {
            return;
        }

        const entities = labelIds.map((labelId) => ({
            messageId,
            labelId,
            userId,
        }));

        // Use upsert to handle duplicates gracefully
        await this.repository.upsert(entities, ['messageId', 'labelId']);
    }

    /**
     * Remove labels from a message
     */
    async removeLabelsFromMessage(messageId: number, labelIds: number[], userId: number): Promise<void> {
        if (labelIds.length === 0) {
            return;
        }

        const entities = await this.repository.find({
            where: {
                messageId,
                labelId: In(labelIds),
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
    async replaceMessageLabels(messageId: number, labelIds: number[], userId: number): Promise<void> {
        await this.repository.manager.transaction(async (manager) => {
            const repo = manager.getRepository(MessageLabelEntity);

            // Hard delete all existing labels for this message to avoid soft-delete conflicts
            await repo.delete({ messageId, userId });

            // Add new labels
            if (labelIds.length > 0) {
                const entities = labelIds.map((labelId) => ({
                    messageId,
                    labelId,
                    userId,
                }));
                await repo.insert(entities);
            }
        });
    }

    /**
     * Get all labels for a message
     */
    async getMessageLabels(messageId: number, userId: number): Promise<number[]> {
        const entities = await this.repository.find({
            where: { messageId, userId },
        });

        return entities.map((e) => e.labelId);
    }
}
