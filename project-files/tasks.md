# Gmail Intelligence - Development Tasks

## Overview

This document provides a structured task breakdown for implementing Gmail Intelligence - a local-first email analytics system. Tasks are organized by PR milestones in dependency order, designed for junior developers with clear implementation guidance.

## Project Goal

Build a system that imports 450k+ Gmail emails into PostgreSQL, provides full-text search via Meilisearch, stores attachments in MinIO, and offers REST APIs for LLM-powered analytics.

## Current State

✅ **Ready:**
- Project structure (Bun + TypeScript)
- Dependencies configured
- Docker infrastructure (PostgreSQL, Meilisearch, MinIO, Redis)
- Basic utilities (config, logging, caching, DI container)

🔧 **Needs Implementation:**
- Database entities and schema
- Gmail OAuth and API integration
- Email import system
- Search and storage services
- REST API endpoints
- Analytics features
- CLI commands

---

## PR Milestone 1: Foundation & Database Setup

**Goal:** Establish database schema and core data models

### Task 1.1: Database Configuration
**File:** `src/config/database.ts`
```typescript
// Create TypeORM DataSource configuration
// Include entities, migrations, synchronize settings
// Support for development/production environments
```

**Dependencies:** Needs `typeorm`, `pg` packages added to package.json

### Task 1.2: Email Entity
**File:** `src/entities/Email.ts`
```typescript
// Primary entity for storing email data
// Fields: id, messageId, threadId, from, to, cc, subject, bodyText, bodyHtml, date, hasAttachments, isRead
// Relationships: ManyToMany with Label, OneToMany with Attachment
// Use JSONB for email addresses: { email: string; name?: string }
```

### Task 1.3: Contact Entity
**File:** `src/entities/Contact.ts`
```typescript
// Store Gmail contacts
// Fields: id, email, name, photoUrl, lastEmailDate, emailCount
// Track interaction frequency for analytics
```

### Task 1.4: Label Entity
**File:** `src/entities/Label.ts`
```typescript
// Gmail labels (Inbox, Sent, Custom labels)
// Fields: id, labelId, name, type (system/user), color
// ManyToMany relationship with Email
```

### Task 1.5: Attachment Entity
**File:** `src/entities/Attachment.ts`
```typescript
// Email attachment metadata
// Fields: id, filename, mimeType, size, minioPath, downloadedAt
// ManyToOne relationship with Email
```

### Task 1.6: SyncState Entity
**File:** `src/entities/SyncState.ts`
```typescript
// Track Gmail sync progress
// Fields: id, lastSyncDate, lastHistoryId, totalEmails, syncedEmails
// Single row table for tracking state
```

### Task 1.7: Database Service
**File:** `src/services/DatabaseService.ts`
```typescript
// Initialize TypeORM connection
// Handle migrations
// Provide connection instance to other services
// Register in DI container
```

**Acceptance Criteria:**
- [ ] All entities defined with proper TypeORM decorators
- [ ] Database service initializes connection
- [ ] Migrations work for fresh database
- [ ] All entities registered in DI container
- [ ] `bun check` passes with no errors

---

## PR Milestone 2: Authentication & Gmail Integration

**Goal:** Implement Gmail OAuth flow and basic API wrapper

### Task 2.1: OAuth Configuration
**File:** `src/config/oauth.ts`
```typescript
// Gmail OAuth scopes: gmail.readonly, gmail.modify, contacts.readonly
// Client credentials management
// Redirect URI configuration
```

**Dependencies:** Needs `googleapis` package added

### Task 2.2: OAuth Service
**File:** `src/services/OAuthService.ts`
```typescript
// Generate authorization URL
// Handle OAuth callback and token exchange
// Token storage (encrypted in database)
// Token refresh logic
// Check if user is authenticated
```

### Task 2.3: Gmail API Client
**File:** `src/services/GmailService.ts`
```typescript
// Wrapper around googleapis Gmail API
// Methods: listMessages(), getMessage(), getAttachment()
// Rate limiting (250 quota units/user/second)
// Error handling and retry logic
// Batch operations support
```

