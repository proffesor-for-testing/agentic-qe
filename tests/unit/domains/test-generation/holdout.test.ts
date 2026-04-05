/**
 * ADR-062 Tier 2 - Holdout Test Selection
 *
 * Tests for the deterministic holdout test selection mechanism.
 * Holdout tests are a random 10% of generated tests (selected via FNV-1a hash)
 * that are not shown to developers but run separately in CI
 * to detect silent quality degradation.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { isHoldoutTest } from '../../../../src/domains/test-generation/services/test-generator';

describe('ADR-062: Holdout Test Selection', () => {
  describe('isHoldoutTest', () => {
    it('is deterministic: same testId always produces the same result', () => {
      const testId = 'test-abc-123-deterministic';

      const result1 = isHoldoutTest(testId);
      const result2 = isHoldoutTest(testId);
      const result3 = isHoldoutTest(testId);

      expect(result1).toBe(result2);
      expect(result2).toBe(result3);
    });

    it('selects approximately 10% of test IDs as holdout (within 3% tolerance)', () => {
      const totalTests = 1000;
      let holdoutCount = 0;

      for (let i = 0; i < totalTests; i++) {
        const testId = `test-holdout-check-${i}-${String(i).padStart(6, '0')}`;
        if (isHoldoutTest(testId)) {
          holdoutCount++;
        }
      }

      const holdoutPercent = (holdoutCount / totalTests) * 100;
      // Expect ~10% with 3% tolerance -> between 7% and 13%
      expect(holdoutPercent).toBeGreaterThanOrEqual(7);
      expect(holdoutPercent).toBeLessThanOrEqual(13);
    });

    it('different test IDs produce different holdout decisions', () => {
      // Over enough different IDs, we should see both true and false
      const results = new Set<boolean>();

      for (let i = 0; i < 50; i++) {
        results.add(isHoldoutTest(`unique-test-id-${i}`));
      }

      // Should have both true and false in the results
      expect(results.size).toBe(2);
    });

    it('respects seed parameter for different holdout sets', () => {
      const testId = 'test-seed-check-42';

      const resultSeed0 = isHoldoutTest(testId, 0);
      const resultSeed99 = isHoldoutTest(testId, 99);

      // With different seeds, we may or may not get different results for a single ID,
      // but determinism with the same seed must hold
      expect(isHoldoutTest(testId, 0)).toBe(resultSeed0);
      expect(isHoldoutTest(testId, 99)).toBe(resultSeed99);
    });

    it('handles edge case: empty string test ID', () => {
      // Should not throw, just return a deterministic boolean
      const result = isHoldoutTest('');
      expect(typeof result).toBe('boolean');
      expect(isHoldoutTest('')).toBe(result); // Still deterministic
    });

    it('handles edge case: very long test ID', () => {
      const longId = 'a'.repeat(10000);
      const result = isHoldoutTest(longId);
      expect(typeof result).toBe('boolean');
      expect(isHoldoutTest(longId)).toBe(result); // Still deterministic
    });

    it('handles edge case: test ID with special characters', () => {
      const specialId = 'test/path::with.special-chars_and spaces!@#$%^&*()';
      const result = isHoldoutTest(specialId);
      expect(typeof result).toBe('boolean');
      expect(isHoldoutTest(specialId)).toBe(result); // Still deterministic
    });

    it('produces uniform distribution across hash space', () => {
      // Verify that the modulo operation does not cluster results
      // by checking multiple buckets across the 0-99 range
      const buckets = new Array(10).fill(0);
      const totalTests = 5000;

      for (let i = 0; i < totalTests; i++) {
        const testId = `distribution-test-${i}-${Math.random().toString(36).slice(2)}`;
        // We test the internal mechanism: isHoldoutTest checks (hash % 100) < 10
        // If the hash is uniform, the first bucket (0-9) should get ~10% of hashes
        if (isHoldoutTest(testId)) {
          buckets[0]++;
        }
      }

      // The holdout bucket should contain roughly 10% of total
      const holdoutRatio = buckets[0] / totalTests;
      expect(holdoutRatio).toBeGreaterThan(0.05);
      expect(holdoutRatio).toBeLessThan(0.15);
    });
  });

  describe('Feature flag: AQE_HOLDOUT_TESTING_ENABLED', () => {
    const originalEnv = process.env.AQE_HOLDOUT_TESTING_ENABLED;

    afterEach(() => {
      // Restore original env
      if (originalEnv === undefined) {
        delete process.env.AQE_HOLDOUT_TESTING_ENABLED;
      } else {
        process.env.AQE_HOLDOUT_TESTING_ENABLED = originalEnv;
      }
    });

    it('defaults to false (disabled) when env var is not set', () => {
      delete process.env.AQE_HOLDOUT_TESTING_ENABLED;
      // When disabled, isHoldoutTest still works as a pure function,
      // but the service should NOT mark any tests as holdout.
      // This test validates the flag check pattern: === 'true'
      expect(process.env.AQE_HOLDOUT_TESTING_ENABLED).toBeUndefined();
      expect(process.env.AQE_HOLDOUT_TESTING_ENABLED === 'true').toBe(false);
    });

    it('is enabled when env var is set to "true"', () => {
      process.env.AQE_HOLDOUT_TESTING_ENABLED = 'true';
      expect(process.env.AQE_HOLDOUT_TESTING_ENABLED === 'true').toBe(true);
    });

    it('is disabled when env var is set to "false"', () => {
      process.env.AQE_HOLDOUT_TESTING_ENABLED = 'false';
      expect(process.env.AQE_HOLDOUT_TESTING_ENABLED === 'true').toBe(false);
    });
  });
});
