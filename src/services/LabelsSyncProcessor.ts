import type { LabelEntity } from '@app/database/entities/LabelEntity.ts';
import { LabelsRepository } from '@app/database/repositories';
import { GmailService } from '@app/services/GmailService.ts';
import { SyncStateService } from '@app/services/SyncStateService.ts';
import { inject, singleton } from 'tsyringe';

@singleton()
export class LabelsSyncProcessor {
    protected gmailService: GmailService;
    protected labelsRepo: LabelsRepository;
    protected syncStateService: SyncStateService;

    constructor(
        @inject(GmailService) gmailService: GmailService,
        @inject(LabelsRepository) labelsRepo: LabelsRepository,
        @inject(SyncStateService) syncStateService: SyncStateService
    ) {
        this.gmailService = gmailService;
        this.labelsRepo = labelsRepo;
        this.syncStateService = syncStateService;
    }

    async process(userId: number) {
        // Fetch labels from Gmail API
        const labelsResponse = await this.gmailService.fetchLabels();

        // Get current labels from database to track what to remove
        const existingLabels = await this.labelsRepo.findMany({ userId });
        const currentLabelIds = new Set();

        let labelsProcessed = 0;

        // Process and save labels
        if (labelsResponse.data) {
            const labelEntities: Array<Partial<LabelEntity>> = [];

            for (const gmailLabel of labelsResponse.data) {
                if (gmailLabel.id) {
                    currentLabelIds.add(gmailLabel.id);

                    labelEntities.push({
                        userId,
                        labelId: gmailLabel.id,
                        name: gmailLabel.name || '',
                        type: (gmailLabel.type as 'system' | 'user') || 'user',
                        messageListVisibility: gmailLabel.messageListVisibility !== 'hide',
                        labelListVisibility: gmailLabel.labelListVisibility !== 'labelHide',
                    });
                    labelsProcessed++;
                }
            }

            if (labelEntities.length > 0) {
                await this.labelsRepo.saveMany(labelEntities);
            }
        }

        // Remove labels that no longer exist in Gmail
        const labelsToRemove = existingLabels.filter((label) => !currentLabelIds.has(label.labelId));

        let labelsRemoved = 0;
        for (const labelToRemove of labelsToRemove) {
            await this.labelsRepo.remove(labelToRemove.id);
            labelsRemoved++;
        }

        // Mark label sync as completed for user
        await this.syncStateService.updateUserSyncState(userId, {
            labelSyncCompleted: true,
        });

        return {
            userId,
            labelsProcessed,
            labelsRemoved,
            action: 'completed',
        };
    }
}
