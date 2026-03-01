/**
 * Unit tests for governance/feature-flags.ts
 *
 * Tests: default values, env overrides, mergeFlags, GovernanceFlagsManager,
 * convenience helpers, and runtime flag updates.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  DEFAULT_GOVERNANCE_FLAGS,
  loadFlagsFromEnv,
  mergeFlags,
  governanceFlags,
  isContinueGateEnabled,
  isMemoryWriteGateEnabled,
  isProofEnvelopeEnabled,
  isBudgetMeterEnabled,
  isStrictMode,
} from '../../../src/governance/feature-flags.js';

describe('GovernanceFeatureFlags', () => {
  // Reset singleton state between tests
  beforeEach(() => {
    governanceFlags.reset();
  });

  // ============================================================================
  // DEFAULT_GOVERNANCE_FLAGS
  // ============================================================================

  describe('DEFAULT_GOVERNANCE_FLAGS', () => {
    it('should have all gates enabled by default', () => {
      expect(DEFAULT_GOVERNANCE_FLAGS.continueGate.enabled).toBe(true);
      expect(DEFAULT_GOVERNANCE_FLAGS.memoryWriteGate.enabled).toBe(true);
      expect(DEFAULT_GOVERNANCE_FLAGS.trustAccumulator.enabled).toBe(true);
      expect(DEFAULT_GOVERNANCE_FLAGS.proofEnvelope.enabled).toBe(true);
      expect(DEFAULT_GOVERNANCE_FLAGS.budgetMeter.enabled).toBe(true);
      expect(DEFAULT_GOVERNANCE_FLAGS.global.enableAllGates).toBe(true);
    });

    it('should start in non-strict mode', () => {
      expect(DEFAULT_GOVERNANCE_FLAGS.global.strictMode).toBe(false);
    });

    it('should have sensible budget limits', () => {
      expect(DEFAULT_GOVERNANCE_FLAGS.budgetMeter.maxSessionCostUsd).toBe(50.0);
      expect(DEFAULT_GOVERNANCE_FLAGS.budgetMeter.maxTokensPerSession).toBe(1_000_000);
      expect(DEFAULT_GOVERNANCE_FLAGS.budgetMeter.warningThresholdPercent).toBe(80);
    });

    it('should have proof envelope chain persistence disabled by default', () => {
      expect(DEFAULT_GOVERNANCE_FLAGS.proofEnvelope.chainPersistence).toBe(false);
      expect(DEFAULT_GOVERNANCE_FLAGS.proofEnvelope.signAllEnvelopes).toBe(true);
      expect(DEFAULT_GOVERNANCE_FLAGS.proofEnvelope.maxChainLength).toBe(10000);
    });
  });

  // ============================================================================
  // loadFlagsFromEnv
  // ============================================================================

  describe('loadFlagsFromEnv', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should return defaults when no env vars are set', () => {
      const flags = loadFlagsFromEnv();
      expect(flags.continueGate?.enabled).toBe(true);
      expect(flags.global?.enableAllGates).toBe(true);
    });

    it('should disable continueGate when env var is false', () => {
      process.env.GOVERNANCE_CONTINUE_GATE = 'false';
      const flags = loadFlagsFromEnv();
      expect(flags.continueGate?.enabled).toBe(false);
    });

    it('should parse numeric env vars for budget limits', () => {
      process.env.GOVERNANCE_MAX_COST = '100';
      process.env.GOVERNANCE_MAX_TOKENS = '2000000';
      const flags = loadFlagsFromEnv();
      expect(flags.budgetMeter?.maxSessionCostUsd).toBe(100);
      expect(flags.budgetMeter?.maxTokensPerSession).toBe(2000000);
    });

    it('should enable strict mode via env var', () => {
      process.env.GOVERNANCE_STRICT = 'true';
      const flags = loadFlagsFromEnv();
      expect(flags.global?.strictMode).toBe(true);
    });

    it('should disable all gates via env var', () => {
      process.env.GOVERNANCE_ENABLED = 'false';
      const flags = loadFlagsFromEnv();
      expect(flags.global?.enableAllGates).toBe(false);
    });
  });

  // ============================================================================
  // mergeFlags
  // ============================================================================

  describe('mergeFlags', () => {
    it('should return base flags when no overrides provided', () => {
      const result = mergeFlags(DEFAULT_GOVERNANCE_FLAGS, {}, {});
      expect(result.continueGate.enabled).toBe(true);
      expect(result.budgetMeter.maxSessionCostUsd).toBe(50.0);
    });

    it('should deep merge custom overrides over base', () => {
      const result = mergeFlags(DEFAULT_GOVERNANCE_FLAGS, {}, {
        budgetMeter: {
          enabled: true,
          maxSessionCostUsd: 200,
          maxTokensPerSession: 5_000_000,
          warningThresholdPercent: 90,
        },
      });
      expect(result.budgetMeter.maxSessionCostUsd).toBe(200);
      expect(result.budgetMeter.maxTokensPerSession).toBe(5_000_000);
    });

    it('should give custom overrides priority over env overrides', () => {
      const envOverrides = {
        budgetMeter: {
          enabled: true,
          maxSessionCostUsd: 100,
          maxTokensPerSession: 1_000_000,
          warningThresholdPercent: 80,
        },
      };
      const customOverrides = {
        budgetMeter: {
          enabled: true,
          maxSessionCostUsd: 500,
          maxTokensPerSession: 1_000_000,
          warningThresholdPercent: 80,
        },
      };
      const result = mergeFlags(DEFAULT_GOVERNANCE_FLAGS, envOverrides, customOverrides);
      expect(result.budgetMeter.maxSessionCostUsd).toBe(500);
    });

    it('should preserve unaffected flags during merge', () => {
      const result = mergeFlags(DEFAULT_GOVERNANCE_FLAGS, {}, {
        global: {
          enableAllGates: true,
          strictMode: true,
          logViolations: true,
          escalateToQueen: true,
        },
      });
      // Unchanged flags should keep defaults
      expect(result.continueGate.maxConsecutiveRetries).toBe(3);
      expect(result.proofEnvelope.hashChaining).toBe(true);
      // Changed flag should be updated
      expect(result.global.strictMode).toBe(true);
    });
  });

  // ============================================================================
  // GovernanceFlagsManager (singleton)
  // ============================================================================

  describe('GovernanceFlagsManager', () => {
    it('should return flags via getFlags()', () => {
      const flags = governanceFlags.getFlags();
      expect(flags.global.enableAllGates).toBe(true);
      expect(flags.continueGate.enabled).toBe(true);
    });

    it('should check gate enabled status via isGateEnabled', () => {
      expect(governanceFlags.isGateEnabled('continueGate')).toBe(true);
      expect(governanceFlags.isGateEnabled('proofEnvelope')).toBe(true);
    });

    it('should return false for all gates when global enableAllGates is false', () => {
      governanceFlags.disableAllGates();
      expect(governanceFlags.isGateEnabled('continueGate')).toBe(false);
      expect(governanceFlags.isGateEnabled('proofEnvelope')).toBe(false);
      expect(governanceFlags.isGateEnabled('budgetMeter')).toBe(false);
    });

    it('should update flags at runtime', () => {
      governanceFlags.updateFlags({
        global: {
          enableAllGates: true,
          strictMode: true,
          logViolations: true,
          escalateToQueen: true,
        },
      });
      expect(governanceFlags.getFlags().global.strictMode).toBe(true);
    });

    it('should notify subscribers on flag changes', () => {
      const listener = vi.fn();
      const unsubscribe = governanceFlags.subscribe(listener);

      governanceFlags.enableStrictMode();

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          global: expect.objectContaining({ strictMode: true }),
        })
      );

      unsubscribe();
    });

    it('should unsubscribe listener correctly', () => {
      const listener = vi.fn();
      const unsubscribe = governanceFlags.subscribe(listener);

      unsubscribe();
      governanceFlags.enableStrictMode();

      expect(listener).not.toHaveBeenCalled();
    });

    it('should reset to defaults', () => {
      governanceFlags.disableAllGates();
      expect(governanceFlags.getFlags().global.enableAllGates).toBe(false);

      governanceFlags.reset();
      expect(governanceFlags.getFlags().global.enableAllGates).toBe(true);
    });
  });

  // ============================================================================
  // Convenience helpers
  // ============================================================================

  describe('convenience helpers', () => {
    it('isContinueGateEnabled returns true by default', () => {
      expect(isContinueGateEnabled()).toBe(true);
    });

    it('isMemoryWriteGateEnabled returns true by default', () => {
      expect(isMemoryWriteGateEnabled()).toBe(true);
    });

    it('isProofEnvelopeEnabled returns true by default', () => {
      expect(isProofEnvelopeEnabled()).toBe(true);
    });

    it('isBudgetMeterEnabled returns true by default', () => {
      expect(isBudgetMeterEnabled()).toBe(true);
    });

    it('isStrictMode returns false by default', () => {
      expect(isStrictMode()).toBe(false);
    });

    it('convenience helpers return false when all gates disabled', () => {
      governanceFlags.disableAllGates();
      expect(isContinueGateEnabled()).toBe(false);
      expect(isMemoryWriteGateEnabled()).toBe(false);
      expect(isProofEnvelopeEnabled()).toBe(false);
      expect(isBudgetMeterEnabled()).toBe(false);
    });
  });
});
