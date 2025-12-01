import type { DisplayNameEntity, EmailAddressEntity, EmailMessageEntity } from '@app/database/entities';
import {
    DisplayNameRepository,
    EmailAddressRepository,
    EmailAddressUsageRepository,
    EmailContactRepository,
} from '@app/database/repositories';
import { AppLogger } from '@app/utils/tokens';
import type { Logger } from 'pino';
import { inject, singleton } from 'tsyringe';

export interface EmailHeaderData {
    email: string;
    displayName?: string;
    headerType: 'from' | 'to' | 'cc' | 'bcc';
}

@singleton()
export class ContactProcessingService {
    protected logger: Logger;

    constructor(
        @inject(AppLogger) logger: Logger,
        @inject(EmailContactRepository) private emailContactRepo: EmailContactRepository,
        @inject(EmailAddressRepository) private emailAddressRepo: EmailAddressRepository,
        @inject(DisplayNameRepository) private displayNameRepo: DisplayNameRepository,
        @inject(EmailAddressUsageRepository) private usageRepo: EmailAddressUsageRepository
    ) {
        this.logger = logger;
    }

    /**
     * Process all email headers from an email message
     */
    async processEmailHeaders(userId: number, emailMessageId: number, headers: EmailHeaderData[]): Promise<void> {
        try {
            this.logger.debug(
                {
                    userId,
                    emailMessageId,
                    headerCount: headers.length,
                },
                'Processing email headers for contact extraction'
            );

            for (const header of headers) {
                await this.processEmailHeader(userId, emailMessageId, header);
            }

            this.logger.debug(
                {
                    userId,
                    emailMessageId,
                    processedHeaders: headers.length,
                },
                'Completed email header processing'
            );
        } catch (error) {
            this.logger.error(
                {
                    userId,
                    emailMessageId,
                    error: error instanceof Error ? error.message : 'Unknown error',
                },
                'Failed to process email headers'
            );
            throw error;
        }
    }

    /**
     * Process a single email header
     */
    private async processEmailHeader(userId: number, emailMessageId: number, header: EmailHeaderData): Promise<void> {
        try {
            // Skip if usage already exists for this message
            const usageExists = await this.usageRepo.existsForMessage(
                userId,
                0, // We'll update this after finding/creating the address
                emailMessageId
            );

            if (usageExists) {
                this.logger.debug(
                    { userId, emailMessageId, email: header.email },
                    'Usage record already exists for this email/message combination'
                );
                return;
            }

            // 1. Find or create email address
            const emailAddress = await this.emailAddressRepo.findOrCreate(userId, header.email);

            // Check again with the actual email address ID
            const actualUsageExists = await this.usageRepo.existsForMessage(userId, emailAddress.id, emailMessageId);

            if (actualUsageExists) {
                return;
            }

            // 2. Find or create display name (if provided)
            let displayName: DisplayNameEntity | undefined;
            if (header.displayName?.trim()) {
                displayName = await this.displayNameRepo.findOrCreate(
                    userId,
                    emailAddress.id,
                    header.displayName.trim()
                );
            }

            // 3. Create usage record
            await this.usageRepo.createUsage(
                userId,
                emailAddress.id,
                emailMessageId,
                header.headerType,
                displayName?.id
            );

            // 4. Ensure contact exists for this email address
            if (!emailAddress.contactId) {
                await this.createContactForEmailAddress(userId, emailAddress, displayName);
            }

            this.logger.debug(
                {
                    userId,
                    emailAddress: header.email,
                    displayName: header.displayName,
                    headerType: header.headerType,
                    hasContact: !!emailAddress.contactId,
                },
                'Processed email header successfully'
            );
        } catch (error) {
            this.logger.error(
                {
                    userId,
                    emailMessageId,
                    email: header.email,
                    error: error instanceof Error ? error.message : 'Unknown error',
                },
                'Failed to process individual email header'
            );
            throw error;
        }
    }