### Task 2.4: Auth CLI Command
**File:** `src/commands/auth.ts`
```typescript
// CLI command: bun cli auth
// Starts OAuth flow
// Opens browser to authorization URL
// Handles callback and stores tokens
// Confirms successful authentication
```

**Acceptance Criteria:**
- [ ] OAuth flow works end-to-end
- [ ] Tokens stored securely and refresh automatically
- [ ] Gmail API client can list and fetch emails
- [ ] Rate limiting prevents API quota exhaustion
- [ ] CLI auth command completes successfully
- [ ] `bun check` passes with no errors

---

## PR Milestone 3: Core Data Services

**Goal:** Implement search, storage, and external service integrations

### Task 3.1: Meilisearch Service
**File:** `src/services/MeilisearchService.ts`
```typescript
// Initialize Meilisearch client
// Create email index with proper settings
// Index email content (subject, body, from, to)
// Search functionality with pagination
// Update/delete indexed documents
```

### Task 3.2: MinIO Service
**File:** `src/services/MinIOService.ts`
```typescript
// Initialize MinIO S3 client
// Create buckets for attachments
// Upload/download files
// Generate presigned URLs for downloads
// Handle large file uploads
```

### Task 3.3: Email Parser Service
**File:** `src/services/EmailParserService.ts`
```typescript
// Parse Gmail API message format
// Extract headers, body (text/html)
// Parse email addresses with names
// Handle multipart messages
// Extract attachment metadata
```

### Task 3.4: Contact Service
**File:** `src/services/ContactService.ts`
```typescript
// Import contacts from Gmail
// Update contact interaction stats
// Find or create contact records
// Analytics queries (frequent contacts)
```

**Acceptance Criteria:**
- [ ] Meilisearch indexes emails and provides fast search
- [ ] MinIO stores and serves attachments
- [ ] Email parser handles various Gmail message formats
- [ ] Contact service tracks interaction data
- [ ] All services registered in DI container
- [ ] `bun check` passes with no errors

---

## PR Milestone 4: Import System

**Goal:** Batch import Gmail emails with progress tracking

### Task 4.1: Import Service Core
**File:** `src/services/ImportService.ts`
```typescript
// Batch email import (100 emails per batch)
// Progress tracking with database updates
// Resume capability from last imported email
// Error handling and failed email tracking
// Duplicate detection by messageId
```

### Task 4.2: Attachment Worker
**File:** `src/workers/AttachmentWorker.ts`
```typescript
// Background worker for downloading attachments
// Queue-based processing (5 concurrent downloads)
// Progress tracking per attachment
// Retry logic for failed downloads
// Integration with MinIO service
```

### Task 4.3: Label Import
**File:** `src/services/LabelService.ts`
```typescript
// Import Gmail labels first
// Handle system vs user labels
// Update label metadata
// Associate emails with labels during import
```

### Task 4.4: Import CLI Command
**File:** `src/commands/import.ts`
```typescript
// CLI command: bun cli import
// Options: --full (complete import), --incremental
// Progress bar showing emails imported
// Error reporting and resume instructions
// Estimates time remaining
```

### Task 4.5: Sync Service
**File:** `src/services/SyncService.ts`
```typescript
// Incremental sync using Gmail History API
// Track changes since last sync
// Handle added, deleted, modified emails
// Update sync state after successful sync
```

**Acceptance Criteria:**
- [ ] Can import 1000+ emails in batches without errors
- [ ] Progress tracking works and persists across restarts
- [ ] Attachments download to MinIO in background
- [ ] Incremental sync detects and imports new emails
- [ ] CLI shows progress and handles interruptions gracefully
- [ ] No duplicate emails created
- [ ] `bun check` passes with no errors

---

## PR Milestone 5: REST API

**Goal:** Hono-based REST API for email access and search

