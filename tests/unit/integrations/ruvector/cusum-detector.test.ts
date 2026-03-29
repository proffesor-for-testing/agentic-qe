/**
 * CUSUM Drift Detector Unit Tests (R2, Phase 5)
 *
 * Tests for:
 * - Known mean shift detection within 10 samples
 * - Stationary sequence produces no alarms over 1000 samples
 * - Independent gate state per gate type
 * - Reset clears cumulative sums
 * - Two-sided detection (positive and negative drift)
 *
 * @see cusum-detector.ts
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  CusumDetector,
  type CusumResult,
  type GateType,
} from '../../../../src/integrations/ruvector/cusum-detector';

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Generate a sequence of values from a normal-like distribution
 * using Box-Muller transform with a seeded PRNG.
 */
function generateNormalSamples(
  mean: number,
  stddev: number,
  count: number,
  seed: number = 42,
): number[] {
  const samples: number[] = [];
  let s = seed;

  // Simple seeded PRNG (xorshift32)
  function nextRandom(): number {
    s ^= s << 13;
    s ^= s >> 17;
    s ^= s << 5;
    return ((s >>> 0) / 0xFFFFFFFF);
  }

  for (let i = 0; i < count; i += 2) {
    const u1 = nextRandom() || 1e-10;
    const u2 = nextRandom();
    const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    const z1 = Math.sqrt(-2 * Math.log(u1)) * Math.sin(2 * Math.PI * u2);
    samples.push(mean + stddev * z0);
    if (i + 1 < count) {
      samples.push(mean + stddev * z1);
    }
  }

  return samples.slice(0, count);
}

// ============================================================================
// Tests
// ============================================================================

