# Email Contact System Design

## Overview

This document outlines the design for tracking contacts extracted from email headers (from, to, cc, bcc). This system focuses on header-based contacts only - Google Contacts integration will be added separately later.

## Core Entities

### 1. EmailContactEntity (The Person)
```typescript
@Entity()
@Index(['userId', 'primaryEmailAddressId'], { unique: true })
export class EmailContactEntity extends AppEntity {
    @Column()
    userId: number; // User who owns this contact

    @Column()
    primaryEmailAddressId: number; // FK to EmailAddressEntity

    @Column({ nullable: true })
    primaryDisplayNameId?: number|null; // FK to DisplayNameEntity (most common/recent)

    @Column({ nullable: true , default: null })
    emailCount?: number; // Computed field - updated via beforeSave hook

    @Column({ nullable: true , default:null})
    lastEmailDate?: Date|null; // Computed field - updated via beforeSave hook

    @Column({ default: 'header' })
    source: 'header' | 'google'; // Source of contact

    // Relationships
    @ManyToOne(() => EmailAddressEntity)
    @JoinColumn({ name: 'primary_email_address_id' })
    primaryEmailAddress: Relation<EmailAddressEntity>;

    @ManyToOne(() => DisplayNameEntity)
    @JoinColumn({ name: 'primary_display_name_id' })
    primaryDisplayName?: Relation<DisplayNameEntity>;

    @OneToMany(() => EmailAddressEntity, address => address.contact)
    emailAddresses: Relation<EmailAddressEntity[]>;
}
```

### 2. EmailAddressEntity (Specific Email Addresses)
```typescript
@Entity()
@Index(['userId', 'emailAddress'], { unique: true })
export class EmailAddressEntity extends AppEntity {
    @Column()
    userId: number; // For efficient querying

    @Column()
    emailAddress: string; // The actual email address (john@example.com)

    @Column({ nullable: true, default: null })
    usageCount?: number|null; // Computed field - DO NOT update manually

    @Column({ nullable: true, default: null })
    lastSeenDate?: Date|null; // Computed field - DO NOT update manually

    @Column({ default: false })
    isPrimary: boolean; // Is this the primary address for the contact?

    @Column({ nullable: true , default:null})
    contactId?: number|null; // FK to EmailContactEntity (nullable for orphaned addresses)

    // Relationships
    @ManyToOne(() => EmailContactEntity, contact => contact.emailAddresses, {
        onDelete: 'SET NULL'
    })
    @JoinColumn({ name: 'contact_id' })
    contact?: Relation<EmailContactEntity>;

    @OneToMany(() => DisplayNameEntity, displayName => displayName.emailAddress)
    displayNames: Relation<DisplayNameEntity[]>;

    @OneToMany(() => EmailAddressUsageEntity, usage => usage.emailAddress)
    usages: Relation<EmailAddressUsageEntity[]>;
}
```

### 3. DisplayNameEntity (Capture All Display Name Variations)
```typescript
@Entity()
@Index(['userId', 'emailAddressId', 'displayName'], { unique: true })
export class DisplayNameEntity extends AppEntity {
    @Column()
    userId: number; // For efficient querying

    @Column()
    emailAddressId: number; // FK to EmailAddressEntity

    @Column()
    displayName: string; // The display name ("John Doe", "John", "John D.", etc.)

    @Column({ nullable: true, default: null })
    usageCount?: number|null; // Computed field - DO NOT update manually

    @Column({ nullable: true, default: null })
    firstSeenDate?: Date|null; // When this display name was first seen

    @Column({ nullable: true, default: null })
    lastSeenDate?: Date|null; // Computed field - DO NOT update manually

    // Relationships
    @ManyToOne(() => EmailAddressEntity, emailAddress => emailAddress.displayNames, {
        onDelete: 'CASCADE'
    })
    @JoinColumn({ name: 'email_address_id' })
    emailAddress: Relation<EmailAddressEntity>;

    @OneToMany(() => EmailAddressUsageEntity, usage => usage.displayName)
    usages: Relation<EmailAddressUsageEntity[]>;
}
```