### Task 5.1: API Server Setup
**File:** `src/api/server.ts`
```typescript
// Hono server configuration
// Middleware: CORS, logging, error handling
// Route registration
// Start server with graceful shutdown
```

**Dependencies:** Needs `hono` package added

### Task 5.2: Email Endpoints
**File:** `src/api/routes/emails.ts`
```typescript
// GET /api/emails - List emails with pagination
// GET /api/emails/:id - Get single email
// GET /api/emails/search?q=query - Search emails
// GET /api/emails/thread/:threadId - Get email thread
// Query parameters: page, limit, unread, labels
```

### Task 5.3: Contact Endpoints
**File:** `src/api/routes/contacts.ts`
```typescript
// GET /api/contacts - List contacts with pagination
// GET /api/contacts/:id - Get single contact
// GET /api/contacts/search?q=query - Search contacts
// Include interaction stats (email count, last email date)
```

### Task 5.4: Attachment Endpoints
**File:** `src/api/routes/attachments.ts`
```typescript
// GET /api/attachments/:id/download - Download attachment
// GET /api/attachments/:id/info - Get attachment metadata
// Stream large files efficiently
// Use MinIO presigned URLs when possible
```

### Task 5.5: API CLI Command
**File:** `src/commands/serve.ts`
```typescript
// CLI command: bun cli serve
// Start API server on configurable port
// Health check endpoint
// Graceful shutdown handling
```

**Acceptance Criteria:**
- [ ] All API endpoints work with proper HTTP status codes
- [ ] Pagination works for large datasets
- [ ] Search returns relevant results quickly (<200ms)
- [ ] Attachment downloads work for various file types
- [ ] API validates input and returns helpful error messages
- [ ] Server starts and stops cleanly via CLI
- [ ] `bun check` passes with no errors

---

## PR Milestone 6: Analytics & Insights

**Goal:** Email pattern analysis and analytics endpoints

### Task 6.1: Analytics Service
**File:** `src/services/AnalyticsService.ts`
```typescript
// Frequent senders analysis (top 20)
// Unread email analysis by sender
// Bulk delete candidates (old newsletters, promotions)
// Email volume over time
// Attachment storage usage
// Contact interaction patterns
```

### Task 6.2: Analytics Endpoints
**File:** `src/api/routes/analytics.ts`
```typescript
// GET /api/analytics/frequent-senders
// GET /api/analytics/unread-by-sender
// GET /api/analytics/bulk-delete-candidates
// GET /api/analytics/email-volume?period=month
// GET /api/analytics/storage-usage
// Include filters: date ranges, label filters
```

### Task 6.3: Analytics Queries
**File:** `src/queries/analytics.sql`
```sql
-- Raw SQL queries for complex analytics
-- Frequent senders with email counts
-- Unread emails grouped by sender
-- Old promotional emails for bulk delete
-- Email trends over time periods
```

### Task 6.4: Cache Service Enhancement
**File:** Update `src/services/CacheService.ts`
```typescript
// Cache analytics results (1 hour TTL)
// Cache frequent queries (email lists, searches)
// Invalidation strategies
// Redis-backed caching for production
```

**Acceptance Criteria:**
- [ ] Analytics queries perform well on large datasets (450k+ emails)
- [ ] Results are cached appropriately to avoid recomputation
- [ ] Analytics provide actionable insights (bulk delete suggestions)
- [ ] Date range filtering works across all analytics
- [ ] API responses include helpful metadata (totals, percentages)
- [ ] `bun check` passes with no errors

---

## PR Milestone 7: CLI Enhancement

**Goal:** Complete command-line interface with all operations

### Task 7.1: Status Command
**File:** `src/commands/status.ts`
```typescript
// CLI command: bun cli status
// Show authentication status
// Display import progress (emails imported/total)
// Show last sync date
// Database and service health checks
```

### Task 7.2: Search Command
**File:** `src/commands/search.ts`
```typescript
// CLI command: bun cli search "query"
// Search emails from command line
// Display formatted results
// Options: --limit, --unread-only, --from
```

