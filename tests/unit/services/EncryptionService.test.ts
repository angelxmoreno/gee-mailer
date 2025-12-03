import 'reflect-metadata';
import { beforeEach, describe, expect, test } from 'bun:test';
import { EncryptionService } from '@app/services/EncryptionService';

describe('EncryptionService', () => {
    let encryptionService: EncryptionService;
    const testSecret = 'test-secret-key-that-is-at-least-32-characters-long-for-security';
    const shortSecret = 'short';
    const testData = 'ya29.a0AfH6SMCtest-oauth-token-here';

    beforeEach(() => {
        encryptionService = new EncryptionService(testSecret);
    });

    describe('constructor', () => {
        test('should accept a valid secret', () => {
            expect(() => new EncryptionService(testSecret)).not.toThrow();
        });

        test('should throw error for secret shorter than 32 characters', () => {
            expect(() => new EncryptionService(shortSecret)).toThrow(
                'Encryption secret must be at least 32 characters'
            );
        });
    });

    describe('isEncrypted', () => {
        test('should return true for AES-GCM encrypted strings', () => {
            const aesEncryptedString =
                'a1b2c3d4e5f67890123456789012345a:deadbeef12345678aabbccdd:0123456789abcdef0123456789abcdef';
            expect(encryptionService.isEncrypted(aesEncryptedString)).toBe(true);
        });

        test('should return false for plaintext data', () => {
            expect(encryptionService.isEncrypted(testData)).toBe(false);
        });

        test('should return false for empty string', () => {
            expect(encryptionService.isEncrypted('')).toBe(false);
        });

        test('should return false for random strings', () => {
            expect(encryptionService.isEncrypted('random-string')).toBe(false);
            expect(encryptionService.isEncrypted('not-encrypted-format')).toBe(false);
        });

        test('should return false for strings that almost match AES format', () => {
            expect(encryptionService.isEncrypted('short:encrypted')).toBe(false);
            expect(encryptionService.isEncrypted('tooshort:encdata:tag')).toBe(false);
        });
    });

    describe('isLegacyIronFormat', () => {
        test('should return true for Iron format strings', () => {
            const ironString = 'Fe26.2**some-iron-encrypted-data';
            expect(encryptionService.isLegacyIronFormat(ironString)).toBe(true);
        });

        test('should return false for non-Iron strings', () => {
            expect(encryptionService.isLegacyIronFormat(testData)).toBe(false);
            expect(encryptionService.isLegacyIronFormat('random-string')).toBe(false);
        });
    });

    describe('encrypt', () => {
        test('should encrypt non-empty data', () => {
            const result = encryptionService.encrypt(testData);

            expect(result).not.toBe(testData);
            expect(encryptionService.isEncrypted(result)).toBe(true);
        });

        test('should produce different encrypted values for same input', () => {
            const result1 = encryptionService.encrypt(testData);
            const result2 = encryptionService.encrypt(testData);

            // Due to random IV, encrypted values should be different
            expect(result1).not.toBe(result2);

            // But both should be valid encrypted strings
            expect(encryptionService.isEncrypted(result1)).toBe(true);
            expect(encryptionService.isEncrypted(result2)).toBe(true);
        });

        test('should encrypt various data formats', () => {
            const testCases = [
                'ya29.a0AfH6SMC-google-oauth-token',
                '1//0G-refresh-token-format',
                'short',
                'very-long-data-with-many-characters-and-special-symbols-@#$%^&*()',
                'unicode-data-🔐-émojí-测试',
            ];

            for (const data of testCases) {
                const result = encryptionService.encrypt(data);
                expect(encryptionService.isEncrypted(result)).toBe(true);
            }
        });
    });

    describe('decrypt', () => {
        test('should decrypt encrypted data correctly', () => {
            // First encrypt some data
            const encrypted = encryptionService.encrypt(testData);

            // Then decrypt it
            const decrypted = encryptionService.decrypt(encrypted);

            expect(decrypted).toBe(testData);
        });

        test('should throw error for corrupted encrypted data', () => {
            const corruptedData = 'a1b2c3d4e5f67890123456789012345a:deadbeefbaadcafe:0123456789abcdef0123456789abcdef';

            expect(() => encryptionService.decrypt(corruptedData)).toThrow();
        });

        test('should throw error when using wrong secret', () => {
            // Encrypt with one secret
            const encrypted = encryptionService.encrypt(testData);

            // Try to decrypt with different secret
            const wrongService = new EncryptionService('different-secret-key-that-is-at-least-32-chars');

            expect(() => wrongService.decrypt(encrypted)).toThrow();
        });

        test('should throw error for invalid format', () => {
            const invalidFormats = ['invalid-format', 'only-one-part', 'two:parts', 'too:many:colons:here'];

            for (const invalid of invalidFormats) {
                expect(() => encryptionService.decrypt(invalid)).toThrow('Invalid encrypted data format');
            }
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
                'unicode-data-🔐-émojí-测试',
            ];

            for (const data of testCases) {
                const encrypted = encryptionService.encrypt(data);
                const decrypted = encryptionService.decrypt(encrypted);
                expect(decrypted).toBe(data);
            }
        });

        test('should handle multiple encryption cycles', () => {
            let current = testData;

            // Encrypt and decrypt multiple times
            for (let i = 0; i < 5; i++) {
                const encrypted = encryptionService.encrypt(current);
                const decrypted = encryptionService.decrypt(encrypted);
                expect(decrypted).toBe(testData); // Should always decrypt to original
                current = testData; // Reset for next cycle
            }
        });
    });

    describe('security properties', () => {
        test('should produce non-deterministic encryption', () => {
            const results = new Set();

            // Encrypt same data multiple times
            for (let i = 0; i < 10; i++) {
                const encrypted = encryptionService.encrypt(testData);
                results.add(encrypted);
            }

            // All results should be unique (due to random IV)
            expect(results.size).toBe(10);
        });

        test('should not leak plaintext in encrypted format', () => {
            const encrypted = encryptionService.encrypt(testData);

            // Encrypted value should not contain any part of original data
            expect(encrypted).not.toContain('ya29');
            expect(encrypted).not.toContain(testData.slice(5, 15));
        });

        test('should handle very long data', () => {
            const longData = `data-${'x'.repeat(10000)}`;
            const encrypted = encryptionService.encrypt(longData);
            const decrypted = encryptionService.decrypt(encrypted);

            expect(decrypted).toBe(longData);
        });
    });
});
