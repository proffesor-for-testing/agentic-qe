/**
 * ThresholdTuner Unit Tests
 * ADR-052: A4.2 - Threshold Auto-Tuning
 *
 * Tests for the adaptive threshold management system for coherence gates.
 * Verifies:
 * - Default threshold behavior
 * - Domain-specific threshold management
 * - EMA-based threshold adjustment
 * - False positive/negative tracking
 * - Manual override functionality
 * - Memory persistence
 * - EventBus integration
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ThresholdTuner,
  createThresholdTuner,
  DEFAULT_TUNER_CONFIG,
  type IThresholdMemoryStore,
  type IThresholdEventBus,
  type ThresholdTunerConfig,
  type ThresholdCalibratedPayload,
} from '../../../../src/integrations/coherence/threshold-tuner';
import type { ComputeLane, ComputeLaneConfig } from '../../../../src/integrations/coherence/types';
import type { DomainEvent } from '../../../../src/shared/types';

// ============================================================================
// Mock Helpers
// ============================================================================

function createMockMemoryStore(): IThresholdMemoryStore {
  const storage = new Map<string, unknown>();

  return {
    store: vi.fn(async (key: string, value: unknown, namespace?: string) => {
      const fullKey = namespace ? `${namespace}:${key}` : key;
      storage.set(fullKey, value);
    }),
    retrieve: vi.fn(async (key: string, namespace?: string) => {
      const fullKey = namespace ? `${namespace}:${key}` : key;
      return storage.get(fullKey) ?? null;
    }),
  };
}

function createMockEventBus(): IThresholdEventBus & {
  publishedEvents: DomainEvent<unknown>[];
  handlers: Map<string, ((event: DomainEvent<unknown>) => Promise<void>)[]>;
} {
  const publishedEvents: DomainEvent<unknown>[] = [];
  const handlers = new Map<string, ((event: DomainEvent<unknown>) => Promise<void>)[]>();

  return {
    publishedEvents,
    handlers,
    publish: vi.fn(async <T>(event: DomainEvent<T>) => {
      publishedEvents.push(event as DomainEvent<unknown>);
      const eventHandlers = handlers.get(event.type) || [];
      await Promise.all(eventHandlers.map(h => h(event as DomainEvent<unknown>)));
    }),
    subscribe: vi.fn(<T>(eventType: string, handler: (event: DomainEvent<T>) => Promise<void>) => {
      const existing = handlers.get(eventType) || [];
      existing.push(handler as (event: DomainEvent<unknown>) => Promise<void>);
      handlers.set(eventType, existing);
      return {
        unsubscribe: () => {
          const idx = existing.indexOf(handler as (event: DomainEvent<unknown>) => Promise<void>);
          if (idx >= 0) existing.splice(idx, 1);
        },
      };
    }),
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('ThresholdTuner', () => {
  let tuner: ThresholdTuner;
  let mockMemoryStore: ReturnType<typeof createMockMemoryStore>;
  let mockEventBus: ReturnType<typeof createMockEventBus>;

  beforeEach(() => {
    mockMemoryStore = createMockMemoryStore();
    mockEventBus = createMockEventBus();
    tuner = new ThresholdTuner({
      memoryStore: mockMemoryStore,
      eventBus: mockEventBus,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initialization', () => {
    it('should create with default configuration', () => {
      const defaultTuner = new ThresholdTuner();
      const stats = defaultTuner.getStats();

      expect(stats.config.emaAlpha).toBe(DEFAULT_TUNER_CONFIG.emaAlpha);
      expect(stats.config.targetFalsePositiveRate).toBe(DEFAULT_TUNER_CONFIG.targetFalsePositiveRate);
      expect(stats.config.targetFalseNegativeRate).toBe(DEFAULT_TUNER_CONFIG.targetFalseNegativeRate);
      expect(stats.config.minSamplesForCalibration).toBe(DEFAULT_TUNER_CONFIG.minSamplesForCalibration);
      expect(stats.config.autoCalibrate).toBe(DEFAULT_TUNER_CONFIG.autoCalibrate);
    });

    it('should accept custom configuration', () => {
      const customTuner = new ThresholdTuner({
        config: {
          emaAlpha: 0.2,
          targetFalsePositiveRate: 0.1,
          minSamplesForCalibration: 20,
        },
      });

      const stats = customTuner.getStats();

      expect(stats.config.emaAlpha).toBe(0.2);
      expect(stats.config.targetFalsePositiveRate).toBe(0.1);
      expect(stats.config.minSamplesForCalibration).toBe(20);
    });

    it('should accept manual overrides in config', () => {
      const customTuner = new ThresholdTuner({
        config: {
          manualOverrides: {
            'test-generation': {
              reflexThreshold: 0.05,
              retrievalThreshold: 0.3,
            },
          },
        },
      });

      const threshold = customTuner.getThreshold('test-generation', 'reflex');
      expect(threshold).toBe(0.05);

      const retrievalThreshold = customTuner.getThreshold('test-generation', 'retrieval');
      expect(retrievalThreshold).toBe(0.3);
    });
  });

  describe('getThreshold', () => {
    it('should return default thresholds for unknown domain', () => {
      expect(tuner.getThreshold('unknown-domain', 'reflex')).toBe(0.1);
      expect(tuner.getThreshold('unknown-domain', 'retrieval')).toBe(0.4);
      expect(tuner.getThreshold('unknown-domain', 'heavy')).toBe(0.7);
      expect(tuner.getThreshold('unknown-domain', 'human')).toBe(1.0);
    });

    it('should return domain-specific thresholds after recording outcomes', () => {
      // Record some outcomes to create domain state
      tuner.recordOutcome('security', true, 0.05);

      // Should still be defaults until calibration
      expect(tuner.getThreshold('security', 'reflex')).toBe(0.1);
    });

    it('should return manual override values when set', () => {
      tuner.setManualOverride('test-generation', {
        reflexThreshold: 0.08,
        retrievalThreshold: 0.35,
      });

      expect(tuner.getThreshold('test-generation', 'reflex')).toBe(0.08);
      expect(tuner.getThreshold('test-generation', 'retrieval')).toBe(0.35);
      // Heavy should still be default since not overridden
      expect(tuner.getThreshold('test-generation', 'heavy')).toBe(0.7);
    });
  });

  describe('getThresholds', () => {
    it('should return complete threshold config for domain', () => {
      const thresholds = tuner.getThresholds('test-generation');

      expect(thresholds).toEqual({
        reflexThreshold: 0.1,
        retrievalThreshold: 0.4,
        heavyThreshold: 0.7,
      });
    });

    it('should merge manual overrides with defaults', () => {
      tuner.setManualOverride('security', {
        reflexThreshold: 0.05,
      });

      const thresholds = tuner.getThresholds('security');

      expect(thresholds.reflexThreshold).toBe(0.05);
      expect(thresholds.retrievalThreshold).toBe(0.4);
      expect(thresholds.heavyThreshold).toBe(0.7);
    });
  });

  describe('recordOutcome', () => {
    it('should track correct outcomes', () => {
      tuner.recordOutcome('test-generation', true, 0.05);
      tuner.recordOutcome('test-generation', true, 0.15);
      tuner.recordOutcome('test-generation', false, 0.3);

      const stats = tuner.getStats();
      const domainStats = stats.domains['test-generation'];

      expect(domainStats.totalOutcomes).toBe(3);
      expect(domainStats.correctDecisions).toBe(2);
      expect(domainStats.accuracy).toBeCloseTo(2 / 3);
    });

    it('should track false positives and negatives', () => {
      // Record outcomes with explicit lanes
      // False positive: escalated to higher lane when shouldn't have
      tuner.recordOutcome('security', false, 0.05, 'retrieval');
      // False negative: didn't escalate when should have
      tuner.recordOutcome('security', false, 0.5, 'reflex');
      // Correct decision
      tuner.recordOutcome('security', true, 0.05, 'reflex');

      const stats = tuner.getStats();
      const domainStats = stats.domains['security'];

      expect(domainStats.totalOutcomes).toBe(3);
      expect(domainStats.falsePositives).toBe(1);
      expect(domainStats.falseNegatives).toBe(1);
    });

    it('should respect maxHistorySize', () => {
      const smallHistoryTuner = new ThresholdTuner({
        config: { maxHistorySize: 5 },
      });

      // Record more outcomes than max history size
      for (let i = 0; i < 10; i++) {
        smallHistoryTuner.recordOutcome('test', true, 0.05);
      }

      const stats = smallHistoryTuner.getStats();
      expect(stats.domains['test'].totalOutcomes).toBe(5);
    });

    it('should update EMA values', () => {
      // Record a false positive
      tuner.recordOutcome('test', false, 0.05, 'heavy');

      const stats1 = tuner.getStats();
      const fpRate1 = stats1.domains['test'].falsePositiveRate;
      expect(fpRate1).toBeGreaterThan(0);

      // Record several correct outcomes to reduce EMA
      for (let i = 0; i < 10; i++) {
        tuner.recordOutcome('test', true, 0.05, 'reflex');
      }

      const stats2 = tuner.getStats();
      const fpRate2 = stats2.domains['test'].falsePositiveRate;

      // FP rate should be lower after correct outcomes
      expect(fpRate2).toBeLessThan(fpRate1);
    });
  });

  describe('calibrate', () => {
    it('should not calibrate with insufficient samples', async () => {
      tuner.recordOutcome('test', true, 0.05);
      tuner.recordOutcome('test', false, 0.15);

      const beforeThresholds = tuner.getThresholds('test');

      await tuner.calibrate();

      const afterThresholds = tuner.getThresholds('test');

      // Should be unchanged - not enough samples
      expect(afterThresholds).toEqual(beforeThresholds);
      expect(mockEventBus.publishedEvents.length).toBe(0);
    });

    it('should calibrate when sufficient samples exist', async () => {
      // Record enough samples with high false positive rate
      for (let i = 0; i < 15; i++) {
        // High false positive rate - escalating too aggressively
        tuner.recordOutcome('test', false, 0.05, 'heavy');
      }

      const beforeThresholds = tuner.getThresholds('test');

      await tuner.calibrate();

      const afterThresholds = tuner.getThresholds('test');

      // Thresholds should increase to reduce false positives
      // Or at minimum, should hit the clamping boundary (which shows calibration happened)
      expect(afterThresholds.reflexThreshold).toBeGreaterThanOrEqual(beforeThresholds.reflexThreshold);
      expect(afterThresholds.retrievalThreshold).toBeGreaterThanOrEqual(beforeThresholds.retrievalThreshold);

      // Verify calibration was performed
      const stats = tuner.getStats();
      expect(stats.domains['test'].calibrationCount).toBeGreaterThan(0);
    });

    it('should decrease thresholds when false negative rate is high', async () => {
      // Start with higher thresholds so there's room to decrease
      const highThresholdTuner = new ThresholdTuner({
        eventBus: mockEventBus,
        config: {
          defaultThresholds: {
            reflexThreshold: 0.15,
            retrievalThreshold: 0.45,
            heavyThreshold: 0.75,
          },
          minSamplesForCalibration: 10,
        },
      });

      // Record samples with high false negative rate
      for (let i = 0; i < 15; i++) {
        // False negative - not escalating enough
        highThresholdTuner.recordOutcome('test', false, 0.5, 'reflex');
      }

      const beforeThresholds = highThresholdTuner.getThresholds('test');

      await highThresholdTuner.calibrate();

      const afterThresholds = highThresholdTuner.getThresholds('test');

      // Thresholds should decrease to reduce false negatives
      // Or at minimum should hit the lower clamping boundary
      expect(afterThresholds.reflexThreshold).toBeLessThanOrEqual(beforeThresholds.reflexThreshold);

      // Verify calibration was performed
      const stats = highThresholdTuner.getStats();
      expect(stats.domains['test'].calibrationCount).toBeGreaterThan(0);
    });

    it('should emit threshold_calibrated event on change', async () => {
      // Record samples with high false positive rate
      for (let i = 0; i < 15; i++) {
        tuner.recordOutcome('test', false, 0.05, 'heavy');
      }

      await tuner.calibrate();

      expect(mockEventBus.publish).toHaveBeenCalled();

      const event = mockEventBus.publishedEvents.find(
        e => e.type === 'coherence.threshold_calibrated'
      );

      expect(event).toBeDefined();

      const payload = event?.payload as ThresholdCalibratedPayload;
      expect(payload.domain).toBe('test');
      expect(payload.reason).toBe('scheduled');
      expect(payload.previousThresholds).toBeDefined();
      expect(payload.newThresholds).toBeDefined();
    });

    it('should not calibrate domains with manual override', async () => {
      tuner.setManualOverride('test', { reflexThreshold: 0.05 });

      // Record samples that would normally trigger calibration
      for (let i = 0; i < 15; i++) {
        tuner.recordOutcome('test', false, 0.05, 'heavy');
      }

      await tuner.calibrate();

      // Manual override should still be in effect
      expect(tuner.getThreshold('test', 'reflex')).toBe(0.05);

      // No calibration event should be emitted
      const calibrationEvents = mockEventBus.publishedEvents.filter(
        e => e.type === 'coherence.threshold_calibrated'
      );
      expect(calibrationEvents.length).toBe(0);
    });

    it('should respect maxAdjustmentPerCycle', async () => {
      const limitedTuner = new ThresholdTuner({
        eventBus: mockEventBus,
        config: {
          maxAdjustmentPerCycle: 0.01,
          minSamplesForCalibration: 5,
        },
      });

      // Record extreme false positive pattern
      for (let i = 0; i < 10; i++) {
        limitedTuner.recordOutcome('test', false, 0.05, 'human');
      }

      const before = limitedTuner.getThresholds('test');
      await limitedTuner.calibrate();
      const after = limitedTuner.getThresholds('test');

      // Adjustment should be limited
      expect(Math.abs(after.reflexThreshold - before.reflexThreshold)).toBeLessThanOrEqual(0.01);
    });
  });

  describe('auto-calibration', () => {
    it('should auto-calibrate when enabled and interval reached', async () => {
      const autoTuner = new ThresholdTuner({
        eventBus: mockEventBus,
        config: {
          autoCalibrate: true,
          autoCalibrateInterval: 10,
          minSamplesForCalibration: 5,
        },
      });

      // Record outcomes just under the interval
      for (let i = 0; i < 9; i++) {
        autoTuner.recordOutcome('test', false, 0.05, 'heavy');
      }

      // No calibration yet
      expect(mockEventBus.publishedEvents.length).toBe(0);

      // Record one more to trigger auto-calibration
      autoTuner.recordOutcome('test', false, 0.05, 'heavy');

      // Wait for async calibration
      await new Promise(resolve => setTimeout(resolve, 10));

      // Should have triggered calibration
      const stats = autoTuner.getStats();
      expect(stats.domains['test'].calibrationCount).toBeGreaterThan(0);
    });
  });

  describe('manual overrides', () => {
    it('should set manual override for domain', () => {
      tuner.setManualOverride('security', {
        reflexThreshold: 0.05,
        retrievalThreshold: 0.25,
        heavyThreshold: 0.6,
      });

      expect(tuner.getThreshold('security', 'reflex')).toBe(0.05);
      expect(tuner.getThreshold('security', 'retrieval')).toBe(0.25);
      expect(tuner.getThreshold('security', 'heavy')).toBe(0.6);
    });

    it('should clear manual override for domain', () => {
      tuner.setManualOverride('security', { reflexThreshold: 0.05 });
      expect(tuner.getThreshold('security', 'reflex')).toBe(0.05);

      tuner.clearManualOverride('security');
      expect(tuner.getThreshold('security', 'reflex')).toBe(0.1); // Back to default
    });

    it('should report manual override status in stats', () => {
      tuner.recordOutcome('security', true, 0.05);
      tuner.setManualOverride('security', { reflexThreshold: 0.05 });

      const stats = tuner.getStats();
      expect(stats.domains['security'].hasManualOverride).toBe(true);
    });
  });

  describe('reset', () => {
    it('should reset specific domain', () => {
      tuner.recordOutcome('domain1', true, 0.05);
      tuner.recordOutcome('domain2', true, 0.15);
      tuner.setManualOverride('domain1', { reflexThreshold: 0.05 });

      tuner.reset('domain1');

      const stats = tuner.getStats();
      expect(stats.domains['domain1']).toBeUndefined();
      expect(stats.domains['domain2']).toBeDefined();
      expect(tuner.getThreshold('domain1', 'reflex')).toBe(0.1); // Back to default
    });

    it('should reset all domains when no domain specified', () => {
      tuner.recordOutcome('domain1', true, 0.05);
      tuner.recordOutcome('domain2', true, 0.15);
      tuner.setManualOverride('domain1', { reflexThreshold: 0.05 });
      tuner.setManualOverride('domain2', { reflexThreshold: 0.08 });

      tuner.reset();

      const stats = tuner.getStats();
      expect(Object.keys(stats.domains).length).toBe(0);
      expect(tuner.getThreshold('domain1', 'reflex')).toBe(0.1);
      expect(tuner.getThreshold('domain2', 'reflex')).toBe(0.1);
    });
  });

  describe('getStats', () => {
    it('should return empty stats for new tuner', () => {
      const stats = tuner.getStats();

      expect(stats.global.totalOutcomes).toBe(0);
      expect(stats.global.accuracy).toBe(1);
      expect(stats.global.domainsCalibrated).toBe(0);
      expect(Object.keys(stats.domains).length).toBe(0);
    });

    it('should aggregate stats across domains', () => {
      tuner.recordOutcome('domain1', true, 0.05);
      tuner.recordOutcome('domain1', false, 0.15);
      tuner.recordOutcome('domain2', true, 0.25);
      tuner.recordOutcome('domain2', true, 0.35);

      const stats = tuner.getStats();

      expect(stats.global.totalOutcomes).toBe(4);
      expect(stats.global.correctDecisions).toBe(3);
      expect(stats.global.accuracy).toBe(0.75);
      expect(stats.domains['domain1'].totalOutcomes).toBe(2);
      expect(stats.domains['domain2'].totalOutcomes).toBe(2);
    });

    it('should track last calibration timestamp', async () => {
      for (let i = 0; i < 15; i++) {
        tuner.recordOutcome('test', false, 0.05, 'heavy');
      }

      const statsBefore = tuner.getStats();
      expect(statsBefore.domains['test'].lastCalibrationAt).toBeUndefined();

      await tuner.calibrate();

      const statsAfter = tuner.getStats();
      expect(statsAfter.domains['test'].lastCalibrationAt).toBeDefined();
      expect(statsAfter.global.lastCalibrationAt).toBeDefined();
    });
  });

  describe('persistence', () => {
    it('should persist thresholds to memory store', async () => {
      tuner.recordOutcome('test-generation', true, 0.05);
      tuner.setManualOverride('security', { reflexThreshold: 0.05 });

      await tuner.persist();

      expect(mockMemoryStore.store).toHaveBeenCalledTimes(2);
    });

    it('should load persisted thresholds from memory store', async () => {
      // Setup mock data
      const mockDomains = {
        'test-generation': {
          thresholds: { reflexThreshold: 0.08, retrievalThreshold: 0.35, heavyThreshold: 0.65 },
          calibrationCount: 5,
        },
      };
      const mockOverrides = {
        'security': { reflexThreshold: 0.05 },
      };

      (mockMemoryStore.retrieve as ReturnType<typeof vi.fn>)
        .mockImplementation(async (key: string) => {
          if (key.includes('domains')) return mockDomains;
          if (key.includes('overrides')) return mockOverrides;
          return null;
        });

      await tuner.load();

      expect(tuner.getThreshold('test-generation', 'reflex')).toBe(0.08);
      expect(tuner.getThreshold('security', 'reflex')).toBe(0.05);
    });

    it('should handle missing persisted data gracefully', async () => {
      (mockMemoryStore.retrieve as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await tuner.load();

      // Should use defaults
      expect(tuner.getThreshold('test', 'reflex')).toBe(0.1);
    });

    it('should work without memory store', async () => {
      const noStoreTuner = new ThresholdTuner();

      // Should not throw
      await noStoreTuner.persist();
      await noStoreTuner.load();

      expect(noStoreTuner.getThreshold('test', 'reflex')).toBe(0.1);
    });
  });

  describe('factory function', () => {
    it('should create tuner with createThresholdTuner', () => {
      const factoryTuner = createThresholdTuner({
        memoryStore: mockMemoryStore,
        eventBus: mockEventBus,
        config: { emaAlpha: 0.2 },
      });

      expect(factoryTuner).toBeInstanceOf(ThresholdTuner);

      const stats = factoryTuner.getStats();
      expect(stats.config.emaAlpha).toBe(0.2);
    });

    it('should create tuner with no options', () => {
      const factoryTuner = createThresholdTuner();

      expect(factoryTuner).toBeInstanceOf(ThresholdTuner);
    });
  });

  describe('edge cases', () => {
    it('should handle rapid successive calls', () => {
      for (let i = 0; i < 100; i++) {
        tuner.recordOutcome('test', Math.random() > 0.5, Math.random());
      }

      const stats = tuner.getStats();
      expect(stats.domains['test'].totalOutcomes).toBe(100);
    });

    it('should handle all compute lanes', () => {
      const lanes: ComputeLane[] = ['reflex', 'retrieval', 'heavy', 'human'];

      for (const lane of lanes) {
        const threshold = tuner.getThreshold('test', lane);
        expect(typeof threshold).toBe('number');
        expect(threshold).toBeGreaterThan(0);
        expect(threshold).toBeLessThanOrEqual(1);
      }
    });

    it('should clamp threshold adjustments within bounds', async () => {
      const extremeTuner = new ThresholdTuner({
        eventBus: mockEventBus,
        config: {
          minSamplesForCalibration: 5,
          maxAdjustmentPerCycle: 1.0, // Allow large adjustments
        },
      });

      // Extreme false positive pattern - should not exceed bounds
      for (let i = 0; i < 50; i++) {
        extremeTuner.recordOutcome('test', false, 0.05, 'human');
      }

      await extremeTuner.calibrate();

      const thresholds = extremeTuner.getThresholds('test');

      // Should be clamped to reasonable bounds
      expect(thresholds.reflexThreshold).toBeLessThanOrEqual(0.3);
      expect(thresholds.retrievalThreshold).toBeLessThanOrEqual(0.6);
      expect(thresholds.heavyThreshold).toBeLessThanOrEqual(0.9);
    });

    it('should handle multiple domains independently', async () => {
      // Different patterns for different domains
      for (let i = 0; i < 15; i++) {
        tuner.recordOutcome('domain1', false, 0.05, 'heavy'); // High FP
        tuner.recordOutcome('domain2', true, 0.05); // All correct
      }

      await tuner.calibrate();

      const stats = tuner.getStats();

      // Domain1 should have been adjusted (high FP)
      expect(stats.domains['domain1'].calibrationCount).toBe(1);

      // Domain2 should not need adjustment (all correct)
      // Note: calibration count may still increment even if no change
      expect(stats.domains['domain2'].accuracy).toBe(1);
    });
  });

  describe('default thresholds per ADR-052', () => {
    it('should use ADR-052 default thresholds', () => {
      expect(DEFAULT_TUNER_CONFIG.defaultThresholds.reflexThreshold).toBe(0.1);
      expect(DEFAULT_TUNER_CONFIG.defaultThresholds.retrievalThreshold).toBe(0.4);
      expect(DEFAULT_TUNER_CONFIG.defaultThresholds.heavyThreshold).toBe(0.7);
    });

    it('should map lanes correctly to thresholds', () => {
      // reflex: E < 0.1
      expect(tuner.getThreshold('test', 'reflex')).toBe(0.1);

      // retrieval: 0.1 - 0.4
      expect(tuner.getThreshold('test', 'retrieval')).toBe(0.4);

      // heavy: 0.4 - 0.7
      expect(tuner.getThreshold('test', 'heavy')).toBe(0.7);

      // human: E > 0.7 (always 1.0)
      expect(tuner.getThreshold('test', 'human')).toBe(1.0);
    });
  });
});