### Task 7.3: Sync Command
**File:** `src/commands/sync.ts`
```typescript
// CLI command: bun cli sync
// Run incremental sync manually
// Show progress and results
// Handle errors gracefully
```

### Task 7.4: Analytics Command
**File:** `src/commands/analytics.ts`
```typescript
// CLI command: bun cli analytics [type]
// Types: frequent-senders, unread, bulk-delete
// Format output in tables
// Export options (JSON, CSV)
```

### Task 7.5: CLI Router
**File:** `src/cli/index.ts`
```typescript
// Main CLI entry point
// Command routing and help system
// Global options: --verbose, --config
// Error handling and user-friendly messages
```

**Acceptance Criteria:**
- [ ] All CLI commands work with helpful output
- [ ] Error messages are user-friendly
- [ ] Help system explains all commands and options
- [ ] Commands work from any directory
- [ ] Progress indicators for long-running operations
- [ ] `bun check` passes with no errors

---

## PR Milestone 8: Polish & Production Ready

**Goal:** Testing, error handling, documentation, and deployment

### Task 8.1: Error Handling Enhancement
**Files:** Update all services
```typescript
// Consistent error types across services
// Retry logic for transient failures
// Graceful degradation (search fails -> database query)
// User-friendly error messages in API/CLI
```

### Task 8.2: Configuration Enhancement
**File:** Update `src/config/index.ts`
```typescript
// Environment-specific configurations
// Validation for all required settings
// Support for .env files
// Production-ready defaults
```

### Task 8.3: Testing Setup
**File:** `src/test/setup.ts`
```typescript
// Test database configuration
// Mock services for unit tests
// Integration test helpers
// Test data fixtures
```

### Task 8.4: Key Service Tests
**Files:** `src/test/**/*.test.ts`
```typescript
// Unit tests for EmailParserService
// Integration tests for ImportService
// API endpoint tests
// CLI command tests
```

### Task 8.5: Docker Production Setup
**File:** `docker/docker-compose.prod.yml`
```yaml
# Production Docker configuration
# Environment variable management
# Health checks for all services
# Volume management for data persistence
```

### Task 8.6: Documentation
**File:** `docs/API.md`
```markdown
# Complete API documentation
# Authentication setup guide
# Deployment instructions
# Troubleshooting guide
```

**Acceptance Criteria:**
- [ ] All critical services have unit tests
- [ ] API endpoints have integration tests
- [ ] Error handling prevents crashes and provides helpful messages
- [ ] Production Docker setup works
- [ ] Documentation covers setup, API, and troubleshooting
- [ ] Performance meets targets (1000 emails/min import, <100ms search)
- [ ] `bun check` passes with no errors

---

## Additional Notes for Junior Developers

### Before Starting Each Task:
1. Read the related project documentation in `project-files/`
2. Check existing code patterns in `src/utils/` for DI container usage
3. Run `bun check` before and after changes
4. Test your changes with `bun test`

### Development Workflow:
1. Start Docker services: `bun docker:start`
2. Run in development mode: `bun dev`
3. Check code quality: `bun check`
4. Test changes: `bun test`

### Common Patterns:
- Use Zod for all input validation
- Register services in DI container
- Follow existing TypeScript strict patterns
- Use Pino logger for all logging
- Prefer `protected` over `private` class members

### When Stuck:
- Check CLAUDE.md for development commands
- Review existing utility functions
- Look at Docker logs: `bun docker:logs`
- Verify environment variables in `.env`

### Performance Considerations:
- Batch database operations (100 records at a time)
- Use database transactions for related operations
- Index frequently queried columns
- Cache expensive analytics queries
- Stream large file operations

### Security Notes:
- Never log or commit OAuth tokens
- Validate all user inputs with Zod
- Use parameterized queries for SQL
- Encrypt sensitive data at rest
- Follow principle of least privilege for API access