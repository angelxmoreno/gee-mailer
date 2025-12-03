import 'reflect-metadata';
import { beforeEach, describe, expect, test } from 'bun:test';
import type { ValueTransformer } from 'typeorm';

interface TokenEncryptTransformerConstructor {
    new (
        tokenSecret: string
    ): ValueTransformer & {
        isEncrypted(value: string): boolean;
        to(value: string | null): Promise<string | null>;
        from(value: string | null): Promise<string | null>;
    };
}

describe('TokenEncryptTransformer', () => {
    let TokenEncryptTransformer: TokenEncryptTransformerConstructor;
    let transformer: ValueTransformer & {
        isEncrypted(value: string): boolean;
        to(value: string | null): Promise<string | null>;
        from(value: string | null): Promise<string | null>;
    };
    const testSecret = 'test-secret-key-that-is-at-least-32-characters-long-for-security';
    const shortSecret = 'short';
    const testToken = 'ya29.a0AfH6SMCtest-oauth-token-here';

    beforeEach(async () => {
        // Import after mocking to avoid circular dependency
        const module = await import('@app/modules/typeorm/transformers/TokenEncryptTransformer');
        TokenEncryptTransformer = module.TokenEncryptTransformer;
        transformer = new TokenEncryptTransformer(testSecret);
    });

    describe('constructor', () => {
        test('should accept a valid secret', async () => {
            const module = await import('@app/modules/typeorm/transformers/TokenEncryptTransformer');
            expect(() => new module.TokenEncryptTransformer(testSecret)).not.toThrow();
        });

        test('should throw error for secret shorter than 32 characters', async () => {
            const module = await import('@app/modules/typeorm/transformers/TokenEncryptTransformer');
            expect(() => new module.TokenEncryptTransformer(shortSecret)).toThrow(
                'TOKEN_ENCRYPTION_SECRET must be at least 32 characters'
            );
        });
    });

    describe('factory function', () => {
        test('should create transformer with environment variable', async () => {
            const module = await import('@app/modules/typeorm/transformers/TokenEncryptTransformer');
            const transformer = module.createTokenEncryptTransformer();

            expect(transformer).toBeDefined();
            expect(transformer.isEncrypted).toBeFunction();
        });
    });

    describe('isEncrypted', () => {
        test('should return true for Iron-sealed strings', () => {
            const ironSealedString = 'Fe26.2**hash**payload**mac';
            expect(transformer.isEncrypted(ironSealedString)).toBe(true);
        });

        test('should return false for plaintext OAuth tokens', () => {
            expect(transformer.isEncrypted(testToken)).toBe(false);
        });

        test('should return false for empty string', () => {
            expect(transformer.isEncrypted('')).toBe(false);
        });

        test('should return false for random strings', () => {
            expect(transformer.isEncrypted('random-string')).toBe(false);
            expect(transformer.isEncrypted('Fe26.1**invalid**format')).toBe(false);
            expect(transformer.isEncrypted('not-iron-sealed')).toBe(false);
        });

        test('should return false for strings that almost match Iron format', () => {
            expect(transformer.isEncrypted('Fe26.2*incomplete')).toBe(false);
            expect(transformer.isEncrypted('Fe26.3**wrong-version')).toBe(false);
        });
    });

    describe('to (encrypt)', () => {
        test('should return null for null input', async () => {
            const result = await transformer.to(null);
            expect(result).toBeNull();
        });

        test('should encrypt non-null tokens', async () => {
            const result = await transformer.to(testToken);

            expect(result).not.toBeNull();
            expect(result).not.toBe(testToken);
            expect(result?.startsWith('Fe26.2**')).toBe(true);
        });

        test('should produce different encrypted values for same input', async () => {
            const result1 = await transformer.to(testToken);
            const result2 = await transformer.to(testToken);

            // Due to random IV/salt, encrypted values should be different
            expect(result1).not.toBe(result2);

            // But both should be valid Iron-sealed strings
            expect(result1?.startsWith('Fe26.2**')).toBe(true);
            expect(result2?.startsWith('Fe26.2**')).toBe(true);
        });

        test('should handle empty strings', async () => {
            const result = await transformer.to('');
            expect(result).toBe('');
        });

        test('should encrypt various token formats', async () => {
            const tokens = [
                'ya29.a0AfH6SMC-google-oauth-token',
                '1//0G-refresh-token-format',
                'short',
                'very-long-token-with-many-characters-and-special-symbols-@#$%^&*()',
            ];

            for (const token of tokens) {
                const result = await transformer.to(token);
                expect(result).not.toBeNull();
                expect(result?.startsWith('Fe26.2**')).toBe(true);
            }
        });
    });

    describe('from (decrypt)', () => {
        test('should return null for null input', async () => {
            const result = await transformer.from(null);
            expect(result).toBeNull();
        });

        test('should return plaintext tokens unchanged', async () => {
            const result = await transformer.from(testToken);
            expect(result).toBe(testToken);
        });

        test('should decrypt Iron-sealed tokens correctly', async () => {
            // First encrypt a token
            const encrypted = await transformer.to(testToken);

            // Then decrypt it
            const decrypted = await transformer.from(encrypted);

            expect(decrypted).toBe(testToken);
        });

        test('should handle empty strings', async () => {
            const result = await transformer.from('');
            expect(result).toBe('');
        });

        test('should throw error for corrupted encrypted tokens', async () => {
            const corruptedToken = 'Fe26.2**invalid**corrupted**data';

            await expect(transformer.from(corruptedToken)).rejects.toThrow(
                'Token decryption failed - possible corruption or key mismatch'
            );
        });

        test('should throw error when using wrong secret', async () => {
            // Encrypt with one secret
            const encrypted = await transformer.to(testToken);

            // Try to decrypt with different secret
            const wrongTransformer = new TokenEncryptTransformer('different-secret-key-that-is-at-least-32-chars');

            await expect(wrongTransformer.from(encrypted)).rejects.toThrow(
                'Token decryption failed - possible corruption or key mismatch'
            );
        });

        test('should preserve original error in cause', async () => {
            const corruptedToken = 'Fe26.2**invalid**corrupted**data';

            try {
                await transformer.from(corruptedToken);
                expect.unreachable('Should have thrown an error');
            } catch (error) {
                expect((error as Error).message).toBe('Token decryption failed - possible corruption or key mismatch');
                expect((error as Error).cause).toBeDefined();
            }
        });
    });

    describe('round-trip encryption/decryption', () => {
        test('should preserve original token through encrypt/decrypt cycle', async () => {
            const testTokens = [
                'ya29.a0AfH6SMC-google-oauth-token',
                '1//0G-refresh-token-format',
                'short-token',
                'token-with-special-chars-!@#$%^&*()',
                `very-long-token-${'x'.repeat(1000)}`,
            ];

            for (const token of testTokens) {
                const encrypted = await transformer.to(token);
                const decrypted = await transformer.from(encrypted);
                expect(decrypted).toBe(token);
            }
        });

        test('should handle multiple encryption cycles', async () => {
            let current = testToken;

            // Encrypt and decrypt multiple times
            for (let i = 0; i < 5; i++) {
                const encrypted = await transformer.to(current);
                const decrypted = await transformer.from(encrypted);
                expect(decrypted).toBe(testToken); // Should always decrypt to original
                current = testToken; // Reset for next cycle
            }
        });
    });

    describe('migration compatibility', () => {
        test('should handle mixed encrypted and plaintext tokens', async () => {
            const plaintextToken = 'ya29.plaintext-token';
            const encryptedToken = await transformer.to('ya29.encrypted-token');

            // Both should be handled correctly
            const plainResult = await transformer.from(plaintextToken);
            const encryptedResult = await transformer.from(encryptedToken);

            expect(plainResult).toBe(plaintextToken);
            expect(encryptedResult).toBe('ya29.encrypted-token');
        });

        test('should not double-encrypt already encrypted tokens', async () => {
            // First encrypt
            const encrypted = await transformer.to(testToken);

            // Simulate reading from DB (should return plaintext)
            const decrypted = await transformer.from(encrypted);
            expect(decrypted).toBe(testToken);

            // Re-encrypting should work (new encryption)
            const reencrypted = await transformer.to(decrypted);
            expect(reencrypted).not.toBe(encrypted); // Different due to new IV
            expect(await transformer.from(reencrypted)).toBe(testToken);
        });
    });

    describe('security properties', () => {
        test('should produce non-deterministic encryption', async () => {
            const results = new Set();

            // Encrypt same token multiple times
            for (let i = 0; i < 10; i++) {
                const encrypted = await transformer.to(testToken);
                results.add(encrypted);
            }

            // All results should be unique (due to random IV)
            expect(results.size).toBe(10);
        });

        test('should not leak plaintext in encrypted format', async () => {
            const encrypted = await transformer.to(testToken);

            // Encrypted value should not contain any part of original token
            expect(encrypted).not.toContain('ya29');
            expect(encrypted).not.toContain(testToken.slice(5, 15));
        });

        test('should handle Unicode tokens correctly', async () => {
            const unicodeToken = 'token-with-unicode-🔐-émojí-测试';
            const encrypted = await transformer.to(unicodeToken);
            const decrypted = await transformer.from(encrypted);

            expect(decrypted).toBe(unicodeToken);
        });
    });

    describe('edge cases', () => {
        test('should handle very long tokens', async () => {
            const longToken = `token-${'x'.repeat(10000)}`;
            const encrypted = await transformer.to(longToken);
            const decrypted = await transformer.from(encrypted);

            expect(decrypted).toBe(longToken);
        });

        test('should handle tokens that look like Iron format but are not', async () => {
            const fakeIronToken = 'Fe26.2**this-is-not-real-iron-data**fake**invalid';

            // Since isEncrypted returns true, it should try to decrypt and fail
            await expect(transformer.from(fakeIronToken)).rejects.toThrow(
                'Token decryption failed - possible corruption or key mismatch'
            );
        });

        test('should handle null and undefined consistently', async () => {
            expect(await transformer.to(null)).toBeNull();
            expect(await transformer.from(null)).toBeNull();

            // Undefined should return undefined (not null)
            expect(await transformer.to(undefined as unknown as string | null)).toBeUndefined();
            expect(await transformer.from(undefined as unknown as string | null)).toBeUndefined();
        });
    });
});
