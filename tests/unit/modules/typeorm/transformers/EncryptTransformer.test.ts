import 'reflect-metadata';
import { beforeEach, describe, expect, test } from 'bun:test';
import { EncryptionService } from '@app/services/EncryptionService';
import type { ValueTransformer } from 'typeorm';

interface EncryptTransformerConstructor {
    new (
        encryptionService: EncryptionService
    ): ValueTransformer & {
        isEncrypted(value: string): boolean;
        to(value: string | null): string | null;
        from(value: string | null): string | null;
    };
}

describe('EncryptTransformer', () => {
    let EncryptTransformer: EncryptTransformerConstructor;
    let encryptionService: EncryptionService;
    let transformer: ValueTransformer & {
        isEncrypted(value: string): boolean;
        to(value: string | null): string | null;
        from(value: string | null): string | null;
    };
    const testSecret = 'test-secret-key-that-is-at-least-32-characters-long-for-security';
    const testData = 'ya29.a0AfH6SMCtest-oauth-token-here';

    beforeEach(async () => {
        // Import after mocking to avoid circular dependency
        const module = await import('@app/modules/typeorm/transformers/EncryptTransformer');
        EncryptTransformer = module.EncryptTransformer;
        encryptionService = new EncryptionService(testSecret);
        transformer = new EncryptTransformer(encryptionService);
    });

    describe('constructor', () => {
        test('should accept an EncryptionService instance', async () => {
            const service = new EncryptionService(testSecret);
            const module = await import('@app/modules/typeorm/transformers/EncryptTransformer');
            expect(() => new module.EncryptTransformer(service)).not.toThrow();
        });
    });

    describe('factory function', () => {
        test('should create transformer with environment variable', async () => {
            const module = await import('@app/modules/typeorm/transformers/EncryptTransformer');
            const transformer = module.createEncryptTransformer();

            expect(transformer).toBeDefined();
            expect(transformer.isEncrypted).toBeFunction();
        });
    });

    describe('isEncrypted', () => {
        test('should delegate to EncryptionService', () => {
            const aesEncryptedString =
                'a1b2c3d4e5f67890123456789012345a:deadbeef12345678aabbccdd:0123456789abcdef0123456789abcdef';
            expect(transformer.isEncrypted(aesEncryptedString)).toBe(true);
        });

        test('should return false for plaintext data', () => {
            expect(transformer.isEncrypted(testData)).toBe(false);
        });

        test('should return false for empty string', () => {
            expect(transformer.isEncrypted('')).toBe(false);
        });
    });

    describe('to (encrypt)', () => {
        test('should return null for null input', () => {
            const result = transformer.to(null);
            expect(result).toBeNull();
        });

        test('should encrypt non-null data', () => {
            const result = transformer.to(testData);

            expect(result).not.toBeNull();
            expect(result).not.toBe(testData);
            if (result) {
                expect(transformer.isEncrypted(result)).toBe(true);
            }
        });

        test('should produce different encrypted values for same input', () => {
            const result1 = transformer.to(testData);
            const result2 = transformer.to(testData);

            // Due to random IV, encrypted values should be different
            expect(result1).not.toBe(result2);

            // But both should be valid encrypted strings
            if (result1) expect(transformer.isEncrypted(result1)).toBe(true);
            if (result2) expect(transformer.isEncrypted(result2)).toBe(true);
        });

        test('should handle empty strings', () => {
            const result = transformer.to('');
            expect(result).toBe('');
        });

        test('should encrypt various data formats', () => {
            const testCases = [
                'ya29.a0AfH6SMC-google-oauth-token',
                '1//0G-refresh-token-format',
                'short',
                'very-long-data-with-many-characters-and-special-symbols-@#$%^&*()',
            ];

            for (const data of testCases) {
                const result = transformer.to(data);
                expect(result).not.toBeNull();
                if (result) {
                    expect(transformer.isEncrypted(result)).toBe(true);
                }
            }
        });
    });

    describe('from (decrypt)', () => {
        test('should return null for null input', () => {
            const result = transformer.from(null);
            expect(result).toBeNull();
        });

        test('should return plaintext data unchanged', () => {
            const result = transformer.from(testData);
            expect(result).toBe(testData);
        });

        test('should decrypt AES-GCM encrypted data correctly', () => {
            // First encrypt some data
            const encrypted = transformer.to(testData);

            // Then decrypt it
            const decrypted = transformer.from(encrypted);

            expect(decrypted).toBe(testData);
        });

        test('should handle empty strings', () => {
            const result = transformer.from('');
            expect(result).toBe('');
        });

        test('should throw error for corrupted encrypted data', () => {
            const corruptedData = 'a1b2c3d4e5f67890123456789012345a:deadbeefbaadcafe:0123456789abcdef0123456789abcdef';

            expect(() => transformer.from(corruptedData)).toThrow(
                'Data decryption failed - possible corruption or key mismatch'
            );
        });

        test('should throw error when using wrong secret', () => {
            // Encrypt with one secret
            const encrypted = transformer.to(testData);

            // Try to decrypt with different secret
            const wrongService = new EncryptionService('different-secret-key-that-is-at-least-32-chars');
            const wrongTransformer = new EncryptTransformer(wrongService);

            expect(() => wrongTransformer.from(encrypted)).toThrow(
                'Data decryption failed - possible corruption or key mismatch'
            );
        });

        test('should preserve original error in cause', () => {
            const corruptedData = 'a1b2c3d4e5f67890123456789012345a:deadbeefbaadcafe:0123456789abcdef0123456789abcdef';

            try {
                transformer.from(corruptedData);
                expect.unreachable('Should have thrown an error');
            } catch (error) {
                expect((error as Error).message).toBe('Data decryption failed - possible corruption or key mismatch');
                expect((error as Error).cause).toBeDefined();
            }
        });

        test('should handle legacy Iron format', () => {
            const ironData = 'Fe26.2**some-legacy-iron-data';
            const result = transformer.from(ironData);

            // Should return as-is for migration compatibility
            expect(result).toBe(ironData);
        });
    });

    describe('round-trip encryption/decryption', () => {
        test('should preserve original data through encrypt/decrypt cycle', () => {
            const testCases = [
                'ya29.a0AfH6SMC-google-oauth-token',
                '1//0G-refresh-token-format',
                'short-data',
                'data-with-special-chars-!@#$%^&*()',
                `very-long-data-${'x'.repeat(1000)}`,
            ];

            for (const data of testCases) {
                const encrypted = transformer.to(data);
                const decrypted = transformer.from(encrypted);
                expect(decrypted).toBe(data);
            }
        });

        test('should handle multiple encryption cycles', () => {
            let current = testData;

            // Encrypt and decrypt multiple times
            for (let i = 0; i < 5; i++) {
                const encrypted = transformer.to(current);
                const decrypted = transformer.from(encrypted);
                expect(decrypted).toBe(testData); // Should always decrypt to original
                current = testData; // Reset for next cycle
            }
        });
    });

    describe('migration compatibility', () => {
        test('should handle mixed encrypted and plaintext data', () => {
            const plaintextData = 'ya29.plaintext-data';
            const encryptedData = transformer.to('ya29.encrypted-data');

            // Both should be handled correctly
            const plainResult = transformer.from(plaintextData);
            const encryptedResult = transformer.from(encryptedData);

            expect(plainResult).toBe(plaintextData);
            expect(encryptedResult).toBe('ya29.encrypted-data');
        });

        test('should not double-encrypt already encrypted data', () => {
            // First encrypt
            const encrypted = transformer.to(testData);

            // Simulate reading from DB (should return plaintext)
            const decrypted = transformer.from(encrypted);
            expect(decrypted).toBe(testData);

            // Re-encrypting should work (new encryption)
            const reencrypted = transformer.to(decrypted);
            expect(reencrypted).not.toBe(encrypted); // Different due to new IV
            expect(transformer.from(reencrypted)).toBe(testData);
        });
    });

    describe('security properties', () => {
        test('should produce non-deterministic encryption', () => {
            const results = new Set();

            // Encrypt same data multiple times
            for (let i = 0; i < 10; i++) {
                const encrypted = transformer.to(testData);
                results.add(encrypted);
            }

            // All results should be unique (due to random IV)
            expect(results.size).toBe(10);
        });

        test('should not leak plaintext in encrypted format', () => {
            const encrypted = transformer.to(testData);

            // Encrypted value should not contain any part of original data
            expect(encrypted).not.toContain('ya29');
            expect(encrypted).not.toContain(testData.slice(5, 15));
        });

        test('should handle Unicode data correctly', () => {
            const unicodeData = 'data-with-unicode-🔐-émojí-测试';
            const encrypted = transformer.to(unicodeData);
            const decrypted = transformer.from(encrypted);

            expect(decrypted).toBe(unicodeData);
        });
    });

    describe('edge cases', () => {
        test('should handle very long data', () => {
            const longData = `data-${'x'.repeat(10000)}`;
            const encrypted = transformer.to(longData);
            const decrypted = transformer.from(encrypted);

            expect(decrypted).toBe(longData);
        });

        test('should handle data that looks like AES format but are not', () => {
            const fakeAesData = 'a1b2c3d4e5f67890123456789012345a:deadbeefbaadcafe:0123456789abcdef0123456789abcdef';

            // Since isEncrypted returns true, it should try to decrypt and fail
            expect(() => transformer.from(fakeAesData)).toThrow(
                'Data decryption failed - possible corruption or key mismatch'
            );
        });

        test('should handle null and undefined consistently', () => {
            expect(transformer.to(null)).toBeNull();
            expect(transformer.from(null)).toBeNull();

            // Undefined should return undefined (not null)
            expect(transformer.to(undefined as unknown as string | null)).toBeUndefined();
            expect(transformer.from(undefined as unknown as string | null)).toBeUndefined();
        });
    });
});
