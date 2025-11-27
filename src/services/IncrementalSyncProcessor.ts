import type { EmailMessageEntity } from '@app/database/entities';
import { EmailMessagesRepository, MessageLabelRepository, SyncProgressRepository } from '@app/database/repositories';
import type { MessageBatchPayload } from '@app/queues/types.ts';
import { GmailService } from '@app/services/GmailService.ts';
import { SyncStateService } from '@app/services/SyncStateService.ts';
import { inject, singleton } from 'tsyringe';
import { In } from 'typeorm';

@singleton()
export class IncrementalSyncProcessor {
    protected gmailService: GmailService;
    protected syncProgressRepo: SyncProgressRepository;
    protected emailMessagesRepo: EmailMessagesRepository;
    protected messageLabelRepo: MessageLabelRepository;
    protected syncStateService: SyncStateService;

    constructor(
        @inject(GmailService) gmailService: GmailService,
        @inject(SyncProgressRepository) syncProgressRepo: SyncProgressRepository,
        @inject(EmailMessagesRepository) emailMessagesRepo: EmailMessagesRepository,
        @inject(MessageLabelRepository) messageLabelRepo: MessageLabelRepository,
        @inject(SyncStateService) syncStateService: SyncStateService
    ) {
        this.gmailService = gmailService;
        this.syncProgressRepo = syncProgressRepo;
        this.emailMessagesRepo = emailMessagesRepo;
        this.messageLabelRepo = messageLabelRepo;
        this.syncStateService = syncStateService;
    }

    async process(userId: number, enqueueMessageBatch: (payload: MessageBatchPayload) => Promise<void>) {
        try {
            // Create sync progress tracking
            const syncProgress = await this.syncProgressRepo.createSyncProgress(userId, 'incremental');

            // Get current user sync state to get historyId
            const syncState = await this.syncStateService.getUserSyncState(userId);
            if (!syncState.canIncrementalSync || !syncState.user?.historyId) {
                throw new Error('User cannot perform incremental sync - missing historyId or incomplete initial sync');
            }

            // Fetch history changes from Gmail using history API
            const historyResponse = await this.gmailService.fetchHistory(syncState.user.historyId);

            // Extract and process all changes from history
            const messageEntities: Array<Partial<EmailMessageEntity>> = [];
            const deletedMessageIds: string[] = [];
            const labelChanges: Array<{ messageId: string; addedLabels: string[]; removedLabels: string[] }> = [];

            for (const historyItem of historyResponse.data) {
                // Process messagesAdded from history
                if (historyItem.messagesAdded) {
                    for (const addedItem of historyItem.messagesAdded) {
                        if (addedItem.message?.id) {
                            messageEntities.push({
                                userId,
                                messageId: addedItem.message.id,
                                threadId: addedItem.message.threadId,
                            });
                        }
                    }
                }

                // Process messagesDeleted from history
                if (historyItem.messagesDeleted) {
                    for (const deletedItem of historyItem.messagesDeleted) {
                        if (deletedItem.message?.id) {
                            deletedMessageIds.push(deletedItem.message.id);
                        }
                    }
                }

                // Process labelsAdded from history
                if (historyItem.labelsAdded) {
                    for (const labelAddedItem of historyItem.labelsAdded) {
                        if (labelAddedItem.message?.id && labelAddedItem.labelIds) {
                            const existingChange = labelChanges.find(
                                (lc) => lc.messageId === labelAddedItem.message?.id
                            );
                            if (existingChange) {
                                existingChange.addedLabels.push(...labelAddedItem.labelIds);
                            } else {
                                labelChanges.push({
                                    messageId: labelAddedItem.message.id,
                                    addedLabels: [...labelAddedItem.labelIds],
                                    removedLabels: [],
                                });
                            }
                        }
                    }
                }

                // Process labelsRemoved from history
                if (historyItem.labelsRemoved) {
                    for (const labelRemovedItem of historyItem.labelsRemoved) {
                        if (labelRemovedItem.message?.id && labelRemovedItem.labelIds) {
                            const existingChange = labelChanges.find(
                                (lc) => lc.messageId === labelRemovedItem.message?.id
                            );
                            if (existingChange) {
                                existingChange.removedLabels.push(...labelRemovedItem.labelIds);
                            } else {
                                labelChanges.push({
                                    messageId: labelRemovedItem.message.id,
                                    addedLabels: [],
                                    removedLabels: [...labelRemovedItem.labelIds],
                                });
                            }
                        }
                    }
                }
            }

            // Apply all changes
            if (messageEntities.length > 0) {
                await this.emailMessagesRepo.saveMessages(messageEntities);
            }

            // Soft delete removed messages
            if (deletedMessageIds.length > 0) {
                const messagesToDelete = await this.emailMessagesRepo.repository.find({
                    where: { messageId: In(deletedMessageIds), userId },
                });
                if (messagesToDelete.length > 0) {
                    await this.emailMessagesRepo.deleteMany(messagesToDelete.map((m) => m.id));
                }
            }

            // Apply label changes
            for (const labelChange of labelChanges) {
                if (labelChange.addedLabels.length > 0) {
                    await this.messageLabelRepo.addLabelsToMessage(
                        labelChange.messageId,
                        labelChange.addedLabels,
                        userId
                    );
                }
                if (labelChange.removedLabels.length > 0) {
                    await this.messageLabelRepo.removeLabelsFromMessage(
                        labelChange.messageId,
                        labelChange.removedLabels,
                        userId
                    );
                }
            }

            // Use historyId from the response, or fall back to getCurrentHistoryId if not available
            const latestHistoryId = historyResponse.historyId || (await this.gmailService.getCurrentHistoryId());

            // Start message batch processing for new messages
            if (messageEntities.length > 0) {
                await enqueueMessageBatch({
                    userId,
                    batchSize: 25, // Smaller batch size for incremental
                    syncType: 'incremental',
                    syncProgressId: syncProgress.id,
                    lastIncrementalSyncAt: syncState.user.lastIncrementalSyncAt || undefined,
                });
            }

            const totalChanges = messageEntities.length + deletedMessageIds.length + labelChanges.length;

            // Update sync progress and user state
            await this.syncProgressRepo.updateProgress(syncProgress, {
                numTotal: totalChanges,
                status: messageEntities.length > 0 ? 'in_progress' : 'completed',
            });

            // Update user's historyId and last incremental sync time only after successful processing
            await this.syncStateService.updateUserSyncState(userId, {
                historyId: latestHistoryId,
                lastIncrementalSyncAt: new Date(),
            });

            if (messageEntities.length === 0) {
                await this.syncProgressRepo.markCompleted(syncProgress);
            }

            return {
                userId,
                action: messageEntities.length > 0 ? 'started' : 'completed',
                newMessages: messageEntities.length,
                deletedMessages: deletedMessageIds.length,
                labelChanges: labelChanges.length,
                totalChanges,
                syncProgressId: syncProgress.id,
            };
        } catch (error) {
            // Note: syncProgress may not be created if error occurs early
            console.error(
                { userId, error: error instanceof Error ? error.message : 'Unknown error' },
                'Incremental sync failed'
            );
            throw error;
        }
    }
}