### 4. EmailAddressUsageEntity (Track Each Email Interaction)
```typescript
@Entity()
@Index(['userId', 'emailAddressId', 'emailMessageId'], { unique: true })
export class EmailAddressUsageEntity extends AppEntity {
    @Column()
    userId: number; // For efficient querying

    @Column()
    emailAddressId: number; // FK to EmailAddressEntity

    @Column({ nullable: true, default: null })
    displayNameId?: number|null; // FK to DisplayNameEntity (what display name was used)

    @Column()
    emailMessageId: number; // FK to EmailMessageEntity

    @Column({ type: 'enum', enum: ['from', 'to', 'cc', 'bcc'] })
    headerType: 'from' | 'to' | 'cc' | 'bcc'; // Which header this address appeared in

    @Column()
    usedAt: Date; // When this usage occurred

    // Relationships
    @ManyToOne(() => EmailAddressEntity, emailAddress => emailAddress.usages, {
        onDelete: 'CASCADE'
    })
    @JoinColumn({ name: 'email_address_id' })
    emailAddress: Relation<EmailAddressEntity>;

    @ManyToOne(() => DisplayNameEntity, displayName => displayName.usages, {
        onDelete: 'SET NULL'
    })
    @JoinColumn({ name: 'display_name_id' })
    displayName?: Relation<DisplayNameEntity>;

    @ManyToOne(() => EmailMessageEntity, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'email_message_id' })
    emailMessage: Relation<EmailMessageEntity>;
}
```

## Data Flow Design

### Processing Email Headers
When processing an email with headers like:
```
From: "John Doe" <john@example.com>
To: "Jane Smith" <jane@company.com>, "Bob Wilson" <bob@company.com>
Cc: "Mary Johnson" <mary@example.com>
```

**Step-by-step Processing:**

1. **Extract Header Data**
   ```typescript
   const headerData = [
     { email: 'john@example.com', displayName: 'John Doe', headerType: 'from' },
     { email: 'jane@company.com', displayName: 'Jane Smith', headerType: 'to' },
     { email: 'bob@company.com', displayName: 'Bob Wilson', headerType: 'to' },
     { email: 'mary@example.com', displayName: 'Mary Johnson', headerType: 'cc' }
   ];
   ```

2. **For Each Email Address:**
   - Find or create `EmailAddressEntity`
   - Find or create `DisplayNameEntity` (if displayName provided)
   - Create `EmailAddressUsageEntity` record
   - Update contact associations

3. **Contact Management:**
   - If EmailAddress has no contact → create new `EmailContactEntity`
   - Set primary email address and display name
   - Leave computed fields (usageCount, lastSeenDate) for hooks

### Contact Consolidation (Future Feature)
```typescript
// Example: Merge two contacts when user identifies they're the same person
async consolidateContacts(keepContactId: number, mergeContactId: number) {
    // Move all email addresses to the keep contact
    await this.emailAddressRepo.update(
        { contactId: mergeContactId },
        { contactId: keepContactId }
    );

    // Delete the merged contact
    await this.emailContactRepo.delete(mergeContactId);

    // Computed fields will be recalculated via hooks
}
```

## Repository Pattern

### EmailContactRepository
```typescript
export class EmailContactRepository extends BaseRepositoryService<EmailContactEntity> {
    async findByEmailAddress(userId: number, emailAddress: string): Promise<EmailContactEntity | null> {
        return this.repository
            .createQueryBuilder('contact')
            .innerJoin('contact.emailAddresses', 'address')
            .where('contact.userId = :userId', { userId })
            .andWhere('address.emailAddress = :emailAddress', { emailAddress })
            .getOne();
    }

    async getTopContacts(userId: number, limit: number = 20): Promise<EmailContactEntity[]> {
        return this.repository.find({
            where: { userId },
            order: { emailCount: 'DESC' },
            take: limit,
            relations: ['primaryEmailAddress', 'primaryDisplayName']
        });
    }
}
```

### EmailAddressRepository
```typescript
export class EmailAddressRepository extends BaseRepositoryService<EmailAddressEntity> {
    async findOrCreate(userId: number, emailAddress: string): Promise<EmailAddressEntity> {
        let address = await this.repository.findOne({
            where: { userId, emailAddress }
        });

        if (!address) {
            address = await this.repository.save({
                userId,
                emailAddress,
                isPrimary: false,
                usageCount: 0, // Will be computed via hooks
                lastSeenDate: null // Will be computed via hooks
            });
        }

        return address;
    }
}
```

