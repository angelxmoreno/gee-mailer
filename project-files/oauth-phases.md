# OAuth Implementation Phases

## Current State Analysis

### ✅ Already Implemented
1. **OAuthService with comprehensive functionality**:
   - ✅ Complete browser-based OAuth flow with local callback server
   - ✅ CSRF protection with state parameter validation
   - ✅ Token exchange and credential management
   - ✅ User info retrieval from Google
   - ✅ Automatic user creation/storage with tokens

2. **CLI command for authentication**:
   - ✅ `bun cli/auth.ts` working OAuth command
   - ✅ Database integration and user persistence

3. **Database schema for token storage**:
   - ✅ `UserEntity` with access/refresh tokens and expiry
   - ✅ Migration for user tokens (`1763170415029-UserTokens.ts`)

### ❌ Missing Critical Components

#### 1. Token Encryption & Secure Storage ❌
- **Current**: Tokens stored as plain text in database
- **Security Risk**: Tokens visible in database dumps, logs, etc.
- **Solution**: Implement encryption/decryption for tokens using secure key management

#### 2. Automatic Token Refresh ❌
- **Current**: No automatic refresh when tokens expire
- **Impact**: Services fail when tokens expire, manual re-authentication required
- **Solution**: Implement a background service to refresh tokens before expiry

#### 3. Enhanced OAuth CLI Integration ❌
- **Current**: Standalone `cli/auth.ts` script
- **UX Issue**: Not integrated with main CLI, inconsistent commands
- **Solution**: Integrate with main CLI system (`bun auth` command)

#### 4. Token Validation & Expiry Handling ❌
- **Current**: No token validation or expiry checks in services
- **Impact**: Silent failures, poor error handling
- **Solution**: Implement middleware/interceptors for automatic token management

## Implementation Phases

### Phase 1: Token Security (Critical Priority) ✅

**Goal**: Secure token storage with encryption

**✅ COMPLETED**: Implemented using TypeORM transformers with EncryptionService for secure, authenticated encryption.

**Architecture**:
- **EncryptionService**: Handles all encryption/decryption logic (reusable)
- **EncryptTransformer**: TypeORM transformer that delegates to EncryptionService

```typescript
// src/services/EncryptionService.ts
export class EncryptionService {
    constructor(private secret: string) {
        if (secret.length < 32) {
            throw new Error('Encryption secret must be at least 32 characters');
        }
    }

    encrypt(plaintext: string): string {
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv('aes-256-gcm', this.deriveKey(), iv);
        // ... AES-256-GCM encryption logic
        return `${iv.toString('hex')}:${encrypted}:${authTag.toString('hex')}`;
    }

    decrypt(ciphertext: string): string {
        // ... AES-256-GCM decryption logic
    }
}

// src/modules/typeorm/transformers/EncryptTransformer.ts
export class EncryptTransformer implements ValueTransformer {
    constructor(private encryptionService: EncryptionService) {}

    to(value: string | null): string | null {
        if (!value) return value;
        return this.encryptionService.encrypt(value);
    }

    from(value: string | null): string | null {
        if (!value || !this.encryptionService.isEncrypted(value)) return value;
        return this.encryptionService.decrypt(value);
    }
}
```

**Entity Integration**:
```typescript
// src/database/entities/UserEntity.ts
import { createEncryptTransformer } from '@app/modules/typeorm/transformers/EncryptTransformer';

@Column({ type: 'text', nullable: true, transformer: createEncryptTransformer() })
accessToken?: string | null;

@Column({ type: 'text', nullable: true, transformer: createEncryptTransformer() })
refreshToken?: string | null;
```

**Factory Function**:
```typescript
// src/modules/typeorm/transformers/EncryptTransformer.ts
export function createEncryptTransformer(): EncryptTransformer {
    const secret = Bun.env.TOKEN_ENCRYPTION_SECRET || 'default-secret';
    const encryptionService = new EncryptionService(secret);
    return new EncryptTransformer(encryptionService);
}
```

**Environment Variables**:
```env
# Generate a strong secret with:
# bun -e "console.log(require('node:crypto').randomBytes(64).toString('base64'))"
TOKEN_ENCRYPTION_SECRET=your-base64-encoded-secret-here
```

**Dependencies**:
- Node.js built-in `crypto` module - No external dependencies needed

