/**
 * Tests for test-value-helpers — lightweight faker replacement
 */

import { describe, it, expect } from 'vitest';
import { testValues } from '../../../../../src/domains/test-generation/generators/test-value-helpers';

describe('testValues', () => {
  describe('uuid', () => {
    it('should return a valid v4 UUID', () => {
      const uuid = testValues.uuid();
      expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    });

    it('should return unique values', () => {
      const a = testValues.uuid();
      const b = testValues.uuid();
      expect(a).not.toBe(b);
    });
  });

  describe('email', () => {
    it('should return a valid email format', () => {
      const email = testValues.email();
      expect(email).toMatch(/^user_[0-9a-f]{6}@example\.com$/);
    });
  });

  describe('fullName', () => {
    it('should return first and last name', () => {
      const name = testValues.fullName();
      expect(name.split(' ')).toHaveLength(2);
      expect(name.length).toBeGreaterThan(3);
    });
  });

  describe('url', () => {
    it('should return an https URL', () => {
      const url = testValues.url();
      expect(url).toMatch(/^https:\/\/example\.com\/[0-9a-f]{8}$/);
    });
  });

  describe('recentDate', () => {
    it('should return an ISO date within the last 7 days', () => {
      const dateStr = testValues.recentDate();
      const date = new Date(dateStr);
      expect(date.getTime()).not.toBeNaN();
      const sevenDaysAgo = Date.now() - 7 * 86400000;
      expect(date.getTime()).toBeGreaterThanOrEqual(sevenDaysAgo);
      expect(date.getTime()).toBeLessThanOrEqual(Date.now());
    });
  });

  describe('phone', () => {
    it('should return a phone with country code', () => {
      const phone = testValues.phone();
      expect(phone).toMatch(/^\+1\d{10}$/);
    });
  });

  describe('streetAddress', () => {
    it('should return a numbered street', () => {
      const addr = testValues.streetAddress();
      expect(addr).toMatch(/^\d{1,4} Main St$/);
    });
  });

  describe('word', () => {
    it('should return a non-empty string', () => {
      const w = testValues.word();
      expect(w.length).toBeGreaterThan(0);
    });
  });

  describe('int', () => {
    it('should return a value within range (inclusive)', () => {
      for (let i = 0; i < 20; i++) {
        const v = testValues.int(1, 10);
        expect(v).toBeGreaterThanOrEqual(1);
        expect(v).toBeLessThanOrEqual(10);
      }
    });

    it('should handle min equal to max', () => {
      expect(testValues.int(5, 5)).toBe(5);
    });

    it('should handle inverted range by swapping', () => {
      const v = testValues.int(100, 1);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(100);
    });

    it('should handle zero as a valid bound', () => {
      const v = testValues.int(0, 0);
      expect(v).toBe(0);
    });
  });

  describe('float', () => {
    it('should return a value within range', () => {
      for (let i = 0; i < 20; i++) {
        const v = testValues.float(0, 100, 2);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
    });

    it('should respect fractionDigits', () => {
      const v = testValues.float(0, 100, 3);
      const parts = String(v).split('.');
      if (parts.length === 2) {
        expect(parts[1].length).toBeLessThanOrEqual(3);
      }
    });

    it('should handle min equal to max', () => {
      expect(testValues.float(42, 42)).toBe(42);
    });

    it('should handle inverted range by swapping', () => {
      const v = testValues.float(100, 0);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    });
  });
});
