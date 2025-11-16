#!/usr/bin/env bun
import 'reflect-metadata';
import { appContainer } from '@app/config';
import { UsersRepository } from '@app/database/repositories';
import { CurrentUserService } from '@app/services/CurrentUserService';
import { AppCache } from '@app/utils/tokens';
import type Keyv from '@keyvhq/core';
import { DataSource } from 'typeorm';

async function main() {
    // Initialize DataSource first
    const dataSource = appContainer.resolve(DataSource);
    if (!dataSource.isInitialized) {
        console.log('🔧 Initializing database connection...');
        await dataSource.initialize();
    }

    const currentUserService = appContainer.resolve(CurrentUserService);
    const usersRepository = appContainer.resolve(UsersRepository);
    const cache = appContainer.resolve<Keyv>(AppCache);

    console.log('🔍 Debugging current user data...\n');

    // Check cache
    console.log('📦 Cache data:');
    const cachedUserId = await cache.get('current-user-id');
    console.log(`  - Current user ID in cache: ${cachedUserId}`);

    // Check current user service
    console.log('\n👤 CurrentUserService data:');
    try {
        const currentUser = await currentUserService.getCurrentUser();
        if (currentUser) {
            console.log(`  - User ID: ${currentUser.id}`);
            console.log(`  - Email: ${currentUser.email}`);
            console.log(`  - Name: ${currentUser.name}`);
            console.log(`  - Access Token: ${currentUser.accessToken ? 'EXISTS' : 'MISSING'}`);
            console.log(`  - Refresh Token: ${currentUser.refreshToken ? 'EXISTS' : 'MISSING'}`);
            console.log(`  - Token Expiry Date: ${currentUser.tokenExpiryDate}`);
            console.log(`  - Token Expiry Type: ${typeof currentUser.tokenExpiryDate}`);

            if (currentUser.tokenExpiryDate) {
                const expiryDate =
                    typeof currentUser.tokenExpiryDate === 'string'
                        ? new Date(currentUser.tokenExpiryDate)
                        : currentUser.tokenExpiryDate;
                const now = new Date();
                const isExpired = expiryDate <= now;
                console.log(`  - Token Expiry Date (parsed): ${expiryDate.toISOString()}`);
                console.log(`  - Current Date: ${now.toISOString()}`);
                console.log(`  - Is Token Expired: ${isExpired}`);
                console.log(
                    `  - Time until expiry: ${Math.round((expiryDate.getTime() - now.getTime()) / 1000 / 60)} minutes`
                );
            }
        } else {
            console.log('  - No current user found');
        }
    } catch (error) {
        console.log(`  - Error getting current user: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Test token validation
    console.log('\n🔐 Token validation test:');
    try {
        const userWithValidToken = await currentUserService.getCurrentUserWithValidToken();
        console.log(`  - ✅ Token validation passed for user: ${userWithValidToken.email}`);
    } catch (error) {
        console.log(`  - ❌ Token validation failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    // List all users in database
    console.log('\n👥 All users in database:');
    try {
        const allUsers = await usersRepository.repository.find();
        if (allUsers.length === 0) {
            console.log('  - No users found in database');
        } else {
            allUsers.forEach((user, index) => {
                console.log(`  ${index + 1}. ID: ${user.id}, Email: ${user.email}, Name: ${user.name}`);
                console.log(`     Access Token: ${user.accessToken ? 'EXISTS' : 'MISSING'}`);
                console.log(`     Refresh Token: ${user.refreshToken ? 'EXISTS' : 'MISSING'}`);
                console.log(`     Token Expiry: ${user.tokenExpiryDate} (${typeof user.tokenExpiryDate})`);
            });
        }
    } catch (error) {
        console.log(`  - Error fetching users: ${error instanceof Error ? error.message : String(error)}`);
    }

    process.exit(0);
}

main().catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
});
