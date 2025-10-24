/**
 * SecureRandom Distribution Tests
 *
 * Tests for cryptographically secure random number generation,
 * distribution uniformity, and security properties
 */

import { SecureRandom } from '../../src/utils/SecureRandom';

describe('SecureRandom Distribution', () => {
  describe('generateId', () => {
    test('should generate unique IDs', () => {
      const ids = new Set();
      const count = 10000;

      for (let i = 0; i < count; i++) {
        ids.add(SecureRandom.generateId());
      }

      expect(ids.size).toBe(count); // All IDs should be unique
    });

    test('should generate IDs of correct length', () => {
      const id8 = SecureRandom.generateId(8);
      const id16 = SecureRandom.generateId(16);
      const id32 = SecureRandom.generateId(32);

      expect(id8).toHaveLength(16); // 8 bytes = 16 hex chars
      expect(id16).toHaveLength(32); // 16 bytes = 32 hex chars
      expect(id32).toHaveLength(64); // 32 bytes = 64 hex chars
    });

    test('should generate hex strings', () => {
      const id = SecureRandom.generateId();
      expect(id).toMatch(/^[0-9a-f]+$/);
    });

    test('should have uniform distribution of characters', () => {
      const counts: Record<string, number> = {};
      const iterations = 100000;

      for (let i = 0; i < iterations; i++) {
        const id = SecureRandom.generateId(1); // 2 hex chars
        for (const char of id) {
          counts[char] = (counts[char] || 0) + 1;
        }
      }

      // Check that all hex digits appear
      const hexDigits = '0123456789abcdef'.split('');
      for (const digit of hexDigits) {
        expect(counts[digit]).toBeDefined();
        expect(counts[digit]).toBeGreaterThan(0);
      }

      // Check distribution is reasonably uniform (within 20% of expected)
      const expected = (iterations * 2) / 16; // 2 chars per iteration, 16 possible values
      for (const digit of hexDigits) {
        const deviation = Math.abs(counts[digit] - expected) / expected;
        expect(deviation).toBeLessThan(0.2); // Within 20%
      }
    });
  });

  describe('randomInt', () => {
    test('should generate integers in range', () => {
      for (let i = 0; i < 1000; i++) {
        const value = SecureRandom.randomInt(0, 100);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(100);
        expect(Number.isInteger(value)).toBe(true);
      }
    });

    test('should include minimum value', () => {
      const values = new Set();
      for (let i = 0; i < 10000; i++) {
        values.add(SecureRandom.randomInt(0, 10));
      }
      expect(values.has(0)).toBe(true);
    });

    test('should exclude maximum value', () => {
      const values = new Set();
      for (let i = 0; i < 10000; i++) {
        const value = SecureRandom.randomInt(0, 10);
        expect(value).toBeLessThan(10);
        values.add(value);
      }
      expect(values.has(10)).toBe(false);
    });

    test('should have uniform distribution', () => {
      const counts: Record<number, number> = {};
      const iterations = 100000;
      const min = 0;
      const max = 10;

      for (let i = 0; i < iterations; i++) {
        const value = SecureRandom.randomInt(min, max);
        counts[value] = (counts[value] || 0) + 1;
      }

      const expected = iterations / (max - min);
      for (let i = min; i < max; i++) {
        const deviation = Math.abs(counts[i] - expected) / expected;
        expect(deviation).toBeLessThan(0.1); // Within 10%
      }
    });

    test('should handle negative ranges', () => {
      for (let i = 0; i < 1000; i++) {
        const value = SecureRandom.randomInt(-100, 0);
        expect(value).toBeGreaterThanOrEqual(-100);
        expect(value).toBeLessThan(0);
      }
    });

    test('should handle large ranges', () => {
      const value = SecureRandom.randomInt(0, 1000000);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1000000);
    });

    test('should throw error for invalid ranges', () => {
      expect(() => SecureRandom.randomInt(10, 10)).toThrow(/Invalid range/);
      expect(() => SecureRandom.randomInt(10, 5)).toThrow(/Invalid range/);
    });
  });

  describe('randomFloat', () => {
    test('should generate floats between 0 and 1', () => {
      for (let i = 0; i < 1000; i++) {
        const value = SecureRandom.randomFloat();
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(1);
      }
    });

    test('should respect precision parameter', () => {
      const value6 = SecureRandom.randomFloat(6);
      const value10 = SecureRandom.randomFloat(10);

      // Count decimal places
      const decimals6 = (value6.toString().split('.')[1] || '').length;
      const decimals10 = (value10.toString().split('.')[1] || '').length;

      expect(decimals6).toBeLessThanOrEqual(6);
      expect(decimals10).toBeLessThanOrEqual(10);
    });

    test('should have uniform distribution', () => {
      const buckets = new Array(10).fill(0);
      const iterations = 100000;

      for (let i = 0; i < iterations; i++) {
        const value = SecureRandom.randomFloat();
        const bucket = Math.floor(value * 10);
        buckets[bucket]++;
      }

      const expected = iterations / 10;
      for (const count of buckets) {
        const deviation = Math.abs(count - expected) / expected;
        expect(deviation).toBeLessThan(0.1); // Within 10%
      }
    });

    test('should generate different values', () => {
      const values = new Set();
      for (let i = 0; i < 1000; i++) {
        values.add(SecureRandom.randomFloat());
      }
      expect(values.size).toBeGreaterThan(990); // Very high likelihood of uniqueness
    });
  });

  describe('uuid', () => {
    test('should generate valid UUIDs', () => {
      const uuid = SecureRandom.uuid();
      expect(uuid).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
      );
    });

    test('should generate unique UUIDs', () => {
      const uuids = new Set();
      for (let i = 0; i < 10000; i++) {
        uuids.add(SecureRandom.uuid());
      }
      expect(uuids.size).toBe(10000);
    });

    test('should follow RFC4122 v4 format', () => {
      const uuid = SecureRandom.uuid();
      const parts = uuid.split('-');

      expect(parts).toHaveLength(5);
      expect(parts[0]).toHaveLength(8);
      expect(parts[1]).toHaveLength(4);
      expect(parts[2]).toHaveLength(4);
      expect(parts[3]).toHaveLength(4);
      expect(parts[4]).toHaveLength(12);

      // Version 4
      expect(parts[2][0]).toBe('4');

      // Variant bits
      expect(['8', '9', 'a', 'b']).toContain(parts[3][0]);
    });
  });

  describe('randomString', () => {
    test('should generate strings of correct length', () => {
      expect(SecureRandom.randomString(8)).toHaveLength(8);
      expect(SecureRandom.randomString(16)).toHaveLength(16);
      expect(SecureRandom.randomString(32)).toHaveLength(32);
    });

    test('should use default alphanumeric alphabet', () => {
      const str = SecureRandom.randomString(100);
      expect(str).toMatch(/^[a-zA-Z0-9]+$/);
    });

    test('should use custom alphabet', () => {
      const hex = SecureRandom.randomString(32, '0123456789ABCDEF');
      expect(hex).toMatch(/^[0-9A-F]+$/);

      const digits = SecureRandom.randomString(10, '0123456789');
      expect(digits).toMatch(/^\d+$/);
    });

    test('should have uniform character distribution', () => {
      const alphabet = 'ABCD';
      const counts: Record<string, number> = {};
      const iterations = 100000;

      for (let i = 0; i < iterations; i++) {
        const char = SecureRandom.randomString(1, alphabet);
        counts[char] = (counts[char] || 0) + 1;
      }

      const expected = iterations / alphabet.length;
      for (const char of alphabet) {
        const deviation = Math.abs(counts[char] - expected) / expected;
        expect(deviation).toBeLessThan(0.1); // Within 10%
      }
    });

    test('should generate unique strings', () => {
      const strings = new Set();
      for (let i = 0; i < 10000; i++) {
        strings.add(SecureRandom.randomString(16));
      }
      expect(strings.size).toBe(10000);
    });
  });

  describe('randomBoolean', () => {
    test('should generate boolean values', () => {
      for (let i = 0; i < 100; i++) {
        const value = SecureRandom.randomBoolean();
        expect(typeof value).toBe('boolean');
      }
    });

    test('should have 50/50 distribution by default', () => {
      let trueCount = 0;
      const iterations = 100000;

      for (let i = 0; i < iterations; i++) {
        if (SecureRandom.randomBoolean()) {
          trueCount++;
        }
      }

      const ratio = trueCount / iterations;
      expect(ratio).toBeGreaterThan(0.48);
      expect(ratio).toBeLessThan(0.52); // Within 2% of 50%
    });

    test('should respect probability parameter', () => {
      let trueCount = 0;
      const iterations = 100000;
      const probability = 0.7;

      for (let i = 0; i < iterations; i++) {
        if (SecureRandom.randomBoolean(probability)) {
          trueCount++;
        }
      }

      const ratio = trueCount / iterations;
      expect(ratio).toBeGreaterThan(0.68);
      expect(ratio).toBeLessThan(0.72); // Within 2% of 70%
    });

    test('should throw error for invalid probability', () => {
      expect(() => SecureRandom.randomBoolean(-0.1)).toThrow(/between 0 and 1/);
      expect(() => SecureRandom.randomBoolean(1.1)).toThrow(/between 0 and 1/);
    });

    test('should handle edge probabilities', () => {
      // Always false
      for (let i = 0; i < 100; i++) {
        expect(SecureRandom.randomBoolean(0)).toBe(false);
      }

      // Always true
      for (let i = 0; i < 100; i++) {
        expect(SecureRandom.randomBoolean(1)).toBe(true);
      }
    });
  });

  describe('shuffle', () => {
    test('should shuffle array', () => {
      const original = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const shuffled = [...original];

      SecureRandom.shuffle(shuffled);

      // Should contain same elements
      expect(shuffled.sort()).toEqual(original.sort());

      // Should be shuffled (very unlikely to be same order)
      expect(shuffled).not.toEqual(original);
    });

    test('should modify array in-place', () => {
      const array = [1, 2, 3, 4, 5];
      const result = SecureRandom.shuffle(array);

      expect(result).toBe(array); // Same reference
    });

    test('should handle empty array', () => {
      const empty: number[] = [];
      SecureRandom.shuffle(empty);
      expect(empty).toEqual([]);
    });

    test('should handle single element', () => {
      const single = [1];
      SecureRandom.shuffle(single);
      expect(single).toEqual([1]);
    });

    test('should produce different shuffles', () => {
      const original = [1, 2, 3, 4, 5, 6, 7, 8];
      const shuffles = new Set();

      for (let i = 0; i < 100; i++) {
        const shuffled = [...original];
        SecureRandom.shuffle(shuffled);
        shuffles.add(shuffled.join(','));
      }

      // Should produce many different shuffles
      expect(shuffles.size).toBeGreaterThan(50);
    });

    test('should have uniform distribution (Fisher-Yates)', () => {
      // Test that each position has equal probability of receiving each element
      const array = [1, 2, 3];
      const positions: Record<string, number> = {};
      const iterations = 60000; // 6! * 10000

      for (let i = 0; i < iterations; i++) {
        const shuffled = [...array];
        SecureRandom.shuffle(shuffled);
        const key = shuffled.join(',');
        positions[key] = (positions[key] || 0) + 1;
      }

      // All 6 permutations should occur
      expect(Object.keys(positions).length).toBe(6);

      // Each permutation should occur ~10000 times
      const expected = iterations / 6;
      for (const count of Object.values(positions)) {
        const deviation = Math.abs(count - expected) / expected;
        expect(deviation).toBeLessThan(0.15); // Within 15%
      }
    });
  });

  describe('choice', () => {
    test('should select from array', () => {
      const array = ['a', 'b', 'c', 'd', 'e'];
      const choice = SecureRandom.choice(array);

      expect(array).toContain(choice);
    });

    test('should have uniform distribution', () => {
      const array = ['a', 'b', 'c', 'd'];
      const counts: Record<string, number> = {};
      const iterations = 100000;

      for (let i = 0; i < iterations; i++) {
        const choice = SecureRandom.choice(array);
        counts[choice] = (counts[choice] || 0) + 1;
      }

      const expected = iterations / array.length;
      for (const item of array) {
        const deviation = Math.abs(counts[item] - expected) / expected;
        expect(deviation).toBeLessThan(0.1); // Within 10%
      }
    });

    test('should throw error for empty array', () => {
      expect(() => SecureRandom.choice([])).toThrow(/empty array/);
    });

    test('should handle single element', () => {
      const single = ['only'];
      expect(SecureRandom.choice(single)).toBe('only');
    });
  });

  describe('sample', () => {
    test('should select multiple elements', () => {
      const array = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const sample = SecureRandom.sample(array, 3);

      expect(sample).toHaveLength(3);
      for (const item of sample) {
        expect(array).toContain(item);
      }
    });

    test('should not contain duplicates', () => {
      const array = [1, 2, 3, 4, 5];
      const sample = SecureRandom.sample(array, 5);

      const unique = new Set(sample);
      expect(unique.size).toBe(5);
    });

    test('should throw error if sample size exceeds array length', () => {
      const array = [1, 2, 3];
      expect(() => SecureRandom.sample(array, 5)).toThrow(/exceed array length/);
    });

    test('should throw error for negative sample size', () => {
      const array = [1, 2, 3];
      expect(() => SecureRandom.sample(array, -1)).toThrow(/non-negative/);
    });

    test('should handle zero sample size', () => {
      const array = [1, 2, 3];
      const sample = SecureRandom.sample(array, 0);
      expect(sample).toEqual([]);
    });

    test('should have uniform distribution', () => {
      const array = [1, 2, 3, 4, 5];
      const counts: Record<number, number> = {};
      const iterations = 50000;

      for (let i = 0; i < iterations; i++) {
        const sample = SecureRandom.sample(array, 2);
        for (const item of sample) {
          counts[item] = (counts[item] || 0) + 1;
        }
      }

      // Each element should be selected ~20000 times (2/5 * 50000)
      const expected = (iterations * 2) / array.length;
      for (const item of array) {
        const deviation = Math.abs(counts[item] - expected) / expected;
        expect(deviation).toBeLessThan(0.15); // Within 15%
      }
    });
  });

  describe('bytes', () => {
    test('should generate buffer of correct size', () => {
      const bytes8 = SecureRandom.bytes(8);
      const bytes16 = SecureRandom.bytes(16);
      const bytes32 = SecureRandom.bytes(32);

      expect(bytes8).toHaveLength(8);
      expect(bytes16).toHaveLength(16);
      expect(bytes32).toHaveLength(32);
    });

    test('should generate different bytes', () => {
      const bytes1 = SecureRandom.bytes(32);
      const bytes2 = SecureRandom.bytes(32);

      expect(bytes1.equals(bytes2)).toBe(false);
    });

    test('should generate cryptographically random bytes', () => {
      // Check for uniform byte distribution
      const counts = new Array(256).fill(0);
      const iterations = 256000; // 1000 samples per byte value

      for (let i = 0; i < iterations / 32; i++) {
        const bytes = SecureRandom.bytes(32);
        for (const byte of bytes) {
          counts[byte]++;
        }
      }

      const expected = iterations / 256;
      let deviations = 0;

      for (const count of counts) {
        const deviation = Math.abs(count - expected) / expected;
        if (deviation > 0.15) {
          deviations++;
        }
      }

      // Most byte values should have uniform distribution
      expect(deviations).toBeLessThan(10); // Less than 4% outliers
    });
  });

  describe('Security Properties', () => {
    test('should be unpredictable', () => {
      // Generate sequence and check for patterns
      const sequence: number[] = [];
      for (let i = 0; i < 1000; i++) {
        sequence.push(SecureRandom.randomInt(0, 100));
      }

      // Check no simple incrementing pattern
      let incrementing = 0;
      for (let i = 1; i < sequence.length; i++) {
        if (sequence[i] === sequence[i - 1] + 1) {
          incrementing++;
        }
      }

      // Should not have many consecutive increments
      expect(incrementing / sequence.length).toBeLessThan(0.05);
    });

    test('should not have repeating patterns', () => {
      const values: number[] = [];
      for (let i = 0; i < 100; i++) {
        values.push(SecureRandom.randomInt(0, 1000));
      }

      // Check for repeating subsequences
      const windowSize = 5;
      const windows = new Set();

      for (let i = 0; i <= values.length - windowSize; i++) {
        const window = values.slice(i, i + windowSize).join(',');
        windows.add(window);
      }

      // Most windows should be unique
      expect(windows.size).toBeGreaterThan(90);
    });

    test('should pass chi-squared test for randomness', () => {
      // Simple chi-squared test for uniform distribution
      const buckets = new Array(10).fill(0);
      const iterations = 100000;

      for (let i = 0; i < iterations; i++) {
        const value = SecureRandom.randomInt(0, 10);
        buckets[value]++;
      }

      const expected = iterations / 10;
      let chiSquared = 0;

      for (const observed of buckets) {
        chiSquared += Math.pow(observed - expected, 2) / expected;
      }

      // Chi-squared critical value for 9 degrees of freedom at 95% confidence is ~16.92
      expect(chiSquared).toBeLessThan(20);
    });
  });
});