**Files Created/Modified**:
- ✅ `src/services/EncryptionService.ts` (new - core encryption logic)
- ✅ `src/modules/typeorm/transformers/EncryptTransformer.ts` (new - TypeORM integration)
- ✅ `src/database/entities/UserEntity.ts` (modified - added transformers)
- ✅ `tests/unit/services/EncryptionService.test.ts` (new - encryption tests)
- ✅ `tests/unit/modules/typeorm/transformers/EncryptTransformer.test.ts` (new - transformer tests)

**Security Benefits**:
- ✅ **Authenticated Encryption**: AES-256-GCM provides AEAD (encryption + integrity)
- ✅ **Key Derivation**: PBKDF2 with 100,000 iterations for key stretching
- ✅ **Synchronous Operation**: Compatible with TypeORM's ValueTransformer interface
- ✅ **Separation of Concerns**: EncryptionService handles crypto, transformer handles TypeORM
- ✅ **Reusable**: EncryptionService can encrypt any data, not just tokens
- ✅ **No External Dependencies**: Uses Node.js built-in crypto module

**Acceptance Criteria**:
- ✅ Tokens encrypted at rest in database
- ✅ Automatic encryption/decryption in all database operations
- ✅ Environment-based key management
- ✅ **Fresh Start**: No legacy data exists, all tokens encrypted from day one

---

### Phase 2: Automatic Token Refresh (Critical Priority) ✅



**Goal**: Automatic token refresh before expiry with clean separation of concerns.



**✅ COMPLETED**: Implemented using a dedicated `TokenRefreshService` for clean separation of concerns and on-demand token refreshing.



**Architecture Decision**: Create dedicated `TokenRefreshService` to avoid coupling issues and improve reusability.



**Problem with Current Approach**:

- OAuthService mixing OAuth flows with token lifecycle management

- GmailService → OAuthService → CurrentUserService creates tight coupling

- CurrentUserService can't refresh tokens independently

- Token refresh logic locked inside OAuthService



**Solution**: Dedicated `TokenRefreshService` that both CurrentUserService and OAuthService can use.



**Implementation**:

```typescript

// New dedicated service for token lifecycle management

@singleton()

export class TokenRefreshService {

  private oauth2ClientFactory: OAuth2ClientFactory;



  constructor(

    @inject(UsersRepository) private userRepo: UsersRepository,

    @inject(AppLogger) private logger: Logger,

    @inject(OAuth2ClientFactory) oauth2ClientFactory: OAuth2ClientFactory

  ) {

    this.oauth2ClientFactory = oauth2ClientFactory;

  }



  async refreshTokensIfNeeded(userId: number): Promise<boolean> {

    const user = await this.userRepo.findById(userId);

    if (!user?.refreshToken) {

      return false;

    }



    if (this.isUserTokenExpiringSoon(user, 5)) {

      return await this.refreshAccessToken(userId);

    }



    return true; // Token is still valid

  }



  async refreshAccessToken(userId: number): Promise<boolean> {

    try {

      const user = await this.userRepo.findByIdOrFail(userId);

      if (!user.refreshToken) {

        throw new Error('No refresh token available');

      }



      const oauth2Client = this.oauth2ClientFactory.createForRefresh(user.refreshToken);



      const { credentials } = await oauth2Client.refreshAccessToken();



      // Update user with new tokens (encrypted automatically via transformer)

      await this.userRepo.update(user, {

        accessToken: credentials.access_token!,

        tokenExpiryDate: credentials.expiry_date ? new Date(credentials.expiry_date) : null,

        refreshToken: credentials.refresh_token || user.refreshToken,

      });



      this.logger.info({ userId }, 'Tokens refreshed successfully');

      return true;

    } catch (error) {

      this.logger.error({ userId, error }, 'Failed to refresh tokens');

      return false;

    }

  }



  async isTokenExpiringSoon(userId: number, bufferMinutes = 5): Promise<boolean> {

    const user = await this.userRepo.findById(userId);

    if (!user) return true; // Assume expired if user not found

    return this.isUserTokenExpiringSoon(user, bufferMinutes);

  }



  /**

   * Checks if a user's token is expiring soon (private helper to avoid code duplication)

   */

  private isUserTokenExpiringSoon(user: UserEntity, bufferMinutes = 5): boolean {

    if (!user.tokenExpiryDate) return true; // Assume expired if no expiry date



    const expiryBuffer = bufferMinutes * 60 * 1000;

    const now = new Date();

    const expiryWithBuffer = new Date(user.tokenExpirydate.getTime() - expiryBuffer);



    return now >= expiryWithBuffer;

  }

}

```



**Enhanced CurrentUserService**:

```typescript

export class CurrentUserService {

  constructor(

    @inject(TokenRefreshService) private tokenRefreshService: TokenRefreshService,

    @inject(UsersRepository) private userRepo: UsersRepository

  ) {}



  // New method that guarantees fresh tokens

  async getCurrentUserWithValidToken(): Promise<UserEntity> {

    const user = await this.getCurrentUserOrFail();

    const isValid = await this.tokenRefreshService.refreshTokensIfNeeded(user.id);



    if (!isValid) {

      throw new Error('Authentication required - please run: bun auth login');

    }



    // Return fresh user data (tokens may have been updated)

    return await this.userRepo.findByIdOrFail(user.id);

  }



  // Existing methods remain unchanged

  async getCurrentUser(): Promise<UserEntity | null> { /* existing */ }

  async getCurrentUserOrFail(): Promise<UserEntity> { /* existing */ }

}

```



**Simplified OAuthService**:

```typescript

export class OAuthService {

  constructor(

    @inject(TokenRefreshService) private tokenRefreshService: TokenRefreshService

  ) {}



  // OAuth flow methods (login, callback, etc.)

  async login(): Promise<string> { /* OAuth flow logic */ }

  async handleCallback(code: string): Promise<UserEntity> { /* OAuth callback */ }



  // Delegates token refresh to TokenRefreshService

  async refreshTokensIfNeeded(userId: number): Promise<boolean> {

    return await this.tokenRefreshService.refreshTokensIfNeeded(userId);

  }

}

```



**Clean GmailService Integration**:

```typescript

export class GmailService {

  constructor(

    @inject(CurrentUserService) private currentUserService: CurrentUserService

  ) {}



  // All API methods automatically get fresh tokens

  async fetchMessageList(pageToken?: string): Promise<MessageListResponse> {

    const user = await this.currentUserService.getCurrentUserWithValidToken();



    // Tokens are guaranteed to be fresh - proceed with API call

    const gmail = this.createGmailClient(user);

    return await gmail.users.messages.list({ userId: 'me', pageToken });

  }



  async fetchMessage(messageId: string): Promise<MessageData> {

    const user = await this.currentUserService.getCurrentUserWithValidToken();



    // No need for manual token validation

    const gmail = this.createGmailClient(user);

    return await gmail.users.messages.get({ userId: 'me', id: messageId });

  }

}

```



**Architecture Benefits**:

- ✅ **Clean separation**: Token lifecycle separate from OAuth flows

- ✅ **Improved reusability**: Any service can refresh tokens via CurrentUserService

- ✅ **Reduced coupling**: GmailService no longer depends on OAuthService

- ✅ **Better testability**: Each service has focused responsibilities

- ✅ **Enhanced maintainability**: Token logic centralized in one place



**Note on Background Refresh**: Token refresh is handled on-demand for the current active user. A background refresh process for all users was not implemented, as it does not align with the project's single-user, CLI-driven workflow.



**Files Created/Modified**:

- ✅ `src/services/TokenRefreshService.ts` (new - dedicated token lifecycle management)

- ✅ `src/services/CurrentUserService.ts` (modify - add getCurrentUserWithValidToken method)

- ✅ `src/services/GmailService.ts` (modify - use CurrentUserService for token validation)

- ✅ `src/services/OAuthService.ts` (modify - delegate token refresh to TokenRefreshService)

- ✅ `src/database/repositories/UsersRepository.ts` (modify - add findUsersWithRefreshTokens method)

- ✅ `src/utils/createContainer.ts` (modify - register TokenRefreshService and OAuth2Client)



---



### Phase 3: Enhanced OAuth CLI Integration (Medium Priority) ✅



**Goal**: Integrated CLI commands for OAuth management



**✅ COMPLETED**: Implemented centralized CLI system with OAuth authentication management commands.



**Implementation**:

```typescript

// Add to main CLI system

// src/cli/commands/auth.ts

export const authCommand = {

  name: 'auth',

  description: 'OAuth authentication management',

  subcommands: {

    login: {

      description: 'Authenticate with Google OAuth',

      handler: async () => {

        const oauth = appContainer.resolve(OAuthService);

        await oauth.authorizeAndSaveUser();

        console.log('✅ Authentication successful!');

      }

    },



    logout: {

      description: 'Clear authentication tokens',

      handler: async () => {

        const userRepo = appContainer.resolve(UsersRepository);

        const currentUser = appContainer.resolve(CurrentUserService);



        const user = await currentUser.getCurrentUser();

        if (user) {

          await userRepo.clearTokens(user.id);

          await currentUser.clearCurrentUser();

          console.log('✅ Logged out successfully');

        } else {

          console.log('ℹ️  No user currently authenticated');

        }

      }

    },



    status: {

      description: 'Check authentication status',

      handler: async () => {

        const currentUser = appContainer.resolve(CurrentUserService);

        const oauth = appContainer.resolve(OAuthService);



        const user = await currentUser.getCurrentUser();

        if (!user) {

          console.log('❌ Not authenticated');

          return;

        }



        const hasValidTokens = await oauth.refreshTokensIfNeeded();

        console.log(`✅ Authenticated as: ${user.email}`);

        console.log(`🔑 Tokens: ${hasValidTokens ? 'Valid' : 'Expired/Invalid'}`);

        console.log(`📅 Token expires: ${user.tokenExpiryDate || 'Unknown'}`);

      }

    },



    refresh: {

      description: 'Manually refresh authentication tokens',

      handler: async () => {

        const oauth = appContainer.resolve(OAuthService);

        const success = await oauth.refreshAccessToken();



        if (success) {

          console.log('✅ Tokens refreshed successfully');

        } else {

          console.log('❌ Failed to refresh tokens - please login again');

        }

      }

    }

  }

};

```



**Actual Implementation**:



**Architecture**: Created centralized CLI system with modular command structure and proper TypeScript types.



```typescript

// src/cli/commands/auth.ts - Comprehensive auth command implementation

export const authCommands: Record<string, AuthCommand> = {

    login: {

        name: 'login',

        description: 'Authenticate with Google OAuth',

        handler: async () => {

            // Full OAuth flow with user feedback and error handling

            const result = await oauth.authorizeAndSaveUser();

            await currentUser.setCurrentUser(result.user);

            console.log('✅ Authentication successful!');

        }

    },

    logout: {

        name: 'logout',

        description: 'Clear authentication tokens',

        handler: async () => {

            // Clear tokens and current user session

            await userRepo.clearTokens(user.id);

            await currentUser.clearCurrentUser();

        }

    },

    status: {

        name: 'status',

        description: 'Check authentication status',

        handler: async () => {

            // Comprehensive status display with token expiry analysis

            // Shows user info, token validity, and expiry timing

        }

    },

    refresh: {

        name: 'refresh',

        description: 'Manually refresh authentication tokens',

        handler: async () => {

            // Manual token refresh using TokenRefreshService

            const success = await tokenRefreshService.refreshAccessToken(user.id);

        }

    }

};



// src/cli/index.ts - Main CLI dispatcher

const commands: Record<string, CommandGroup> = {

    auth: {

        name: 'auth',

        description: 'OAuth authentication management',

        subcommands: authCommands

    }

};

```



**CLI Usage**:

```bash

# Direct CLI usage

bun src/cli/index.ts auth login      # OAuth authentication flow

bun src/cli/index.ts auth logout     # Clear all tokens

bun src/cli/index.ts auth status     # Detailed authentication status

bun src/cli/index.ts auth refresh    # Manual token refresh



# Via npm scripts

bun run auth:login                   # Convenient shortcuts

bun run auth:logout

bun run auth:status

bun run auth:refresh



# Help system

bun src/cli/index.ts --help         # Main help

bun src/cli/index.ts auth --help    # Auth command help

```



**Enhanced Features**:

- **Rich Status Display**: Shows user info, token expiry countdown, and validity status

- **Comprehensive Error Handling**: Clear error messages with actionable guidance

- **Database Integration**: Proper connection management with cleanup

- **Type Safety**: Full TypeScript support with proper interfaces

- **Help System**: Built-in help for all commands and subcommands

- **Graceful Shutdown**: Proper database connection cleanup on exit



**Files Created/Modified**:

- ✅ `src/cli/commands/auth.ts` (new - modular auth commands)

- ✅ `src/cli/index.ts` (new - centralized CLI dispatcher)

- ✅ `src/database/repositories/UsersRepository.ts` (modified - added `clearTokens` method)

- ✅ `package.json` (modified - added convenience scripts)

- ✅ `src/cli/auth.ts` (removed - migrated to integrated system)



**Acceptance Criteria**:

- ✅ Integrated CLI system with auth subcommands

- ✅ Consistent error handling and user feedback

- ✅ Removed standalone auth script

- ✅ Rich help documentation for all commands

- ✅ Database connection management

- ✅ Type-safe command structure
