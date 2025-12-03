import crypto from 'node:crypto';

export class EncryptionService {
    protected secret: string;
    protected readonly algorithm = 'aes-256-gcm';
    protected readonly keyLength = 32; // 256 bits
    protected readonly ivLength = 16; // 128 bits for GCM

    constructor(secret: string) {
        if (secret.length < 32) {
            throw new Error('Encryption secret must be at least 32 characters');
        }
        this.secret = secret;
    }

    /**
     * Encrypt plaintext using AES-256-GCM
     */
    encrypt(plaintext: string): string {
        const iv = crypto.randomBytes(this.ivLength);
        const key = this.deriveKey();

        const cipher = crypto.createCipheriv(this.algorithm, key, iv);

        let encrypted = cipher.update(plaintext, 'utf8', 'hex');
        encrypted += cipher.final('hex');

        const authTag = cipher.getAuthTag();

        // Format: iv:encrypted:authTag (all hex encoded)
        return `${iv.toString('hex')}:${encrypted}:${authTag.toString('hex')}`;
    }

    /**
     * Decrypt ciphertext using AES-256-GCM
     */
    decrypt(ciphertext: string): string {
        const parts = ciphertext.split(':');
        if (parts.length !== 3) {
            throw new Error('Invalid encrypted data format');
        }

        const ivHex = parts[0] as string;
        const encryptedHex = parts[1] as string;
        const authTagHex = parts[2] as string;

        const iv = Buffer.from(ivHex, 'hex');
        const encrypted = encryptedHex;
        const authTag = Buffer.from(authTagHex, 'hex');
        const key = this.deriveKey();

        const decipher = crypto.createDecipheriv(this.algorithm, key, iv);
        decipher.setAuthTag(authTag);

        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');

        return decrypted;
    }

    /**
     * Check if value is encrypted with our format
     */
    isEncrypted(value: string): boolean {
        // Our format: 32-char hex IV : variable hex encrypted : 32-char hex authTag
        return /^[a-f0-9]{32}:[a-f0-9]+:[a-f0-9]{32}$/i.test(value);
    }

    /**
     * Check if value uses legacy Iron format (for migration compatibility)
     */
    isLegacyIronFormat(value: string): boolean {
        return value.startsWith('Fe26.2**');
    }

    /**
     * Derive encryption key from secret using PBKDF2
     */
    protected deriveKey(): Buffer {
        // Use a fixed salt for deterministic key derivation
        // In production, you might want to use a configurable salt
        const salt = 'gee-mailer-encryption-salt';
        return crypto.pbkdf2Sync(this.secret, salt, 100000, this.keyLength, 'sha256');
    }
}

/**
 * Factory function to create EncryptionService with the configured secret.
 */
export function createEncryptionService(): EncryptionService {
    const secret = Bun.env.TOKEN_ENCRYPTION_SECRET || 'this-is-the-default-encryption-secret';
    return new EncryptionService(secret);
}