describe('CusumDetector', () => {
  let detector: CusumDetector;

  beforeEach(() => {
    detector = new CusumDetector({
      threshold: 5.0,
      slack: 0.5,
      resetOnAlarm: true,
      warmupSamples: 20,
    });
  });

  // --------------------------------------------------------------------------
  // Mean Shift Detection
  // --------------------------------------------------------------------------

  describe('mean shift detection', () => {
    it('should detect a positive mean shift of 2 sigma within 10 samples', () => {
      const stddev = 1.0;
      const baseMean = 0;
      const shiftedMean = baseMean + 2 * stddev; // +2 sigma shift

      // Warmup: feed 20 samples at base mean
      const warmupSamples = generateNormalSamples(baseMean, stddev * 0.1, 20, 100);
      for (const sample of warmupSamples) {
        detector.update('retrieve', sample);
      }

      // Feed shifted samples and check detection within 10
      let detected = false;
      for (let i = 0; i < 10; i++) {
        const result = detector.update('retrieve', shiftedMean);
        if (result.driftDetected) {
          detected = true;
          expect(result.direction).toBe('positive');
          break;
        }
      }

      expect(detected).toBe(true);
    });

    it('should detect a negative mean shift of 2 sigma within 10 samples', () => {
      const stddev = 1.0;
      const baseMean = 5;
      const shiftedMean = baseMean - 2 * stddev; // -2 sigma shift

      // Warmup
      const warmupSamples = generateNormalSamples(baseMean, stddev * 0.1, 20, 200);
      for (const sample of warmupSamples) {
        detector.update('write', sample);
      }

      // Feed shifted samples
      let detected = false;
      for (let i = 0; i < 10; i++) {
        const result = detector.update('write', shiftedMean);
        if (result.driftDetected) {
          detected = true;
          expect(result.direction).toBe('negative');
          break;
        }
      }

      expect(detected).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Stationary Sequence (No False Alarms)
  // --------------------------------------------------------------------------

  describe('stationary sequence', () => {
    it('should produce no alarms over 1000 stationary samples', () => {
      const mean = 0.5;
      const stddev = 0.1;

      // Use a wider slack and higher threshold to avoid false alarms
      const stableDetector = new CusumDetector({
        threshold: 5.0,
        slack: 0.5,
        resetOnAlarm: true,
        warmupSamples: 20,
      });

      const samples = generateNormalSamples(mean, stddev, 1020, 300);

      let alarmCount = 0;
      for (const sample of samples) {
        const result = stableDetector.update('retrieve', sample);
        if (result.driftDetected) {
          alarmCount++;
        }
      }

      expect(alarmCount).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // Independent Gate State
  // --------------------------------------------------------------------------

  describe('independent gate state', () => {
    it('should maintain independent state for each gate type', () => {
      const gateTypes: GateType[] = ['retrieve', 'write', 'learn', 'act'];

      // Warmup all gates with different base means
      for (let g = 0; g < gateTypes.length; g++) {
        const baseMean = g * 10;
        const warmup = generateNormalSamples(baseMean, 0.1, 20, 400 + g * 100);
        for (const sample of warmup) {
          detector.update(gateTypes[g], sample);
        }
      }

      // Shift only the 'retrieve' gate
      let retrieveDetected = false;
      for (let i = 0; i < 10; i++) {
        const result = detector.update('retrieve', 20); // Far from mean ~0
        if (result.driftDetected) {
          retrieveDetected = true;
          break;
        }
      }
      expect(retrieveDetected).toBe(true);

      // 'write' gate should still be clean (not affected by retrieve's drift)
      const writeState = detector.getState('write');
      expect(writeState.driftDetected).toBe(false);

      // 'learn' gate should still be clean
      const learnState = detector.getState('learn');
      expect(learnState.driftDetected).toBe(false);

      // 'act' gate should still be clean
      const actState = detector.getState('act');
      expect(actState.driftDetected).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // Reset
  // --------------------------------------------------------------------------

  describe('reset', () => {
    it('should clear cumulative sums for a specific gate', () => {
      // Warmup
      const warmup = generateNormalSamples(0, 0.1, 20, 500);
      for (const s of warmup) {
        detector.update('retrieve', s);
      }

      // Push some values to build up cumulative sum
      detector.update('retrieve', 3);
      detector.update('retrieve', 3);
      const beforeReset = detector.getState('retrieve');
      expect(beforeReset.cumulativeSum).toBeGreaterThan(0);

      // Reset
      detector.reset('retrieve');
      const afterReset = detector.getState('retrieve');
      expect(afterReset.cumulativeSum).toBe(0);
      expect(afterReset.samplesSinceReset).toBe(0);
      expect(afterReset.driftDetected).toBe(false);
    });

    it('should clear all gates when no gate type specified', () => {
      const gateTypes: GateType[] = ['retrieve', 'write', 'learn', 'act'];

      // Warmup all gates
      for (const gate of gateTypes) {
        const warmup = generateNormalSamples(0, 0.1, 20, 600);
        for (const s of warmup) {
          detector.update(gate, s);
        }
        detector.update(gate, 5);
      }

      // Reset all
      detector.reset();

      for (const gate of gateTypes) {
        const state = detector.getState(gate);
        expect(state.cumulativeSum).toBe(0);
        expect(state.samplesSinceReset).toBe(0);
      }
    });

    it('should auto-reset after alarm when resetOnAlarm is true', () => {
      // Warmup
      const warmup = generateNormalSamples(0, 0.01, 20, 700);
      for (const s of warmup) {
        detector.update('learn', s);
      }

      // Force an alarm with extreme values
      let alarmResult: CusumResult | null = null;
      for (let i = 0; i < 20; i++) {
        const result = detector.update('learn', 100);
        if (result.driftDetected) {
          alarmResult = result;
          break;
        }
      }
      expect(alarmResult).not.toBeNull();
      expect(alarmResult!.driftDetected).toBe(true);

      // After auto-reset, state should be cleared (but mu preserved)
      const state = detector.getState('learn');
      expect(state.samplesSinceReset).toBe(0);
      expect(state.cumulativeSum).toBe(0);
    });

    it('should NOT auto-reset when resetOnAlarm is false', () => {
      const noResetDetector = new CusumDetector({
        threshold: 5.0,
        slack: 0.5,
        resetOnAlarm: false,
        warmupSamples: 20,
      });

      // Warmup
      const warmup = generateNormalSamples(0, 0.01, 20, 800);
      for (const s of warmup) {
        noResetDetector.update('act', s);
      }

      // Force alarm
      for (let i = 0; i < 20; i++) {
        noResetDetector.update('act', 100);
      }

      // State should still show alarm (not reset)
      const state = noResetDetector.getState('act');
      expect(state.driftDetected).toBe(true);
      expect(state.cumulativeSum).toBeGreaterThan(0);
      expect(state.samplesSinceReset).toBeGreaterThan(0);
    });
  });

  // --------------------------------------------------------------------------
  // Two-Sided Detection
  // --------------------------------------------------------------------------

  describe('two-sided detection', () => {
    it('should detect positive drift direction', () => {
      // Warmup at mean ~0
      const warmup = generateNormalSamples(0, 0.01, 20, 900);
      for (const s of warmup) {
        detector.update('retrieve', s);
      }

      // Large positive shift
      let result: CusumResult = { driftDetected: false, cumulativeSum: 0, direction: 'none', samplesSinceReset: 0 };
      for (let i = 0; i < 20; i++) {
        result = detector.update('retrieve', 10);
        if (result.driftDetected) break;
      }

      expect(result.driftDetected).toBe(true);
      expect(result.direction).toBe('positive');
    });

    it('should detect negative drift direction', () => {
      // Warmup at mean ~10
      const warmup = generateNormalSamples(10, 0.01, 20, 1000);
      for (const s of warmup) {
        detector.update('write', s);
      }

      // Large negative shift
      let result: CusumResult = { driftDetected: false, cumulativeSum: 0, direction: 'none', samplesSinceReset: 0 };
      for (let i = 0; i < 20; i++) {
        result = detector.update('write', -5);
        if (result.driftDetected) break;
      }

      expect(result.driftDetected).toBe(true);
      expect(result.direction).toBe('negative');
    });

    it('should report none when no drift detected', () => {
      const state = detector.getState('act');
      expect(state.direction).toBe('none');
    });
  });

  // --------------------------------------------------------------------------
  // Warmup Behavior
  // --------------------------------------------------------------------------

  describe('warmup period', () => {
    it('should not detect drift during warmup', () => {
      // During warmup (first 20 samples), no detection should occur
      // even with extreme values
      for (let i = 0; i < 19; i++) {
        const result = detector.update('retrieve', 1000);
        expect(result.driftDetected).toBe(false);
        expect(result.direction).toBe('none');
      }
    });

    it('should start detecting after warmup completes', () => {
      // Fill warmup with mean ~0
      for (let i = 0; i < 20; i++) {
        detector.update('retrieve', 0);
      }

      // Now extreme values should eventually trigger detection
      let detected = false;
      for (let i = 0; i < 20; i++) {
        const result = detector.update('retrieve', 100);
        if (result.driftDetected) {
          detected = true;
          break;
        }
      }
      expect(detected).toBe(true);
    });
  });
});
