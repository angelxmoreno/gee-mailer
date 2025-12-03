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

### Phase 1: Token Security (Critical Priority)

**Goal**: Secure token storage with encryption

**Implementation**:
```typescript
// New service: src/services/TokenCryptoService.ts
export class TokenCryptoService {
  private readonly algorithm = 'aes-256-gcm';
  private readonly keyDerivationSalt: Buffer;

  constructor(private encryptionKey: string) {
    this.keyDerivationSalt = Buffer.from(process.env.TOKEN_SALT || 'default-salt');
  }

  encrypt(token: string): string {
    const iv = crypto.randomBytes(16);
    const key = this.deriveKey();
    const cipher = crypto.createCipheriv(this.algorithm, key, iv);
    let encrypted = cipher.update(token, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${encrypted}:${authTag.toString('hex')}`;
  }

  decrypt(encryptedToken: string): string {
    const [ivHex, encrypted, authTagHex] = encryptedToken.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const key = this.deriveKey();
    const decipher = crypto.createDecipheriv(this.algorithm, key, iv);
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  private deriveKey(): Buffer {
    return crypto.pbkdf2Sync(this.encryptionKey, this.keyDerivationSalt, 100000, 32, 'sha256');
  }
}
```

**Database Migration**:
```sql
-- Migrate existing tokens to encrypted format
UPDATE users SET
  access_token = encrypt_token(access_token),
  refresh_token = encrypt_token(refresh_token)
WHERE access_token IS NOT NULL;
```

**Environment Variables**:
```env
TOKEN_ENCRYPTION_KEY=your-32-char-secret-key-here
TOKEN_SALT=your-salt-here
```

**Files to Create/Modify**:
- `src/services/TokenCryptoService.ts` (new)
- `src/database/repositories/UsersRepository.ts` (modify - add encryption/decryption)
- `src/services/OAuthService.ts` (modify - use encryption)
- `.env.example` (add token encryption vars)

**Acceptance Criteria**:
- [ ] Tokens encrypted at rest in database
- [ ] Automatic encryption/decryption in repositories
- [ ] Environment-based key management
- [ ] Backward compatibility with existing tokens

---

### Phase 2: Automatic Token Refresh (Critical Priority)

**Goal**: Automatic token refresh before expiry

**Implementation**:
```typescript
// Enhanced OAuthService with refresh capabilities
export class OAuthService {
  // Add refresh functionality
  async refreshTokensIfNeeded(): Promise<boolean> {
    const user = await this.currentUserService.getCurrentUser();
    if (!user?.refreshToken || !user?.tokenExpiryDate) {
      return false;
    }

    // Refresh if token expires within 5 minutes
    const expiryBuffer = 5 * 60 * 1000; // 5 minutes in ms
    const now = new Date();
    const expiryWithBuffer = new Date(user.tokenExpiryDate.getTime() - expiryBuffer);

    if (now >= expiryWithBuffer) {
      return await this.refreshAccessToken();
    }

    return true; // Token is still valid
  }

  async refreshAccessToken(): Promise<boolean> {
    try {
      const user = await this.currentUserService.getCurrentUser();
      if (!user?.refreshToken) {
        throw new Error('No refresh token available');
      }

      this.oauth2Client.setCredentials({
        refresh_token: user.refreshToken
      });

      const { credentials } = await this.oauth2Client.refreshAccessToken();

      // Update user with new tokens
      await this.userRepo.updateTokens(user.id, {
        accessToken: credentials.access_token!,
        tokenExpiryDate: credentials.expiry_date ? new Date(credentials.expiry_date) : null,
        refreshToken: credentials.refresh_token || user.refreshToken, // Keep existing if not provided
      });

      this.logger.info({ userId: user.id }, 'Tokens refreshed successfully');
      return true;
    } catch (error) {
      this.logger.error(error, 'Failed to refresh tokens');
      return false;
    }
  }

  private tokenRefreshHandle: NodeJS.Timeout | null = null;

  async scheduleTokenRefresh(): Promise<void> {
    // Schedule periodic token refresh checks
    this.tokenRefreshHandle = setInterval(async () => {
      try {
        await this.refreshTokensIfNeeded();
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

**Service Integration**:
```typescript
// Add to GmailService
export class GmailService {
  async ensureValidTokens(): Promise<void> {
    const isValid = await this.oauthService.refreshTokensIfNeeded();
    if (!isValid) {
      throw new Error('Authentication required - please run: bun auth login');
    }
  }

  // Wrap all API calls with token validation
  async getMessages(): Promise<any> {
    await this.ensureValidTokens();
    // ... existing implementation
  }
}
```

**Files to Create/Modify**:
- `src/services/OAuthService.ts` (modify - add refresh methods)
- `src/database/repositories/UsersRepository.ts` (modify - add updateTokens method)
- `src/services/GmailService.ts` (modify - add token validation)
- `src/services/CurrentUserService.ts` (modify - token refresh integration)

**Acceptance Criteria**:
- [ ] Automatic token refresh before expiry
- [ ] Background token refresh scheduler
- [ ] Service-level token validation
- [ ] Graceful authentication error handling

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