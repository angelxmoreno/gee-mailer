# Gmail Intelligence - Project Specification

## Overview

Gmail Intelligence is a local-first email intelligence and analytics system that imports Gmail emails and contacts into a searchable database, providing LLM-powered insights and analytics.

## Key Requirements

- Import 450k+ Gmail emails efficiently
- Full-text search powered by Meilisearch
- Store attachments in MinIO (S3-compatible storage)
- Provide REST API for LLM access
- Email analytics and pattern detection
- Local-only deployment (Docker-based)
- OAuth 2.0 authentication with Gmail

## Technology Stack

- **Runtime:** Bun with TypeScript
- **Database:** PostgreSQL with TypeORM
- **Search:** Meilisearch
- **Storage:** MinIO
- **API Framework:** Hono
- **OAuth:** googleapis npm package
- **CLI:** Native Bun runtime

## Implementation Phases

### Phase 1: Foundation
- Project setup with Bun
- Docker Compose configuration
- TypeORM entities
- Database connection
- Configuration management

### Phase 2: Authentication
- OAuth 2.0 flow implementation
- Token storage and refresh
- Gmail API client wrapper

### Phase 3: Import System
- Label import
- Email metadata import
- Batch processing
- Progress tracking
- Error handling and resume capability

### Phase 4: Search & Storage
- Meilisearch integration
- Email indexing
- Attachment download to MinIO
- Background workers for attachments

### Phase 5: API
- Hono server setup
- Email endpoints
- Contact endpoints
- Search endpoints
- Attachment serving

### Phase 6: Analytics
- Analytics service
- Pattern detection algorithms
- Analytics API endpoints

### Phase 7: Polish
- CLI improvements
- Progress bars
- Error messages
- Documentation
- Testing

## Performance Targets

- Import: ~1000 emails/minute
- Search: <100ms for typical queries
- API response: <200ms for most endpoints
- Attachment download: 5 concurrent downloads
- Database: Handle 1M+ emails
