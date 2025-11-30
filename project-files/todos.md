# Gmail Intelligence - Project Todos

## Current Project State Analysis

Based on the project files and current codebase implementation, here's a comprehensive list of remaining tasks to complete the Gmail Intelligence system.

## High Priority (P0) - Core Functionality

### Database Schema & Entities
- [ ] **Create remaining missing entities**
  - [ ] `AttachmentEntity` for email attachment metadata
  - [ ] Complete `HeaderEntity` implementation if not fully implemented
  - [ ] `MessagePartEntity` entity relationship fixes (verify user scoping works)

### Gmail Integration Completion
- [ ] **OAuth Setup & Management**
  - [ ] Implement `OAuthService` for token management and refresh
  - [ ] Create OAuth CLI command for initial authentication
  - [ ] Add token encryption and secure storage
  - [ ] Handle token refresh automatically

- [ ] **Gmail Service Enhancements**
  - [ ] Add attachment downloading functionality
  - [ ] Verify all Gmail API rate limiting is proper
  - [ ] Test large mailbox handling (450k+ emails)

### Google Contacts Integration (P1)
- [ ] **Google People API Integration** (See [detailed plan](google-contacts-integration-plan.md))
  - [ ] Add People API OAuth scope (`contacts.readonly`) - requires user re-auth
  - [ ] Create `GooglePeopleService` for contact fetching and pagination
  - [ ] Add Google-specific fields to contact entities (resourceName, etag, phoneNumbers, addresses)
  - [ ] Implement contact mapping utilities (People API → existing entities)
  - [ ] Create `GoogleContactsSyncProcessor` with queue integration
  - [ ] Add CLI command for Google Contacts sync (`bun contacts:sync`)
  - [ ] Handle contact deduplication between header-sourced and Google-sourced contacts

### Search & Storage Services
- [ ] **Meilisearch Integration**
  - [ ] Implement `MeilisearchService` for email indexing
  - [ ] Create email search index with proper settings
  - [ ] Add search functionality with pagination
  - [ ] Implement search result ranking and filtering

- [ ] **MinIO Integration**
  - [ ] Implement `MinIOService` for attachment storage
  - [ ] Create bucket management and file operations
  - [ ] Add presigned URL generation for downloads
  - [ ] Handle large file uploads efficiently

### Email Import System
- [ ] **Email Processing Services**
  - [ ] Create `EmailParserService` for Gmail message parsing
  - [ ] Implement `ContactService` for contact tracking
  - [ ] Add attachment processing workflow
  - [ ] Create email deduplication logic

- [ ] **Background Workers**
  - [ ] Implement attachment download worker
  - [ ] Add email indexing worker for Meilisearch
  - [ ] Create contact sync worker
  - [ ] Add cleanup/maintenance workers

## Medium Priority (P1) - API & User Interface

### REST API Development
- [ ] **Hono API Server**
  - [ ] Set up Hono server with middleware
  - [ ] Implement CORS, logging, error handling
  - [ ] Add request validation and rate limiting

- [ ] **Email Endpoints**
  - [ ] `GET /api/emails` - List emails with pagination
  - [ ] `GET /api/emails/:id` - Get single email
  - [ ] `GET /api/emails/search` - Search emails
  - [ ] `GET /api/emails/thread/:threadId` - Get email thread

- [ ] **Contact Endpoints**
  - [ ] `GET /api/contacts` - List contacts
  - [ ] `GET /api/contacts/:id` - Get single contact
  - [ ] `GET /api/contacts/search` - Search contacts

- [ ] **Attachment Endpoints**
  - [ ] `GET /api/attachments/:id/download` - Download attachment
  - [ ] `GET /api/attachments/:id/info` - Get attachment metadata
  - [ ] Stream large files efficiently

### Analytics System
- [ ] **Analytics Service**
  - [ ] Implement frequent senders analysis
  - [ ] Add unread email analysis by sender
  - [ ] Create bulk delete candidates identification
  - [ ] Add email volume over time analysis

- [ ] **Analytics Endpoints**
  - [ ] `GET /api/analytics/frequent-senders`
  - [ ] `GET /api/analytics/unread-by-sender`
  - [ ] `GET /api/analytics/bulk-delete-candidates`
  - [ ] `GET /api/analytics/email-volume`
  - [ ] `GET /api/analytics/storage-usage`

### CLI Enhancement
- [ ] **Additional CLI Commands**
  - [ ] `bun cli status` - Show sync and system status
  - [ ] `bun cli search "query"` - Search emails from CLI
  - [ ] `bun cli analytics [type]` - Display analytics
  - [ ] `bun cli serve` - Start API server

## Low Priority (P2) - Polish & Production