### ContactProcessingService
```typescript
@singleton()
export class ContactProcessingService {
    constructor(
        private emailContactRepo: EmailContactRepository,
        private emailAddressRepo: EmailAddressRepository,
        private displayNameRepo: DisplayNameRepository,
        private usageRepo: EmailAddressUsageRepository
    ) {}

    async processEmailHeaders(
        userId: number,
        emailMessageId: number,
        headers: Array<{ email: string; displayName?: string; headerType: string }>
    ): Promise<void> {
        for (const header of headers) {
            await this.processEmailHeader(userId, emailMessageId, header);
        }
    }

    private async processEmailHeader(
        userId: number,
        emailMessageId: number,
        header: { email: string; displayName?: string; headerType: string }
    ): Promise<void> {
        // 1. Find or create email address
        const emailAddress = await this.emailAddressRepo.findOrCreate(userId, header.email);

        // 2. Find or create display name (if provided)
        let displayName: DisplayNameEntity | undefined;
        if (header.displayName) {
            displayName = await this.displayNameRepo.findOrCreate(
                userId,
                emailAddress.id,
                header.displayName
            );
        }

        // 3. Create usage record
        await this.usageRepo.create({
            userId,
            emailAddressId: emailAddress.id,
            displayNameId: displayName?.id,
            emailMessageId,
            headerType: header.headerType as any,
            usedAt: new Date()
        });

        // 4. Ensure contact exists
        if (!emailAddress.contactId) {
            await this.createContactForEmailAddress(userId, emailAddress, displayName);
        }

        // Note: Computed fields (usageCount, lastSeenDate) will be updated via beforeSave hooks
    }

    private async createContactForEmailAddress(
        userId: number,
        emailAddress: EmailAddressEntity,
        primaryDisplayName?: DisplayNameEntity
    ): Promise<void> {
        const contact = await this.emailContactRepo.create({
            userId,
            primaryEmailAddressId: emailAddress.id,
            primaryDisplayNameId: primaryDisplayName?.id,
            source: 'header',
            emailCount: 0, // Will be computed via hooks
            lastEmailDate: null // Will be computed via hooks
        });

        // Update email address to reference the contact
        await this.emailAddressRepo.update(emailAddress.id, {
            contactId: contact.id,
            isPrimary: true
        });
    }
}
```

## Computed Field Strategy (Future Implementation)

### TypeORM Entity Hooks
```typescript
// Future implementation via TypeORM subscribers or entity hooks
@EntityRepository(EmailAddressEntity)
export class EmailAddressEntity extends AppEntity {
    @BeforeUpdate()
    @BeforeInsert()
    async computeFields() {
        // Count usages for this email address
        this.usageCount = await this.usages?.length || 0;

        // Get latest usage date
        const latestUsage = await this.usages
            ?.sort((a, b) => b.usedAt.getTime() - a.usedAt.getTime())[0];
        this.lastSeenDate = latestUsage?.usedAt;
    }
}
```

## Benefits of This Design

✅ **Complete Display Name Tracking**: Captures every variation of how someone's name appears
✅ **Rich Usage Analytics**: Track exactly how each email address is used across emails
✅ **Flexible Contact Management**: Easy to merge, split, and organize contacts
✅ **Computed Field Ready**: Framework for automatic stats calculation via hooks
✅ **Query Optimized**: Efficient lookups with proper indexing
✅ **Audit Trail**: Complete history of how contact data evolved
✅ **Scalable**: Handles millions of email addresses and interactions

## Implementation Order

1. **Phase 1**: Create all 4 entities and their repositories
2. **Phase 2**: Implement `ContactProcessingService` for basic header processing
3. **Phase 3**: Integrate with email import pipeline
4. **Phase 4**: Add computed field hooks for automatic stats
5. **Phase 5**: Build contact management and consolidation features

This design provides a solid foundation for comprehensive email contact tracking while remaining flexible for future enhancements.