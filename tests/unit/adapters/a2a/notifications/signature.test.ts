/**
 * Tests for A2A Webhook Signature Utilities
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  generateSignature,
  generateSignatureHeader,
  parseSignatureHeader,
  verifySignature,
  isValidSignature,
  SIGNATURE_HEADER,
  SIGNATURE_VERSION,
  DEFAULT_MAX_AGE_MS,
  MIN_TIMESTAMP,
} from '../../../../../src/adapters/a2a/notifications/signature.js';

describe('Signature Utilities', () => {
  const testPayload = JSON.stringify({ event: 'task.completed', taskId: '123' });
  const testSecret = 'test-webhook-secret';
  const testTimestamp = Date.now();

  describe('generateSignature', () => {
    it('should generate a valid HMAC-SHA256 signature', () => {
      const signature = generateSignature(testPayload, testSecret, testTimestamp);

      expect(signature).toBeDefined();
      expect(typeof signature).toBe('string');
      expect(signature).toHaveLength(64); // SHA256 produces 64 hex characters
      expect(/^[a-f0-9]+$/.test(signature)).toBe(true);
    });

    it('should generate consistent signatures for same inputs', () => {
      const sig1 = generateSignature(testPayload, testSecret, testTimestamp);
      const sig2 = generateSignature(testPayload, testSecret, testTimestamp);

      expect(sig1).toBe(sig2);
    });

    it('should generate different signatures for different payloads', () => {
      const sig1 = generateSignature(testPayload, testSecret, testTimestamp);
      const sig2 = generateSignature('different payload', testSecret, testTimestamp);

      expect(sig1).not.toBe(sig2);
    });

    it('should generate different signatures for different secrets', () => {
      const sig1 = generateSignature(testPayload, testSecret, testTimestamp);
      const sig2 = generateSignature(testPayload, 'different-secret', testTimestamp);

      expect(sig1).not.toBe(sig2);
    });

    it('should generate different signatures for different timestamps', () => {
      const sig1 = generateSignature(testPayload, testSecret, testTimestamp);
      const sig2 = generateSignature(testPayload, testSecret, testTimestamp + 1000);

      expect(sig1).not.toBe(sig2);
    });

    it('should throw on empty payload', () => {
      expect(() => generateSignature('', testSecret, testTimestamp)).toThrow('Payload is required');
    });

    it('should throw on empty secret', () => {
      expect(() => generateSignature(testPayload, '', testTimestamp)).toThrow('Secret is required');
    });

    it('should throw on invalid timestamp', () => {
      expect(() => generateSignature(testPayload, testSecret, 1000)).toThrow('Invalid timestamp');
    });
  });

  describe('generateSignatureHeader', () => {
    it('should generate a properly formatted header value', () => {
      const header = generateSignatureHeader(testPayload, testSecret, testTimestamp);

      expect(header).toContain(`t=${testTimestamp}`);
      expect(header).toContain(`${SIGNATURE_VERSION}=`);
      expect(header).toMatch(/^t=\d+,v1=[a-f0-9]{64}$/);
    });

    it('should use current time if no timestamp provided', () => {
      const before = Date.now();
      const header = generateSignatureHeader(testPayload, testSecret);
      const after = Date.now();

      const parsed = parseSignatureHeader(header);
      expect(parsed).not.toBeNull();
      expect(parsed!.timestamp).toBeGreaterThanOrEqual(before);
      expect(parsed!.timestamp).toBeLessThanOrEqual(after);
    });
  });

  describe('parseSignatureHeader', () => {
    it('should parse a valid signature header', () => {
      const header = `t=${testTimestamp},v1=abc123def456`;
      const parsed = parseSignatureHeader(header);

      expect(parsed).not.toBeNull();
      expect(parsed!.timestamp).toBe(testTimestamp);
      expect(parsed!.v1).toBe('abc123def456');
    });

    it('should return null for invalid format', () => {
      expect(parseSignatureHeader('')).toBeNull();
      expect(parseSignatureHeader('invalid')).toBeNull();
      expect(parseSignatureHeader('t=abc')).toBeNull();
      expect(parseSignatureHeader('v1=abc')).toBeNull();
      expect(parseSignatureHeader('t=invalid,v1=abc')).toBeNull();
    });

    it('should handle signature values containing equals signs', () => {
      const header = `t=${testTimestamp},v1=abc=def=123`;
      const parsed = parseSignatureHeader(header);

      expect(parsed).not.toBeNull();
      expect(parsed!.v1).toBe('abc=def=123');
    });
  });

  describe('verifySignature', () => {
    it('should verify a valid signature', () => {
      const header = generateSignatureHeader(testPayload, testSecret);
      const result = verifySignature(testPayload, header, testSecret);

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
      expect(result.timestamp).toBeDefined();
      expect(result.ageMs).toBeDefined();
      expect(result.ageMs).toBeLessThan(1000);
    });

    it('should reject an invalid signature', () => {
      const header = `t=${testTimestamp},v1=invalid_signature_here`;
      const result = verifySignature(testPayload, header, testSecret);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('mismatch');
    });

    it('should reject an expired signature', () => {
      const oldTimestamp = Date.now() - DEFAULT_MAX_AGE_MS - 10000;
      const signature = generateSignature(testPayload, testSecret, oldTimestamp);
      const header = `t=${oldTimestamp},v1=${signature}`;

      const result = verifySignature(testPayload, header, testSecret);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('expired');
    });

    it('should reject a future timestamp beyond tolerance', () => {
      const futureTimestamp = Date.now() + 120000; // 2 minutes in future
      const signature = generateSignature(testPayload, testSecret, futureTimestamp);
      const header = `t=${futureTimestamp},v1=${signature}`;

      const result = verifySignature(testPayload, header, testSecret);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('future');
    });

    it('should respect custom maxAge', () => {
      const oldTimestamp = Date.now() - 10000; // 10 seconds ago
      const signature = generateSignature(testPayload, testSecret, oldTimestamp);
      const header = `t=${oldTimestamp},v1=${signature}`;

      // Should pass with 1 minute max age
      const result1 = verifySignature(testPayload, header, testSecret, 60000);
      expect(result1.valid).toBe(true);

      // Should fail with 5 second max age
      const result2 = verifySignature(testPayload, header, testSecret, 5000);
      expect(result2.valid).toBe(false);
    });

    it('should reject wrong secret', () => {
      const header = generateSignatureHeader(testPayload, testSecret);
      const result = verifySignature(testPayload, header, 'wrong-secret');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('mismatch');
    });

    it('should reject tampered payload', () => {
      const header = generateSignatureHeader(testPayload, testSecret);
      const result = verifySignature('tampered payload', header, testSecret);

      expect(result.valid).toBe(false);
    });
  });

  describe('isValidSignature', () => {
    it('should return true for valid signature', () => {
      const header = generateSignatureHeader(testPayload, testSecret);
      expect(isValidSignature(testPayload, header, testSecret)).toBe(true);
    });

    it('should return false for invalid signature', () => {
      const header = `t=${testTimestamp},v1=invalid`;
      expect(isValidSignature(testPayload, header, testSecret)).toBe(false);
    });
  });

  describe('constants', () => {
    it('should export correct header name', () => {
      expect(SIGNATURE_HEADER).toBe('X-A2A-Signature');
    });

    it('should export correct version', () => {
      expect(SIGNATURE_VERSION).toBe('v1');
    });

    it('should have reasonable default max age', () => {
      expect(DEFAULT_MAX_AGE_MS).toBe(5 * 60 * 1000); // 5 minutes
    });

    it('should have reasonable min timestamp', () => {
      expect(MIN_TIMESTAMP).toBe(1704067200000); // Jan 1, 2024
    });
  });
});