### Testing Infrastructure
- [ ] **Test Setup**
  - [ ] Create test database configuration
  - [ ] Set up mock services for unit tests
  - [ ] Add integration test helpers
  - [ ] Create test data fixtures

- [ ] **Service Tests**
  - [ ] Unit tests for `EmailParserService`
  - [ ] Integration tests for `ImportService`
  - [ ] API endpoint tests
  - [ ] CLI command tests

### Configuration & Deployment
- [ ] **Production Configuration**
  - [ ] Environment-specific configurations
  - [ ] Production Docker setup
  - [ ] Health checks for all services
  - [ ] Volume management for data persistence

- [ ] **Documentation**
  - [ ] Complete API documentation
  - [ ] Authentication setup guide
  - [ ] Deployment instructions
  - [ ] Troubleshooting guide

### Performance & Monitoring
- [ ] **Performance Optimization**
  - [ ] Optimize database queries and indexes
  - [ ] Cache expensive analytics queries
  - [ ] Implement proper error handling
  - [ ] Add monitoring and logging

## CodeRabbit Review Issues (P3) - Schema Fixes

- [ ] **Soft-Delete Partial Index**
  - [ ] Create migration for partial unique index that excludes soft-deleted records
  - [ ] Apply to MessageLabelEntity unique constraint: `WHERE deleted_at IS NULL`

## Completed ✅

### Core Infrastructure
- ✅ Project setup with Bun + TypeScript
- ✅ Docker infrastructure (PostgreSQL, Meilisearch, MinIO, Redis)
- ✅ Basic utilities (config, logging, caching, DI container)
- ✅ TypeORM configuration and base entities

### Database Entities (Recent Work)
- ✅ `EmailMessageEntity` with proper constraints
- ✅ `LabelEntity` with user scoping
- ✅ `MessageLabelEntity` for many-to-many relationships
- ✅ `SyncProgressEntity` for tracking sync state
- ✅ `UserEntity` with OAuth and sync fields

### Contact System Entities (Recently Completed)
- ✅ `EmailContactEntity` for contact management with source tracking
- ✅ `EmailAddressEntity` for individual email addresses with usage stats
- ✅ `DisplayNameEntity` for tracking all display name variations per email
- ✅ `EmailAddressUsageEntity` for detailed usage audit trail per message
- ✅ `ContactProcessingService` for email header processing and contact extraction
- ✅ Contact processing integration into sync pipeline via MessageProcessingService

### Queue System (Recent Major Work)
- ✅ BullMQ integration with 4 specialized queues
- ✅ Gmail sync processors (initial, incremental, batch, labels)
- ✅ Type-safe job schemas with Zod validation
- ✅ Generated producers and workers
- ✅ PM2 configuration for production
- ✅ Modernized CLI with async job enqueueing

### Gmail Services
- ✅ `GmailService` with history API, labels, message fetching
- ✅ Advanced caching with TaggedKeyv
- ✅ Rate limiting and batch operations
- ✅ Incremental sync with history tracking

### Entity Relationship Fixes
- ✅ Fixed uniqueness constraints for multi-user support
- ✅ Proper user scoping across all entities
- ✅ Database foreign key relationships

## Implementation Notes

### Current Architecture Strengths
- **Queue-based sync system**: Non-blocking, scalable background processing
- **Comprehensive Gmail integration**: Full sync, incremental updates, labels
- **Multi-tenant ready**: Proper user isolation and constraints
- **Production architecture**: PM2, workers, proper error handling

### Key Services Ready
- `GmailService` - Complete with history API and caching
- `SyncStateService` - User sync state management
- `MessageProcessingService` - Gmail data processing
- Queue processors - All major sync operations implemented

### Next Implementation Focus
1. **Complete missing entities** (Contact, Attachment)
2. **Build search/storage services** (Meilisearch, MinIO)
3. **Create REST API** with Hono
4. **Add analytics system** for email insights

### Development Workflow
```bash
# Start infrastructure
bun docker:start

# Run development
bun dev

# Check quality
bun check

# Test changes
bun test

# Run queue workers
bun workers:dev
```

### Architecture Notes
- Uses dependency injection with tsyringe
- TypeORM with PostgreSQL for persistence
- BullMQ for background job processing
- TaggedKeyv for intelligent caching
- Structured logging with Pino
- Type-safe configuration with Zod

## Estimated Completion Time
- **P0 (Core)**: 2-3 weeks for full email/contact/attachment system
- **P1 (API)**: 1-2 weeks for complete REST API and analytics
- **P2 (Polish)**: 1 week for testing, documentation, production setup

**Total**: ~6-8 weeks for complete Gmail Intelligence system ready for production use.