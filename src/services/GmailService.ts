import { UsersRepository } from '@app/database/repositories';
import { CurrentUserService } from '@app/services/CurrentUserService';
import { cacheKeyGenerator } from '@app/utils/cacheKeyGenerator.ts';
import { AppLogger } from '@app/utils/tokens';
import { type gmail_v1, google } from 'googleapis';
import type { Logger } from 'pino';
import { TaggedKeyv } from 'tagged-keyv-wrapper';
import { inject, singleton } from 'tsyringe';

type Gmail = gmail_v1.Gmail;
export type MessageListResponse = gmail_v1.Schema$ListMessagesResponse;
export type MessageResponse = gmail_v1.Schema$Message;
export type ProfileResponse = gmail_v1.Schema$Profile;

@singleton()
export class GmailService {
    protected logger: Logger;
    protected cache: TaggedKeyv;
    protected currentUserService: CurrentUserService;
    protected usersRepository: UsersRepository;

    constructor(
        @inject(AppLogger) logger: Logger,
        @inject(TaggedKeyv) cache: TaggedKeyv,
        @inject(CurrentUserService) currentUserService: CurrentUserService,
        @inject(UsersRepository) usersRepository: UsersRepository
    ) {
        this.logger = logger;
        this.cache = cache;
        this.currentUserService = currentUserService;
        this.usersRepository = usersRepository;
    }

    /**
     * Creates a Gmail client for the current user
     */
    protected async createGmailClient(): Promise<Gmail> {
        const currentUser = await this.currentUserService.getCurrentUserWithValidToken();

        const oauth2Client = new google.auth.OAuth2();

        // Handle tokenExpiryDate as either Date object or string
        let expiryTime: number | undefined;
        if (currentUser.tokenExpiryDate) {
            let dateValue: Date;

            dateValue =
                typeof currentUser.tokenExpiryDate === 'string'
                    ? new Date(currentUser.tokenExpiryDate)
                    : currentUser.tokenExpiryDate;
            // Ensure the date is valid before getting time
            if (!Number.isNaN(dateValue.getTime())) {
                expiryTime = dateValue.getTime();
            } else {
                this.logger.warn(
                    { tokenExpiryDate: currentUser.tokenExpiryDate },
                    'Invalid tokenExpiryDate encountered, treating as undefined.'
                );
            }
        }

        oauth2Client.setCredentials({
            access_token: currentUser.accessToken,
            refresh_token: currentUser.refreshToken,
            expiry_date: expiryTime,
        });

        return google.gmail({
            version: 'v1',
            auth: oauth2Client,
        });
    }

    async fetchMessageList(pageToken?: string | null): Promise<{ data: MessageListResponse }> {
        const gmail = await this.createGmailClient();
        const currentUser = await this.currentUserService.getCurrentUserOrFail();
        const cacheKey = cacheKeyGenerator(['fetchMessageList', currentUser.id, pageToken || 'first-page']);
        const cache = (await this.cache.get(cacheKey)) as MessageListResponse | undefined;

        if (cache) {
            this.logger.debug({ userId: currentUser.id, pageToken }, 'Message list fetched from cache');
            return { data: cache };
        }
        this.logger.debug({ userId: currentUser.id, pageToken }, 'Fetching message list for current user');

        const results = await gmail.users.messages.list({
            userId: 'me',
            maxResults: 500,
            pageToken: pageToken || undefined,
        });

        this.logger.info(
            {
                userId: currentUser.id,
                messageCount: results.data.messages?.length || 0,
                nextPageToken: results.data.nextPageToken,
            },
            'Message list fetched successfully'
        );
        // Use TaggedKeyv to tag cache entries for easier bulk deletion
        await this.cache.set(cacheKey, results.data, 60 * 5 * 1000, [`user:${currentUser.id}`, 'messageList']);
        return { data: results.data };
    }

    /**
     * Fetch detailed message by ID
     */
    async fetchMessage(messageId: string): Promise<{ data: MessageResponse }> {
        const gmail = await this.createGmailClient();
        const currentUser = await this.currentUserService.getCurrentUserOrFail();
        const cacheKey = cacheKeyGenerator(['fetchMessage', currentUser.id, messageId]);
        const cache = (await this.cache.get(cacheKey)) as MessageResponse | undefined;

        if (cache) {
            this.logger.debug({ userId: currentUser.id, messageId }, 'Message details fetched from cache');
            return { data: cache };
        }

        this.logger.debug({ userId: currentUser.id, messageId }, 'Fetching message details');

        const result = await gmail.users.messages.get({
            userId: 'me',
            id: messageId,
            format: 'full',
        });

        // Cache for 30 minutes (messages don't change often)
        await this.cache.set(cacheKey, result.data, 60 * 30 * 1000, [`user:${currentUser.id}`, 'message']);

        return { data: result.data };
    }

