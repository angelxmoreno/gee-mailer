import * as Iron from 'iron-webcrypto';
import type { ValueTransformer } from 'typeorm';

export class TokenEncryptTransformer implements ValueTransformer {
    protected tokenSecret: string;

    constructor(tokenSecret: string) {
        if (tokenSecret.length < 32) {
            throw new Error('TOKEN_ENCRYPTION_SECRET must be at least 32 characters');
        }
        this.tokenSecret = tokenSecret;
    }

    /**
     * Converts plain token -> encrypted sealed string before saving.
     */
    async to(value: string | null): Promise<string | null> {
        if (!value) return value;

        // Seal converts any JSON-serializable data → encrypted, integrity-checked blob
        return await Iron.seal(value, this.tokenSecret, Iron.defaults);
    }

    /**
     * Converts sealed string → decrypted token when reading from DB.
     */
    async from(value: string | null): Promise<string | null> {
        if (!value || !this.isEncrypted(value)) {
            return value;
        }

        try {
            // Unseal restores the original plaintext token
            const result = await Iron.unseal(value, this.tokenSecret, Iron.defaults);
            return result as string;
        } catch (error) {
            throw new Error('Token decryption failed - possible corruption or key mismatch', { cause: error });
        }
    }

    isEncrypted(value: string): boolean {
        return value.startsWith('Fe26.2**');
    }
}

/**
 * Factory function to create TokenEncryptTransformer with the configured secret.
 * Avoids circular dependency by using environment variable directly.
 */
export function createTokenEncryptTransformer(): TokenEncryptTransformer {
    const secret = Bun.env.TOKEN_ENCRYPTION_SECRET || 'this-is-the-default-token-secret';
    return new TokenEncryptTransformer(secret);
}
