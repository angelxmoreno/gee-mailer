import type { EncryptionService } from '@app/services/EncryptionService';
import { createEncryptionService } from '@app/services/EncryptionService';
import type { ValueTransformer } from 'typeorm';

export class EncryptTransformer implements ValueTransformer {
    constructor(protected encryptionService: EncryptionService) {}

    /**
     * Converts plain data -> encrypted string before saving.
     */
    to(value: string | null): string | null {
        if (!value) return value;

        return this.encryptionService.encrypt(value);
    }

    /**
     * Converts encrypted string -> decrypted data when reading from DB.
     * Handles both new format and legacy Iron format for migration compatibility.
     */
    from(value: string | null): string | null {
        if (!value) return value;

        // Handle legacy Iron-encrypted data during migration
        if (this.encryptionService.isLegacyIronFormat(value)) {
            // Return as-is for now - could implement Iron decryption if needed
            // For now, assume legacy data will be gradually migrated
            return value;
        }

        if (!this.encryptionService.isEncrypted(value)) {
            return value; // Plaintext (migration compatibility)
        }

        try {
            return this.encryptionService.decrypt(value);
        } catch (error) {
            throw new Error('Data decryption failed - possible corruption or key mismatch', { cause: error });
        }
    }

    /**
     * Check if value is encrypted
     */
    isEncrypted(value: string): boolean {
        return this.encryptionService.isEncrypted(value);
    }
}

/**
 * Factory function to create EncryptTransformer with the configured encryption service.
 * Avoids circular dependency by using environment variable directly.
 */
export function createEncryptTransformer(): EncryptTransformer {
    const encryptionService = createEncryptionService();
    return new EncryptTransformer(encryptionService);
}
