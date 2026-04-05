/**
 * ADR-062 Tier 2 - Monotonic Gate Threshold Ratcheting
 *
 * Tests for the quality gate ratcheting mechanism.
 * Gate thresholds ratchet upward monotonically: they can only increase, never decrease.
 * After consecutive gate passes, the threshold increases by a configurable amount.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { checkRatchet } from '../../../../src/domains/quality-assessment/coherence/gate-controller';
import type { RatchetConfig, RatchetState } from '../../../../src/domains/quality-assessment/coherence/types';
import { DEFAULT_RATCHET_CONFIG } from '../../../../src/domains/quality-assessment/coherence/types';

/** Helper to create a default ratchet config with overrides */
function makeConfig(overrides: Partial<RatchetConfig> = {}): RatchetConfig {
  return { ...DEFAULT_RATCHET_CONFIG, enabled: true, ...overrides };
}

/** Helper to create a default ratchet state with overrides */
function makeState(overrides: Partial<RatchetState> = {}): RatchetState {
  return {
    currentThreshold: 70,
    consecutivePasses: 0,
    lastRatchetTime: 0,
    history: [],
    ...overrides,
  };
}

describe('ADR-062: Gate Ratcheting', () => {
  const originalEnv = process.env.AQE_GATE_RATCHETING_ENABLED;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.AQE_GATE_RATCHETING_ENABLED;
    } else {
      process.env.AQE_GATE_RATCHETING_ENABLED = originalEnv;
    }
  });

  // Enable the feature flag for all tests in this block unless overridden
  function enableFlag(): void {
    process.env.AQE_GATE_RATCHETING_ENABLED = 'true';
  }

  describe('threshold increases after consecutivePassesRequired passes', () => {
    it('ratchets threshold by 2% after 5 consecutive passes (default config)', () => {
      enableFlag();
      const config = makeConfig();
      let state = makeState({ currentThreshold: 70 });
      const now = Date.now();

      // Simulate 5 consecutive passes
      for (let i = 0; i < 5; i++) {
        state = checkRatchet(true, config, state, now);
      }

      expect(state.currentThreshold).toBe(72);
      expect(state.consecutivePasses).toBe(0); // Reset after ratchet
      expect(state.history).toHaveLength(1);
      expect(state.history[0].threshold).toBe(72);
    });
  });

  describe('monotonic invariant', () => {
    it('threshold NEVER decreases - key correctness property', () => {
      enableFlag();
      const config = makeConfig();
      let state = makeState({ currentThreshold: 80 });
      const now = Date.now();

      // Record all thresholds across a mix of passes and failures
      const thresholds: number[] = [state.currentThreshold];

      // Simulate: 5 passes (ratchet), fail, 5 passes (ratchet), fail, 5 passes (ratchet)
      for (let cycle = 0; cycle < 3; cycle++) {
        for (let i = 0; i < 5; i++) {
          state = checkRatchet(true, config, state, now + cycle * 100000);
          thresholds.push(state.currentThreshold);
        }
        state = checkRatchet(false, config, state, now + cycle * 100000 + 50000);
        thresholds.push(state.currentThreshold);
      }

      // Verify monotonic: each threshold >= previous
      for (let i = 1; i < thresholds.length; i++) {
        expect(thresholds[i]).toBeGreaterThanOrEqual(thresholds[i - 1]);
      }
    });
  });

  describe('threshold capped at maxThreshold (95%)', () => {
    it('does not exceed maxThreshold', () => {
      enableFlag();
      const config = makeConfig({ maxThreshold: 95, ratchetIncrementPercent: 10 });
      let state = makeState({ currentThreshold: 90 });
      const now = Date.now();

      // 5 passes -> should try to go to 100 but cap at 95
      for (let i = 0; i < 5; i++) {
        state = checkRatchet(true, config, state, now);
      }

      expect(state.currentThreshold).toBe(95);
    });

    it('threshold already at max -> no change', () => {
      enableFlag();
      const config = makeConfig({ maxThreshold: 95 });
      let state = makeState({ currentThreshold: 95 });
      const now = Date.now();

      // 5 passes -> threshold should stay at 95
      for (let i = 0; i < 5; i++) {
        state = checkRatchet(true, config, state, now);
      }

      expect(state.currentThreshold).toBe(95);
      // No new history entry since threshold did not change
      expect(state.history).toHaveLength(0);
    });
  });

  describe('consecutive passes reset on failure', () => {
    it('resets consecutivePasses to 0 when gate fails', () => {
      enableFlag();
      const config = makeConfig();
      let state = makeState({ consecutivePasses: 4 });

      state = checkRatchet(false, config, state);

      expect(state.consecutivePasses).toBe(0);
      expect(state.currentThreshold).toBe(70); // Unchanged
    });

    it('requires full consecutivePassesRequired after a failure', () => {
      enableFlag();
      const config = makeConfig();
      let state = makeState({ currentThreshold: 70 });
      const now = Date.now();

      // 4 passes, then fail, then 5 passes -> should ratchet only after second set
      for (let i = 0; i < 4; i++) {
        state = checkRatchet(true, config, state, now);
      }
      expect(state.consecutivePasses).toBe(4);

      state = checkRatchet(false, config, state, now);
      expect(state.consecutivePasses).toBe(0);

      // Now 5 more passes
      for (let i = 0; i < 5; i++) {
        state = checkRatchet(true, config, state, now);
      }

      expect(state.currentThreshold).toBe(72);
    });
  });

  describe('cooldown period respected', () => {
    it('does not ratchet if cooldown has not elapsed', () => {
      enableFlag();
      const cooldownMs = 7 * 24 * 60 * 60 * 1000; // 7 days
      const config = makeConfig({ cooldownMs });
      const lastRatchetTime = Date.now();
      let state = makeState({ currentThreshold: 72, lastRatchetTime });

      // 5 passes immediately after last ratchet (within cooldown)
      for (let i = 0; i < 5; i++) {
        state = checkRatchet(true, config, state, lastRatchetTime + 1000);
      }

      // Should NOT ratchet because cooldown has not elapsed
      expect(state.currentThreshold).toBe(72);
      expect(state.history).toHaveLength(0);
    });

    it('ratchets after cooldown period has elapsed', () => {
      enableFlag();
      const cooldownMs = 7 * 24 * 60 * 60 * 1000; // 7 days
      const config = makeConfig({ cooldownMs });
      const lastRatchetTime = 1000;
      let state = makeState({ currentThreshold: 72, lastRatchetTime });

      // 5 passes after cooldown has elapsed
      const afterCooldown = lastRatchetTime + cooldownMs + 1;
      for (let i = 0; i < 5; i++) {
        state = checkRatchet(true, config, state, afterCooldown);
      }

      expect(state.currentThreshold).toBe(74);
      expect(state.history).toHaveLength(1);
    });
  });

  describe('history records each ratchet event', () => {
    it('records threshold and timestamp for each ratchet', () => {
      enableFlag();
      const config = makeConfig({ cooldownMs: 0 }); // No cooldown for this test
      let state = makeState({ currentThreshold: 70 });
      const now = Date.now();

      // First ratchet: 5 passes
      for (let i = 0; i < 5; i++) {
        state = checkRatchet(true, config, state, now);
      }
      expect(state.history).toHaveLength(1);
      expect(state.history[0]).toEqual({ threshold: 72, ratchetedAt: now });

      // Second ratchet: 5 more passes
      const later = now + 10000;
      for (let i = 0; i < 5; i++) {
        state = checkRatchet(true, config, state, later);
      }
      expect(state.history).toHaveLength(2);
      expect(state.history[1]).toEqual({ threshold: 74, ratchetedAt: later });
    });
  });

  describe('feature flag disabled -> state unchanged', () => {
    it('returns state unchanged when env var is not set', () => {
      delete process.env.AQE_GATE_RATCHETING_ENABLED;
      const config = makeConfig();
      const state = makeState({ currentThreshold: 70, consecutivePasses: 4 });

      const result = checkRatchet(true, config, state);

      expect(result.currentThreshold).toBe(70);
      expect(result.consecutivePasses).toBe(4);
    });

    it('returns state unchanged when config.enabled is false', () => {
      enableFlag(); // env is true, but config.enabled is false
      const config = makeConfig({ enabled: false });
      const state = makeState({ currentThreshold: 70, consecutivePasses: 4 });

      const result = checkRatchet(true, config, state);

      expect(result.currentThreshold).toBe(70);
      expect(result.consecutivePasses).toBe(4);
    });
  });

  describe('custom config works correctly', () => {
    it('custom: 3 passes required, 5% increment', () => {
      enableFlag();
      const config = makeConfig({
        consecutivePassesRequired: 3,
        ratchetIncrementPercent: 5,
        cooldownMs: 0,
      });
      let state = makeState({ currentThreshold: 60 });
      const now = Date.now();

      for (let i = 0; i < 3; i++) {
        state = checkRatchet(true, config, state, now);
      }

      expect(state.currentThreshold).toBe(65);
      expect(state.consecutivePasses).toBe(0);
    });
  });

  describe('multiple ratchets accumulate correctly', () => {
    it('three consecutive ratchets increase threshold by 3x increment', () => {
      enableFlag();
      const config = makeConfig({ cooldownMs: 0 }); // No cooldown for accumulation test
      let state = makeState({ currentThreshold: 70 });
      const now = Date.now();

      // 3 ratchets x 5 passes each = 15 passes total
      for (let ratchet = 0; ratchet < 3; ratchet++) {
        for (let i = 0; i < 5; i++) {
          state = checkRatchet(true, config, state, now + ratchet * 1000);
        }
      }

      // 70 + 2 + 2 + 2 = 76
      expect(state.currentThreshold).toBe(76);
      expect(state.history).toHaveLength(3);
    });
  });

  describe('state immutability', () => {
    it('does not mutate the input state object', () => {
      enableFlag();
      const config = makeConfig();
      const state = makeState({ currentThreshold: 70, consecutivePasses: 4 });
      const originalThreshold = state.currentThreshold;
      const originalPasses = state.consecutivePasses;

      checkRatchet(true, config, state);

      expect(state.currentThreshold).toBe(originalThreshold);
      expect(state.consecutivePasses).toBe(originalPasses);
    });
  });
});