    /**
     * Get current user's Gmail profile
     */
    async getProfile(): Promise<{ data: ProfileResponse }> {
        const gmail = await this.createGmailClient();
        const currentUser = await this.currentUserService.getCurrentUserOrFail();
        const cacheKey = cacheKeyGenerator(['getProfile', currentUser.id]);
        const cache = (await this.cache.get(cacheKey)) as ProfileResponse | undefined;

        if (cache) {
            this.logger.debug({ userId: currentUser.id }, 'Gmail profile fetched from cache');
            return { data: cache };
        }

        this.logger.debug({ userId: currentUser.id }, 'Fetching Gmail profile');

        const result = await gmail.users.getProfile({
            userId: 'me',
        });

        // Cache for 1 hour (profile data changes rarely)
        await this.cache.set(cacheKey, result.data, 60 * 60 * 1000, [`user:${currentUser.id}`, 'profile']);

        return { data: result.data };
    }

    /**
     * Clear all cached message lists for a specific user using TaggedKeyv
     */
    async clearMessageListCache(userId?: number): Promise<void> {
        const targetUserId = userId || (await this.currentUserService.getCurrentUserOrFail()).id;

        // Use TaggedKeyv to clear all message list entries for this user
        await this.cache.invalidateTags([`user:${targetUserId}`, 'messageList']);

        this.logger.info({ userId: targetUserId }, 'Message list cache cleared for user');
    }

    /**
     * Clear specific message cache by ID
     */
    async clearMessageCache(messageId: string, userId?: number): Promise<void> {
        const targetUserId = userId || (await this.currentUserService.getCurrentUserOrFail()).id;
        const cacheKey = cacheKeyGenerator(['fetchMessage', targetUserId, messageId]);
        await this.cache.delete(cacheKey);

        this.logger.debug({ userId: targetUserId, messageId }, 'Message cache cleared');
    }

    /**
     * Clear profile cache for a user
     */
    async clearProfileCache(userId?: number): Promise<void> {
        const targetUserId = userId || (await this.currentUserService.getCurrentUserOrFail()).id;

        // Use TaggedKeyv to clear profile cache for this user
        await this.cache.invalidateTags([`user:${targetUserId}`, 'profile']);

        this.logger.debug({ userId: targetUserId }, 'Profile cache cleared');
    }

    /**
     * Clear all cache for a specific user using TaggedKeyv
     */
    async clearAllUserCache(userId?: number): Promise<void> {
        const targetUserId = userId || (await this.currentUserService.getCurrentUserOrFail()).id;

        // Use TaggedKeyv to clear all cache entries for this user
        await this.cache.invalidateTag(`user:${targetUserId}`);

        this.logger.info({ userId: targetUserId }, 'All cache cleared for user');
    }

    /**
     * Fetch all labels with caching
     */
    async fetchLabels(): Promise<{ data: gmail_v1.Schema$Label[] }> {
        const gmail = await this.createGmailClient();
        const currentUser = await this.currentUserService.getCurrentUserOrFail();
        const cacheKey = cacheKeyGenerator(['fetchLabels', currentUser.id]);
        const cache = (await this.cache.get(cacheKey)) as gmail_v1.Schema$Label[] | undefined;

        if (cache) {
            this.logger.debug({ userId: currentUser.id }, 'Labels fetched from cache');
            return { data: cache };
        }

        this.logger.debug({ userId: currentUser.id }, 'Fetching Gmail labels');
        const response = await gmail.users.labels.list({ userId: 'me' });
        const labels = response.data.labels || [];

        // Cache for 10 minutes (labels don't change frequently)
        await this.cache.set(cacheKey, labels, 60 * 10 * 1000, [`user:${currentUser.id}`, 'labels']);
        return { data: labels };
    }

    /**
     * Fetch history changes with caching
     */
    async fetchHistory(startHistoryId: string): Promise<{ data: gmail_v1.Schema$History[] }> {
        const gmail = await this.createGmailClient();
        const currentUser = await this.currentUserService.getCurrentUserOrFail();
        const cacheKey = cacheKeyGenerator(['fetchHistory', currentUser.id, startHistoryId]);
        const cache = (await this.cache.get(cacheKey)) as gmail_v1.Schema$History[] | undefined;

        if (cache) {
            this.logger.debug({ userId: currentUser.id, startHistoryId }, 'History fetched from cache');
            return { data: cache };
        }

        this.logger.debug({ userId: currentUser.id, startHistoryId }, 'Fetching Gmail history');
        const response = await gmail.users.history.list({
            userId: 'me',
            startHistoryId,
            historyTypes: ['messageAdded', 'messageDeleted', 'labelAdded', 'labelRemoved'],
        });
        const history = response.data.history || [];

        // Cache for 5 minutes (history is time-sensitive)
        await this.cache.set(cacheKey, history, 60 * 5 * 1000, [`user:${currentUser.id}`, 'history']);
        return { data: history };
    }

    /**
     * Get current historyId (always fresh, no caching)
     */
    async getCurrentHistoryId(): Promise<string> {
        const profile = await this.getProfile();
        if (!profile.data.historyId) {
            throw new Error('historyId not available in Gmail profile');
        }
        return profile.data.historyId;
    }

    /**
     * Clear labels cache
     */
    async clearLabelsCache(userId?: number): Promise<void> {
        const targetUserId = userId || (await this.currentUserService.getCurrentUserOrFail()).id;
        await this.cache.invalidateTags([`user:${targetUserId}`, 'labels']);
        this.logger.debug({ userId: targetUserId }, 'Labels cache cleared');
    }
}
