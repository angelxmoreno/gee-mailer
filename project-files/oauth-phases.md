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

### Phase 2: Automatic Token Refresh (Critical Priority)

**Goal**: Automatic token refresh before expiry with clean separation of concerns

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
  private tokenRefreshHandle: NodeJS.Timeout | null = null;

  constructor(
    @inject(UsersRepository) private userRepo: UsersRepository,
    @inject(AppLogger) private logger: Logger,
    @inject(OAuth2ClientFactory) oauth2ClientFactory: OAuth2ClientFactory
  ) {
    this.oauth2ClientFactory = oauth2ClientFactory;
  }

  async refreshTokensIfNeeded(userId: number): Promise<boolean> {
    const user = await this.userRepo.findById(userId);
    if (!user?.refreshToken || !user?.tokenExpiryDate) {
      return false;
    }

    // Refresh if token expires within 5 minutes
    const expiryBuffer = 5 * 60 * 1000; // 5 minutes in ms
    const now = new Date();
    const expiryWithBuffer = new Date(user.tokenExpiryDate.getTime() - expiryBuffer);

    if (now >= expiryWithBuffer) {
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
    if (!user?.tokenExpiryDate) return true; // Assume expired if no expiry date

    const expiryBuffer = bufferMinutes * 60 * 1000;
    const now = new Date();
    const expiryWithBuffer = new Date(user.tokenExpiryDate.getTime() - expiryBuffer);

    return now >= expiryWithBuffer;
  }

  // Background refresh scheduling
  async scheduleTokenRefresh(): Promise<void> {
    this.tokenRefreshHandle = setInterval(async () => {
      try {
        // Get all users with tokens and refresh if needed
        const usersWithTokens = await this.userRepo.findUsersWithRefreshTokens();

        for (const user of usersWithTokens) {
          await this.refreshTokensIfNeeded(user.id);
        }
      } catch (error) {
        this.logger.error(error, 'Unexpected error during scheduled token refresh');
      }
    }, 60000); // Check every minute
  }

  cancelScheduledRefresh(): void {
    if (this.tokenRefreshHandle) {
      clearInterval(this.tokenRefreshHandle);
      this.tokenRefreshHandle = null;
    }
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

**Files to Create/Modify**:
- `src/services/TokenRefreshService.ts` (new - dedicated token lifecycle management)
- `src/services/CurrentUserService.ts` (modify - add getCurrentUserWithValidToken method)
- `src/services/GmailService.ts` (modify - use CurrentUserService for token validation)
- `src/services/OAuthService.ts` (modify - delegate token refresh to TokenRefreshService)
- `src/database/repositories/UsersRepository.ts` (modify - add findUsersWithRefreshTokens method)
- `src/utils/createContainer.ts` (modify - register TokenRefreshService and OAuth2Client)

**Acceptance Criteria**:
- [ ] TokenRefreshService handles all token lifecycle operations
- [ ] CurrentUserService provides getCurrentUserWithValidToken() method
- [ ] All API services automatically get fresh tokens via CurrentUserService
- [ ] Background scheduler refreshes tokens for all users
- [ ] Graceful handling of refresh failures with clear error messages
- [ ] OAuthService focuses only on OAuth flows, delegates token management
- [ ] Clean dependency injection with proper service separation

---

### Phase 3: Enhanced OAuth CLI Integration (Medium Priority)

**Goal**: Integrated CLI commands for OAuth management

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

**CLI Integration**:
```bash
# New command structure
bun auth login     # OAuth flow
bun auth logout    # Clear tokens
bun auth status    # Check auth state
bun auth refresh   # Manual token refresh
```

**Files to Create/Modify**:
- `src/cli/commands/auth.ts` (new)
- `src/cli/index.ts` (modify - add auth command)
- `src/database/repositories/UsersRepository.ts` (modify - add clearTokens method)
- Remove standalone `src/cli/auth.ts` (migrate to integrated system)

**Acceptance Criteria**:
- [ ] Integrated `bun auth` command with subcommands
- [ ] Consistent CLI functionality and error handling
- [ ] Remove standalone auth script
- [ ] Documentation for all auth commands

---

### Phase 4: Service Integration & Middleware (Medium Priority)

**Goal**: Seamless token management across all services

**Implementation**:
```typescript
// OAuth Middleware for automatic token management
// src/middleware/OAuthMiddleware.ts
export class OAuthMiddleware {
  constructor(
    private oauthService: OAuthService,
    private logger: Logger
  ) {}

  async ensureAuthenticated(): Promise<void> {
    const isValid = await this.oauthService.refreshTokensIfNeeded();
    if (!isValid) {
      throw new AuthenticationError('Please authenticate with: bun auth login');
    }
  }

  // Decorator for automatic token validation
  static requireAuth() {
    return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
      const originalMethod = descriptor.value;

      descriptor.value = async function (...args: any[]) {
        const middleware = appContainer.resolve(OAuthMiddleware);
        await middleware.ensureAuthenticated();
        return originalMethod.apply(this, args);
      };
    };
  }
}
```

**Service Integration Examples**:
```typescript
// Apply to all services that need OAuth
export class GmailService {
  @OAuthMiddleware.requireAuth()
  async getMessages(): Promise<any> {
    // Token validation happens automatically
    // ... existing implementation
  }

  @OAuthMiddleware.requireAuth()
  async getLabels(): Promise<any> {
    // ... existing implementation
  }
}

export class MessageProcessingService {
  @OAuthMiddleware.requireAuth()
  async processMessage(): Promise<any> {
    // ... existing implementation
  }
}
```

**Error Handling**:
```typescript
// Custom error types
export class AuthenticationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export class TokenExpiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TokenExpiredError';
  }
}
```

**Files to Create/Modify**:
- `src/middleware/OAuthMiddleware.ts` (new)
- `src/errors/AuthenticationError.ts` (new)
- `src/services/GmailService.ts` (modify - add middleware)
- `src/services/MessageProcessingService.ts` (modify - add middleware)
- All OAuth-dependent services (modify - add decorators)

**Acceptance Criteria**:
- [ ] Automatic token validation middleware
- [ ] Decorator-based authentication requirements
- [ ] Consistent error handling across services
- [ ] Graceful degradation when authentication fails

## Implementation Timeline

### Week 1: Security Foundation
- **Days 1-2**: Phase 1 - Token Encryption
- **Days 3-5**: Phase 2 - Automatic Token Refresh

### Week 2: User Experience
- **Days 1-3**: Phase 3 - CLI Integration
- **Days 4-5**: Phase 4 - Service Integration

### Week 3: Testing & Polish
- **Days 1-2**: Integration testing
- **Days 3-4**: Documentation and error handling
- **Day 5**: Production deployment preparation

## Environment Configuration

```env
# OAuth Configuration
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
OAUTH_CALLBACK_PORT=3000

# Token Security
TOKEN_ENCRYPTION_KEY=your-32-char-secret-key-here
TOKEN_SALT=your-salt-here

# Token Management
TOKEN_REFRESH_BUFFER_MINUTES=5
TOKEN_REFRESH_CHECK_INTERVAL_MS=60000
```

## Testing Strategy

1. **Unit Tests**:
   - Token encryption/decryption
   - Token refresh logic
   - CLI command functions

2. **Integration Tests**:
   - Full OAuth flow
   - Token refresh with real Google API
   - Service authentication middleware

3. **Security Tests**:
   - Token storage security
   - CSRF protection
   - Token expiry handling

## Rollout Plan

1. **Development**: Implement phases in order
2. **Staging**: Test with real OAuth tokens and Google API
3. **Production**:
   - Migrate existing users with token encryption
   - Enable automatic refresh
   - Monitor token refresh success rates

## Success Metrics

- [ ] 100% of tokens encrypted at rest
- [ ] Automatic token refresh success rate > 99%
- [ ] Zero manual re-authentication required for 30+ days
- [ ] CLI authentication commands working seamlessly
- [ ] All services protected with authentication middleware