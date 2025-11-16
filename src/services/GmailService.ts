import { UsersRepository } from '@app/database/repositories';
import { CurrentUserService } from '@app/services/CurrentUserService';
import { cacheKeyGenerator } from '@app/utils/cacheKeyGenerator.ts';
import { AppCache, AppLogger } from '@app/utils/tokens';
import type Keyv from '@keyvhq/core';
import { type gmail_v1, google } from 'googleapis';
import type { Logger } from 'pino';
import { inject, singleton } from 'tsyringe';

type Gmail = gmail_v1.Gmail;
export type MessageListResponse = gmail_v1.Schema$ListMessagesResponse;
export type MessageResponse = gmail_v1.Schema$Message;
export type ProfileResponse = gmail_v1.Schema$Profile;

@singleton()
export class GmailService {
    protected logger: Logger;
    protected cache: Keyv;
    protected currentUserService: CurrentUserService;
    protected usersRepository: UsersRepository;

    constructor(
        @inject(AppLogger) logger: Logger,
        @inject(AppCache) cache: Keyv,
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
            expiryTime = currentUser.tokenExpiryDate.getTime();
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
        this.cache.set(cacheKey, results.data, 60 * 5 * 1000);
        return results;
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
        this.cache.set(cacheKey, result.data, 60 * 30 * 1000);

        return result;
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
        this.cache.set(cacheKey, result.data, 60 * 60 * 1000);

        return result;
    }

    /**
     * Clear all cached message lists for a specific user
     */
    async clearMessageListCache(userId?: number): Promise<void> {
        const targetUserId = userId || (await this.currentUserService.getCurrentUserOrFail()).id;

        // Get all cache keys that match the pattern for this user's message lists
        // Note: This is a simple implementation - more sophisticated cache backends
        // might support pattern-based deletion
        const cachePatterns = [
            cacheKeyGenerator(['fetchMessageList', targetUserId, 'first-page']),
            // Clear common pagination patterns
            ...Array.from({ length: 10 }, (_, i) =>
                cacheKeyGenerator(['fetchMessageList', targetUserId, `page-${i + 1}`])
            ),
        ];

        for (const key of cachePatterns) {
            await this.cache.delete(key);
        }

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
        const cacheKey = cacheKeyGenerator(['getProfile', targetUserId]);
        await this.cache.delete(cacheKey);

        this.logger.debug({ userId: targetUserId }, 'Profile cache cleared');
    }

    /**
     * Clear all cache for a specific user
     */
    async clearAllUserCache(userId?: number): Promise<void> {
        const targetUserId = userId || (await this.currentUserService.getCurrentUserOrFail()).id;

        await Promise.all([this.clearMessageListCache(targetUserId), this.clearProfileCache(targetUserId)]);

        this.logger.info({ userId: targetUserId }, 'All cache cleared for user');
    }
}