    /**
     * Create a new contact for an email address
     */
    private async createContactForEmailAddress(
        userId: number,
        emailAddress: EmailAddressEntity,
        primaryDisplayName?: DisplayNameEntity
    ): Promise<void> {
        try {
            const contact = await this.emailContactRepo.createForEmailAddress(
                userId,
                emailAddress.id,
                primaryDisplayName?.id
            );

            // Update email address to reference the contact
            await this.emailAddressRepo.updateContactId(emailAddress.id, contact.id, true);

            this.logger.debug(
                {
                    userId,
                    contactId: contact.id,
                    emailAddress: emailAddress.emailAddress,
                    primaryDisplayName: primaryDisplayName?.displayName,
                },
                'Created new contact for email address'
            );
        } catch (error) {
            this.logger.error(
                {
                    userId,
                    emailAddress: emailAddress.emailAddress,
                    error: error instanceof Error ? error.message : 'Unknown error',
                },
                'Failed to create contact for email address'
            );
            throw error;
        }
    }

    /**
     * Extract email headers from EmailMessageEntity
     * This is a helper method for processing existing emails
     */
    extractHeadersFromEmailMessage(emailMessage: EmailMessageEntity): EmailHeaderData[] {
        const headers: EmailHeaderData[] = [];

        try {
            // Process header entities to extract email addresses
            if (emailMessage.headers && Array.isArray(emailMessage.headers)) {
                for (const header of emailMessage.headers) {
                    const headerName = header.name?.toLowerCase();
                    if (headerName && ['from', 'to', 'cc', 'bcc'].includes(headerName) && header.value) {
                        const emailAddresses = this.parseEmailAddresses(header.value);
                        for (const emailData of emailAddresses) {
                            headers.push({
                                email: emailData.email,
                                displayName: emailData.displayName,
                                headerType: headerName as 'from' | 'to' | 'cc' | 'bcc',
                            });
                        }
                    }
                }
            }
        } catch (error) {
            this.logger.error(
                {
                    emailMessageId: emailMessage.id,
                    error: error instanceof Error ? error.message : 'Unknown error',
                },
                'Failed to extract headers from email message'
            );
        }

        return headers;
    }

    /**
     * Parse email addresses from a header value string
     * Handles formats like: "John Doe <john@example.com>", "john@example.com", "John <john@example.com>, Jane <jane@example.com>"
     */
    private parseEmailAddresses(headerValue: string): Array<{ email: string; displayName?: string }> {
        const result: Array<{ email: string; displayName?: string }> = [];

        try {
            // Split by comma for multiple addresses
            const addresses = headerValue.split(',').map((addr) => addr.trim());

            for (const address of addresses) {
                // Match patterns like "Display Name <email@domain.com>" or just "email@domain.com"
                const nameEmailMatch = address.match(/^(.*?)\s*<(.+?)>$/);
                if (nameEmailMatch) {
                    const displayName = nameEmailMatch[1]?.trim().replace(/^["']|["']$/g, ''); // Remove quotes
                    const email = nameEmailMatch[2]?.trim();
                    if (email && this.isValidEmail(email)) {
                        result.push({
                            email,
                            displayName: displayName || undefined,
                        });
                    }
                } else {
                    // Just an email address without display name
                    const email = address.trim();
                    if (this.isValidEmail(email)) {
                        result.push({ email });
                    }
                }
            }
        } catch (error) {
            this.logger.warn(
                {
                    headerValue,
                    error: error instanceof Error ? error.message : 'Unknown error',
                },
                'Failed to parse email addresses from header'
            );
        }

        return result;
    }

    /**
     * Basic email validation
     */
    private isValidEmail(email: string): boolean {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }

    /**
     * Process contacts from an existing EmailMessageEntity
     */
    async processEmailMessageContacts(userId: number, emailMessage: EmailMessageEntity): Promise<void> {
        const headers = this.extractHeadersFromEmailMessage(emailMessage);
        if (headers.length > 0) {
            await this.processEmailHeaders(userId, emailMessage.id, headers);
        }
    }

    /**
     * Get contact statistics for a user
     */
    async getContactStats(userId: number): Promise<{
        totalContacts: number;
        totalEmailAddresses: number;
        totalDisplayNames: number;
        totalUsages: number;
    }> {
        const [contactCount, emailAddressCount, displayNameCount, usageCount] = await Promise.all([
            this.emailContactRepo.count({ userId }),
            this.emailAddressRepo.count({ userId }),
            this.displayNameRepo.count({ userId }),
            this.usageRepo.count({ userId }),
        ]);

        return {
            totalContacts: contactCount,
            totalEmailAddresses: emailAddressCount,
            totalDisplayNames: displayNameCount,
            totalUsages: usageCount,
        };
    }
}
