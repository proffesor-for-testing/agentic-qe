import { describe, it, expect } from 'vitest';
import {
  CryptoValidator,
  timingSafeCompare,
  timingSafeHashCompare,
  generateSecureToken,
  secureHash,
} from '../../../../../src/mcp/security/validators/crypto-validator.js';

describe('CryptoValidator', () => {
  const validator = new CryptoValidator();

  describe('timingSafeCompare', () => {
    it('should return true for equal strings', () => {
      expect(validator.timingSafeCompare('hello', 'hello')).toBe(true);
    });

    it('should return false for different strings', () => {
      expect(validator.timingSafeCompare('hello', 'world')).toBe(false);
    });

    it('should handle different length strings', () => {
      expect(validator.timingSafeCompare('short', 'longer string')).toBe(false);
    });

    it('should handle empty strings', () => {
      expect(validator.timingSafeCompare('', '')).toBe(true);
    });

    it('should handle one empty string', () => {
      expect(validator.timingSafeCompare('', 'not empty')).toBe(false);
    });

    it('should be consistent across multiple calls', () => {
      const a = 'test-token-12345';
      const b = 'test-token-12345';
      for (let i = 0; i < 100; i++) {
        expect(validator.timingSafeCompare(a, b)).toBe(true);
      }
    });
  });

  describe('timingSafeHashCompare', () => {
    it('should return true when value matches expected hash', () => {
      const value = 'test-secret';
      const hash = validator.secureHash(value);
      expect(validator.timingSafeHashCompare(value, hash)).toBe(true);
    });

    it('should return false for wrong value', () => {
      const hash = validator.secureHash('correct');
      expect(validator.timingSafeHashCompare('wrong', hash)).toBe(false);
    });

    it('should return false for tampered hash', () => {
      expect(validator.timingSafeHashCompare('value', 'not-a-real-hash')).toBe(false);
    });
  });

  describe('generateSecureToken', () => {
    it('should generate a token', () => {
      const token = validator.generateSecureToken();
      expect(token).toBeDefined();
      expect(token.length).toBeGreaterThan(0);
    });

    it('should generate unique tokens', () => {
      const tokens = new Set<string>();
      for (let i = 0; i < 100; i++) {
        tokens.add(validator.generateSecureToken());
      }
      expect(tokens.size).toBe(100);
    });

    it('should respect length parameter', () => {
      const short = validator.generateSecureToken(8);
      const long = validator.generateSecureToken(64);
      expect(long.length).toBeGreaterThan(short.length);
    });

    it('should produce URL-safe characters', () => {
      const token = validator.generateSecureToken(64);
      expect(token).not.toContain('+');
      expect(token).not.toContain('/');
      expect(token).not.toContain('=');
    });
  });

  describe('secureHash', () => {
    it('should produce consistent hashes', () => {
      const hash1 = validator.secureHash('test');
      const hash2 = validator.secureHash('test');
      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different inputs', () => {
      const hash1 = validator.secureHash('input1');
      const hash2 = validator.secureHash('input2');
      expect(hash1).not.toBe(hash2);
    });

    it('should produce hex string', () => {
      const hash = validator.secureHash('test');
      expect(hash).toMatch(/^[0-9a-f]+$/);
    });

    it('should produce 64-char SHA-256 hash', () => {
      const hash = validator.secureHash('test');
      expect(hash.length).toBe(64);
    });

    it('should support salt', () => {
      const unsalted = validator.secureHash('test');
      const salted = validator.secureHash('test', 'my-salt');
      expect(unsalted).not.toBe(salted);
    });

    it('should produce different results with different salts', () => {
      const hash1 = validator.secureHash('test', 'salt1');
      const hash2 = validator.secureHash('test', 'salt2');
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('getRiskLevel', () => {
    it('should return critical', () => {
      expect(validator.getRiskLevel()).toBe('critical');
    });
  });

  describe('standalone functions', () => {
    it('timingSafeCompare should work', () => {
      expect(timingSafeCompare('a', 'a')).toBe(true);
      expect(timingSafeCompare('a', 'b')).toBe(false);
    });

    it('timingSafeHashCompare should work', () => {
      const hash = secureHash('test');
      expect(timingSafeHashCompare('test', hash)).toBe(true);
    });

    it('generateSecureToken should work', () => {
      expect(generateSecureToken().length).toBeGreaterThan(0);
    });

    it('secureHash should work', () => {
      expect(secureHash('test').length).toBe(64);
    });
  });
});
