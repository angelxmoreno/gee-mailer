# Complete Implementation Specification

## Database Entities (TypeORM)

### Email Entity
```typescript
@Entity('emails')
export class Email {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ unique: true }) messageId: string;
  @Column() threadId: string;
  @Column('jsonb') from: { email: string; name?: string };
  @Column('jsonb') to: { email: string; name?: string }[];
  @Column('jsonb', { nullable: true }) cc?: { email: string; name?: string }[];
  @Column('text') subject: string;
  @Column('text', { nullable: true }) bodyText?: string;
  @Column('text', { nullable: true }) bodyHtml?: string;
  @Column('timestamp') date: Date;
  @Column({ default: false }) hasAttachments: boolean;
  @Column({ default: false }) isRead: boolean;
  @ManyToMany(() => Label) labels: Label[];
  @OneToMany(() => Attachment, att => att.email) attachments: Attachment[];
}
```

### Contact, Attachment, Label, SyncState entities - see full specs

## Gmail Integration

OAuth scopes needed:
- https://www.googleapis.com/auth/gmail.readonly
- https://www.googleapis.com/auth/gmail.modify
- https://www.googleapis.com/auth/contacts.readonly

## API Endpoints

- GET /api/emails - List with pagination
- GET /api/emails/:id - Get single
- GET /api/emails/search?q= - Search
- GET /api/emails/thread/:id - Get thread
- GET /api/contacts - List contacts
- GET /api/analytics/frequent-senders
- GET /api/analytics/unread-by-sender  
- GET /api/analytics/bulk-delete-candidates
- GET /api/attachments/:id/download

## Implementation Steps

1. Setup config (src/config/index.ts with Zod)
2. Create TypeORM entities (5 total)
3. Gmail OAuth service  
4. Gmail API wrapper (list/get messages, attachments)
5. Meilisearch service (index emails)
6. MinIO service (store attachments)
7. Import service (batch process 100 at a time)
8. Sync service (use Gmail history API)
9. Hono API server with routes
10. CLI commands (auth, import, sync, serve)

## Key Services

**GmailService**: OAuth + API wrapper
**ImportService**: Batch email import with progress
**MeilisearchService**: Full-text search indexing
**MinIOService**: Attachment storage
**AnalyticsService**: SQL queries for insights

## Complete specs are in /tmp/gmail-intelligence/docs/ on the container
Use: docker cp <container>:/tmp/gmail-intelligence/docs ./docs
