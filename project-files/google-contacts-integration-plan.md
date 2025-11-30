# Plan: Google Contacts Integration via People API

## Phase 1: OAuth Scope Expansion
- Add Google People API scope to `OAuthService.ts` scopes array
- Add `https://www.googleapis.com/auth/contacts.readonly` for read access
- Users will need to re-authenticate to grant the new scope
- Update authentication flow documentation

## Phase 2: Google People Service Implementation
- Create `GooglePeopleService` class for People API integration
- Implement methods:
  - `getConnections()` - fetch user's contacts
  - `getPerson(resourceName)` - get individual contact details
  - Handle pagination for large contact lists
- Follow existing service patterns (similar to `GmailService`)

## Phase 3: Contact Data Mapping & Synchronization
- Create contact mapping utilities to convert People API format to our entities
- Map Google People API fields:
  - `names` → `DisplayNameEntity`
  - `emailAddresses` → `EmailAddressEntity`
  - `phoneNumbers` → (new field or separate entity)
  - `addresses` → (new field or separate entity)
- Implement sync strategy (full sync vs incremental)
- Handle contact deduplication between header-sourced and Google-sourced contacts

## Phase 4: Database Schema Extensions
- Add Google-specific fields to existing contact entities:
  - `googleResourceName` (People API identifier)
  - `googleEtag` (for change detection)
  - `phoneNumbers`, `addresses` (if desired)
- Update `source` field usage (`'google'` vs `'header'`)
- Create migration for new fields

## Phase 5: Sync Integration
- Add Google Contacts sync to existing sync pipeline
- Create `GoogleContactsSyncProcessor`
- Integrate with queue system for background processing
- Add sync progress tracking
- Implement incremental sync using etags

## Phase 6: CLI & User Experience
- Add CLI command for Google Contacts sync (`bun contacts:sync`)
- Add contact statistics to existing reporting
- Handle permission errors gracefully
- Provide contact merge/deduplification options

## Dependencies & Considerations
- ✅ `googleapis` package already installed
- ❌ New OAuth scope requires user re-authentication
- ⚠️ Contact deduplication strategy needed
- ⚠️ Rate limiting considerations for People API
- ⚠️ Privacy implications of storing Google Contacts data

## Benefits
- Rich contact metadata beyond email headers
- Better contact organization and search
- Phone numbers and addresses for comprehensive CRM
- Unified contact management across email and Google ecosystem

## Technical Background

### Current State Analysis
Your current OAuth scopes (from `src/services/OAuthService.ts`):
```javascript
protected scopes = [
    'https://www.googleapis.com/auth/gmail.labels',
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.metadata',
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/userinfo.email',
];
```

### Google Contacts API vs Gmail API
- **Google Contacts is NOT part of the Gmail API**
- Requires separate OAuth scopes for Google People API
- People API replaced the deprecated Google Contacts API (deprecated 2022)
- Your existing contact system already anticipates this with `source: 'header' | 'google'` in `EmailContactEntity`

### Required New Scopes
- `https://www.googleapis.com/auth/contacts.readonly` (read-only access)
- OR `https://www.googleapis.com/auth/contacts` (read/write access)

### People API Contact Structure
Google People API uses structured fields:
- `names` - Contact display names
- `emailAddresses` - Email addresses (can be multiple)
- `phoneNumbers` - Phone numbers
- `addresses` - Physical addresses
- `metadata` - Contains resource name and etag for sync

### Integration Strategy
The integration would complement your existing contact system:

**Email Header Contacts** (current):
- Extracted from From/To/CC/BCC headers during email sync
- Stored with `source: 'header'`
- Captures organic email relationships

**Google Contacts** (new):
- Imported from user's Google Contacts via People API
- Stored with `source: 'google'`
- Captures curated contact list with rich metadata

### Database Schema Changes Needed
Add to existing entities or create new fields:
```typescript
// EmailContactEntity additions
@Column({ nullable: true })
googleResourceName?: string; // People API identifier

@Column({ nullable: true })
googleEtag?: string; // For change detection

@Column({ type: 'jsonb', nullable: true })
phoneNumbers?: Array<{number: string, type?: string}>;

@Column({ type: 'jsonb', nullable: true })
addresses?: Array<{formatted: string, type?: string}>;
```