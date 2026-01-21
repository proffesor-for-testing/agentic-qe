/**
 * Unit Tests for SecureRandom Utility
 *
 * Tests cryptographically secure random number generation methods.
 * Coverage goal: 80%+
 *
 * @module tests/unit/SecureRandom
 */

import { SecureRandom } from '../../src/utils/SecureRandom';

describe('SecureRandom', () => {
  describe('generateId', () => {
    it('should generate a hex string of default length (32 characters)', () => {
      const id = SecureRandom.generateId();
      expect(id).toHaveLength(32); // 16 bytes = 32 hex chars
      expect(id).toMatch(/^[0-9a-f]{32}$/);
    });

    it('should generate a hex string of custom length', () => {
      const id = SecureRandom.generateId(8);
      expect(id).toHaveLength(16); // 8 bytes = 16 hex chars
      expect(id).toMatch(/^[0-9a-f]{16}$/);
    });

    it('should generate unique IDs on multiple calls', () => {
      const id1 = SecureRandom.generateId();
      const id2 = SecureRandom.generateId();
      const id3 = SecureRandom.generateId();

      expect(id1).not.toBe(id2);
      expect(id2).not.toBe(id3);
      expect(id1).not.toBe(id3);
    });

    it('should handle large lengths', () => {
      const id = SecureRandom.generateId(128);
      expect(id).toHaveLength(256); // 128 bytes = 256 hex chars
      expect(id).toMatch(/^[0-9a-f]{256}$/);
    });

    it('should handle length of 1', () => {
      const id = SecureRandom.generateId(1);
      expect(id).toHaveLength(2); // 1 byte = 2 hex chars
      expect(id).toMatch(/^[0-9a-f]{2}$/);
    });
  });

  describe('randomInt', () => {
    it('should generate random integers within range', () => {
      const min = 1;
      const max = 7;

      for (let i = 0; i < 100; i++) {
        const value = SecureRandom.randomInt(min, max);
        expect(value).toBeGreaterThanOrEqual(min);
        expect(value).toBeLessThan(max);
      }
    });

    it('should throw error when min >= max', () => {
      expect(() => SecureRandom.randomInt(5, 5)).toThrow(
        'Invalid range: min (5) must be less than max (5)'
      );
      expect(() => SecureRandom.randomInt(10, 5)).toThrow(
        'Invalid range: min (10) must be less than max (5)'
      );
    });

    it('should handle negative ranges', () => {
      const min = -10;
      const max = -5;

      for (let i = 0; i < 50; i++) {
        const value = SecureRandom.randomInt(min, max);
        expect(value).toBeGreaterThanOrEqual(min);
        expect(value).toBeLessThan(max);
      }
    });

    it('should handle ranges crossing zero', () => {
      const min = -5;
      const max = 5;

      for (let i = 0; i < 50; i++) {
        const value = SecureRandom.randomInt(min, max);
        expect(value).toBeGreaterThanOrEqual(min);
        expect(value).toBeLessThan(max);
      }
    });

    it('should handle large ranges', () => {
      const min = 0;
      const max = 1000000;

      for (let i = 0; i < 50; i++) {
        const value = SecureRandom.randomInt(min, max);
        expect(value).toBeGreaterThanOrEqual(min);
        expect(value).toBeLessThan(max);
      }
    });

    it('should generate different values on multiple calls', () => {
      const values = new Set<number>();
      for (let i = 0; i < 50; i++) {
        values.add(SecureRandom.randomInt(0, 1000));
      }
      // Probability of collision is low with 1000 options
      expect(values.size).toBeGreaterThan(40);
    });
  });

  describe('randomFloat', () => {
    it('should generate random floats between 0 and 1 with default precision', () => {
      for (let i = 0; i < 100; i++) {
        const value = SecureRandom.randomFloat();
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(1);
      }
    });

    it('should respect precision parameter', () => {
      const value = SecureRandom.randomFloat(2);
      const decimalPart = value.toString().split('.')[1] || '';
      expect(decimalPart.length).toBeLessThanOrEqual(2);
    });

    it('should generate different values on multiple calls', () => {
      const values = new Set<number>();
      for (let i = 0; i < 50; i++) {
        values.add(SecureRandom.randomFloat());
      }
      expect(values.size).toBeGreaterThan(45);
    });

    it('should handle high precision', () => {
      const value = SecureRandom.randomFloat(10);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    });

    it('should handle precision of 1', () => {
      const value = SecureRandom.randomFloat(1);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    });
  });

  describe('uuid', () => {
    it('should generate valid RFC4122 v4 UUID', () => {
      const uuid = SecureRandom.uuid();
      // RFC4122 v4 UUID format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
      // where y is one of [8, 9, a, b]
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(uuid).toMatch(uuidPattern);
    });

    it('should generate unique UUIDs on multiple calls', () => {
      const uuid1 = SecureRandom.uuid();
      const uuid2 = SecureRandom.uuid();
      const uuid3 = SecureRandom.uuid();

      expect(uuid1).not.toBe(uuid2);
      expect(uuid2).not.toBe(uuid3);
      expect(uuid1).not.toBe(uuid3);
    });

    it('should generate UUIDs with correct length', () => {
      const uuid = SecureRandom.uuid();
      expect(uuid).toHaveLength(36); // 8-4-4-4-12 + 4 hyphens
    });
  });

  describe('randomString', () => {
    it('should generate string of specified length with default alphabet', () => {
      const str = SecureRandom.randomString(8);
      expect(str).toHaveLength(8);
      expect(str).toMatch(/^[A-Za-z0-9]{8}$/);
    });

    it('should generate string with custom alphabet', () => {
      const hexStr = SecureRandom.randomString(8, '0123456789ABCDEF');
      expect(hexStr).toHaveLength(8);
      expect(hexStr).toMatch(/^[0-9A-F]{8}$/);
    });

    it('should generate numeric PIN', () => {
      const pin = SecureRandom.randomString(4, '0123456789');
      expect(pin).toHaveLength(4);
      expect(pin).toMatch(/^[0-9]{4}$/);
    });

    it('should generate different strings on multiple calls', () => {
      const strings = new Set<string>();
      for (let i = 0; i < 50; i++) {
        strings.add(SecureRandom.randomString(8));
      }
      expect(strings.size).toBeGreaterThan(45);
    });

    it('should handle length of 1', () => {
      const str = SecureRandom.randomString(1);
      expect(str).toHaveLength(1);
    });

    it('should handle long strings', () => {
      const str = SecureRandom.randomString(100);
      expect(str).toHaveLength(100);
    });

    it('should handle custom alphabet with special characters', () => {
      const str = SecureRandom.randomString(8, '!@#$%^&*');
      expect(str).toHaveLength(8);
      expect(str).toMatch(/^[!@#$%^&*]{8}$/);
    });

    it('should handle single character alphabet', () => {
      const str = SecureRandom.randomString(10, 'A');
      expect(str).toBe('AAAAAAAAAA');
    });
  });

  describe('randomBoolean', () => {
    it('should generate random booleans with default 50/50 probability', () => {
      const results: boolean[] = [];
      for (let i = 0; i < 100; i++) {
        results.push(SecureRandom.randomBoolean());
      }

      const trueCount = results.filter(r => r).length;
      // With 100 samples, expect roughly 50% true (allow 30-70% range for randomness)
      expect(trueCount).toBeGreaterThan(30);
      expect(trueCount).toBeLessThan(70);
    });

    it('should respect custom probability', () => {
      const results: boolean[] = [];
      for (let i = 0; i < 100; i++) {
        results.push(SecureRandom.randomBoolean(0.8));
      }

      const trueCount = results.filter(r => r).length;
      // With 80% probability, expect 60-95% true
      expect(trueCount).toBeGreaterThan(60);
      expect(trueCount).toBeLessThan(95);
    });

    it('should throw error for probability < 0', () => {
      expect(() => SecureRandom.randomBoolean(-0.1)).toThrow(
        'Probability must be between 0 and 1'
      );
    });

    it('should throw error for probability > 1', () => {
      expect(() => SecureRandom.randomBoolean(1.5)).toThrow(
        'Probability must be between 0 and 1'
      );
    });

    it('should return false for probability 0', () => {
      for (let i = 0; i < 10; i++) {
        expect(SecureRandom.randomBoolean(0)).toBe(false);
      }
    });

    it('should return true for probability 1', () => {
      for (let i = 0; i < 10; i++) {
        expect(SecureRandom.randomBoolean(1)).toBe(true);
      }
    });
  });

  describe('shuffle', () => {
    it('should shuffle array in place', () => {
      const original = [1, 2, 3, 4, 5];
      const shuffled = SecureRandom.shuffle([...original]);

      expect(shuffled).toHaveLength(original.length);
      expect(shuffled.sort()).toEqual(original);
    });

    it('should produce different orders on multiple shuffles', () => {
      const original = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const shuffles = new Set<string>();

      for (let i = 0; i < 50; i++) {
        const shuffled = SecureRandom.shuffle([...original]);
        shuffles.add(shuffled.join(','));
      }

      // Should produce multiple different orderings
      expect(shuffles.size).toBeGreaterThan(40);
    });

    it('should handle empty array', () => {
      const result = SecureRandom.shuffle([]);
      expect(result).toEqual([]);
    });

    it('should handle single element array', () => {
      const result = SecureRandom.shuffle([42]);
      expect(result).toEqual([42]);
    });

    it('should handle array with duplicate elements', () => {
      const original = [1, 1, 2, 2, 3, 3];
      const shuffled = SecureRandom.shuffle([...original]);

      expect(shuffled).toHaveLength(original.length);
      expect(shuffled.sort()).toEqual(original.sort());
    });

    it('should handle array with objects', () => {
      const original = [{ id: 1 }, { id: 2 }, { id: 3 }];
      const shuffled = SecureRandom.shuffle([...original]);

      expect(shuffled).toHaveLength(original.length);
      expect(shuffled.map(o => o.id).sort()).toEqual([1, 2, 3]);
    });
  });

  describe('choice', () => {
    it('should select random element from array', () => {
      const array = [1, 2, 3, 4, 5];
      const choice = SecureRandom.choice(array);

      expect(array).toContain(choice);
    });

    it('should throw error for empty array', () => {
      expect(() => SecureRandom.choice([])).toThrow(
        'Cannot choose from empty array'
      );
    });

    it('should select all elements with sufficient samples', () => {
      const array = [1, 2, 3, 4, 5];
      const selected = new Set<number>();

      for (let i = 0; i < 100; i++) {
        selected.add(SecureRandom.choice(array));
      }

      expect(selected.size).toBe(array.length);
    });

    it('should handle single element array', () => {
      const result = SecureRandom.choice([42]);
      expect(result).toBe(42);
    });

    it('should handle array with strings', () => {
      const array = ['red', 'green', 'blue'];
      const choice = SecureRandom.choice(array);

      expect(array).toContain(choice);
    });

    it('should handle array with objects', () => {
      const array = [{ name: 'Alice' }, { name: 'Bob' }];
      const choice = SecureRandom.choice(array);

      expect(array).toContain(choice);
    });
  });

  describe('sample', () => {
    it('should select specified number of elements', () => {
      const array = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const sample = SecureRandom.sample(array, 3);

      expect(sample).toHaveLength(3);
      sample.forEach(item => {
        expect(array).toContain(item);
      });
    });

    it('should not contain duplicates', () => {
      const array = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const sample = SecureRandom.sample(array, 5);

      const uniqueItems = new Set(sample);
      expect(uniqueItems.size).toBe(5);
    });

    it('should throw error when count > array length', () => {
      expect(() => SecureRandom.sample([1, 2, 3], 5)).toThrow(
        'Sample size cannot exceed array length'
      );
    });

    it('should throw error when count < 0', () => {
      expect(() => SecureRandom.sample([1, 2, 3], -1)).toThrow(
        'Sample size must be non-negative'
      );
    });

    it('should handle count of 0', () => {
      const result = SecureRandom.sample([1, 2, 3], 0);
      expect(result).toEqual([]);
    });

    it('should handle count equal to array length', () => {
      const array = [1, 2, 3, 4, 5];
      const sample = SecureRandom.sample(array, 5);

      expect(sample).toHaveLength(5);
      expect(sample.sort()).toEqual(array.sort());
    });

    it('should produce different samples on multiple calls', () => {
      const array = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const samples = new Set<string>();

      for (let i = 0; i < 50; i++) {
        const sample = SecureRandom.sample(array, 5);
        samples.add(sample.sort().join(','));
      }

      expect(samples.size).toBeGreaterThan(40);
    });

    it('should handle single element sample', () => {
      const array = [1, 2, 3, 4, 5];
      const sample = SecureRandom.sample(array, 1);

      expect(sample).toHaveLength(1);
      expect(array).toContain(sample[0]);
    });
  });

  describe('bytes', () => {
    it('should generate Buffer of specified size', () => {
      const buffer = SecureRandom.bytes(32);

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBe(32);
    });

    it('should generate different buffers on multiple calls', () => {
      const buffer1 = SecureRandom.bytes(16);
      const buffer2 = SecureRandom.bytes(16);

      expect(buffer1.equals(buffer2)).toBe(false);
    });

    it('should handle small sizes', () => {
      const buffer = SecureRandom.bytes(1);
      expect(buffer.length).toBe(1);
    });

    it('should handle large sizes', () => {
      const buffer = SecureRandom.bytes(1024);
      expect(buffer.length).toBe(1024);
    });

    it('should generate cryptographically secure bytes', () => {
      const buffer = SecureRandom.bytes(16);
      const allZeros = buffer.every(byte => byte === 0);
      const allOnes = buffer.every(byte => byte === 255);

      // Extremely unlikely to get all zeros or all 255s
      expect(allZeros).toBe(false);
      expect(allOnes).toBe(false);
    });
  });

  describe('Statistical Distribution Tests', () => {
    it('randomInt should have uniform distribution', () => {
      const buckets = new Array(10).fill(0);
      const samples = 10000;

      for (let i = 0; i < samples; i++) {
        const value = SecureRandom.randomInt(0, 10);
        buckets[value]++;
      }

      // Each bucket should have roughly samples/10 (1000) items
      // Allow 20% variance for randomness (800-1200)
      buckets.forEach(count => {
        expect(count).toBeGreaterThan(800);
        expect(count).toBeLessThan(1200);
      });
    });

    it('randomFloat should have uniform distribution', () => {
      const buckets = new Array(10).fill(0);
      const samples = 10000;

      for (let i = 0; i < samples; i++) {
        const value = SecureRandom.randomFloat();
        const bucket = Math.floor(value * 10);
        buckets[Math.min(bucket, 9)]++; // Handle edge case of exactly 1.0
      }

      // Each bucket should have roughly samples/10 (1000) items
      // Allow 20% variance for randomness (800-1200)
      buckets.forEach(count => {
        expect(count).toBeGreaterThan(800);
        expect(count).toBeLessThan(1200);
      });
    });
  });
});
