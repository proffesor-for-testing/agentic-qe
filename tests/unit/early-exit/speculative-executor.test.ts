/**
 * Unit tests for Speculative Test Executor
 * ADR-033: Early Exit Testing
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  SpeculativeExecutor,
  createSpeculativeExecutor,
  LayerHistory,
} from '../../../src/early-exit/speculative-executor';
import {
  EarlyExitDecision,
  TestLayer,
  LayerResult,
  DEFAULT_EXIT_CONFIG,
} from '../../../src/early-exit/types';

describe('Speculative Test Executor', () => {
  let executor: SpeculativeExecutor;

  beforeEach(() => {
    executor = new SpeculativeExecutor(DEFAULT_EXIT_CONFIG);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ============================================================================
  // Helper Functions
  // ============================================================================

  function createTestLayer(index: number, type: 'unit' | 'integration' | 'e2e' | 'performance'): TestLayer {
    return {
      index,
      type,
      name: `${type} layer`,
      testFiles: [`${type}.test.ts`],
      expectedDuration: type === 'unit' ? 1000 : type === 'integration' ? 5000 : type === 'e2e' ? 30000 : 60000,
    };
  }

  function createExitDecision(confidence: number): EarlyExitDecision {
    return {
      canExit: true,
      confidence,
      exitLayer: 1,
      reason: 'confident_exit',
      enableSpeculation: true,
      explanation: 'Test decision',
      timestamp: new Date(),
      lambdaStability: 0.9,
      lambdaValue: 90,
    };
  }

  function createLayerResult(passRate: number, flakyRatio: number): LayerResult {
    return {
      layerIndex: 0,
      layerType: 'unit',
      passRate,
      coverage: 0.8,
      flakyRatio,
      totalTests: 100,
      passedTests: Math.round(passRate * 100),
      failedTests: Math.round((1 - passRate) * 100),
      skippedTests: 0,
      duration: 1000,
    };
  }

  // ============================================================================
  // Speculation Tests
  // ============================================================================
  describe('speculate', () => {
    it('should generate predictions for skipped layers', async () => {
      const decision = createExitDecision(0.9);
      const skippedLayers = [
        createTestLayer(2, 'e2e'),
        createTestLayer(3, 'performance'),
      ];

      const batch = await executor.speculate(decision, skippedLayers);

      expect(batch.predictions.length).toBe(2);
      expect(batch.predictions[0].layerIndex).toBe(2);
      expect(batch.predictions[1].layerIndex).toBe(3);
    });

    it('should predict pass for high confidence', async () => {
      const decision = createExitDecision(0.92);
      const skippedLayers = [createTestLayer(2, 'e2e')];

      const batch = await executor.speculate(decision, skippedLayers);

      expect(batch.predictions[0].predicted).toBe('pass');
      expect(batch.predictions[0].confidence).toBeGreaterThan(0.8);
    });

    it('should predict flaky for moderate confidence', async () => {
      const decision = createExitDecision(0.75);
      const skippedLayers = [createTestLayer(2, 'e2e')];

      const batch = await executor.speculate(decision, skippedLayers);

      expect(batch.predictions[0].predicted).toBe('flaky');
    });

    it('should predict fail for low confidence', async () => {
      const decision = createExitDecision(0.55);
      const skippedLayers = [createTestLayer(2, 'e2e')];

      const batch = await executor.speculate(decision, skippedLayers);

      expect(batch.predictions[0].predicted).toBe('fail');
    });

    it('should calculate batch confidence', async () => {
      const decision = createExitDecision(0.85);
      const skippedLayers = [
        createTestLayer(2, 'e2e'),
        createTestLayer(3, 'performance'),
      ];

      const batch = await executor.speculate(decision, skippedLayers);

      expect(batch.batchConfidence).toBeGreaterThan(0);
      expect(batch.batchConfidence).toBeLessThanOrEqual(1);
    });

    it('should include reasoning in predictions', async () => {
      const decision = createExitDecision(0.9);
      const skippedLayers = [createTestLayer(2, 'e2e')];

      const batch = await executor.speculate(decision, skippedLayers);

      expect(batch.predictions[0].reasoning).toBeDefined();
      expect(batch.predictions[0].reasoning.length).toBeGreaterThan(0);
    });

    it('should mark predictions as unverified', async () => {
      const decision = createExitDecision(0.9);
      const skippedLayers = [createTestLayer(2, 'e2e')];

      const batch = await executor.speculate(decision, skippedLayers);

      expect(batch.predictions[0].verified).toBe(false);
      expect(batch.verifiedCount).toBe(0);
    });
  });

  // ============================================================================
  // Verification Tests
  // ============================================================================
  describe('verify', () => {
    it('should verify predictions with actual results', async () => {
      const decision = createExitDecision(0.9);
      const skippedLayers = [createTestLayer(2, 'e2e')];
      const batch = await executor.speculate(decision, skippedLayers);

      const mockRunLayer = vi.fn().mockResolvedValue(createLayerResult(0.99, 0.01));

      const verified = await executor.verify(batch.predictions, skippedLayers, mockRunLayer);

      expect(verified[0].verified).toBe(true);
      expect(verified[0].actual).toBe('pass');
      expect(mockRunLayer).toHaveBeenCalledTimes(1);
    });

    it('should determine correct prediction accuracy', async () => {
      const decision = createExitDecision(0.9);
      const skippedLayers = [createTestLayer(2, 'e2e')];
      const batch = await executor.speculate(decision, skippedLayers);

      // Mock a passing result
      const mockRunLayer = vi.fn().mockResolvedValue(createLayerResult(0.99, 0.01));

      const verified = await executor.verify(batch.predictions, skippedLayers, mockRunLayer);

      // Prediction was 'pass', actual was 'pass'
      expect(verified[0].correct).toBe(true);
    });

    it('should mark incorrect prediction', async () => {
      const decision = createExitDecision(0.9);
      const skippedLayers = [createTestLayer(2, 'e2e')];
      const batch = await executor.speculate(decision, skippedLayers);

      // Mock a failing result
      const mockRunLayer = vi.fn().mockResolvedValue(createLayerResult(0.5, 0.01));

      const verified = await executor.verify(batch.predictions, skippedLayers, mockRunLayer);

      // Prediction was 'pass', actual was 'fail'
      expect(verified[0].correct).toBe(false);
    });

    it('should respect verificationLayers limit', async () => {
      const limitedExecutor = new SpeculativeExecutor({
        ...DEFAULT_EXIT_CONFIG,
        verificationLayers: 1,
      });

      const decision = createExitDecision(0.9);
      const skippedLayers = [
        createTestLayer(2, 'e2e'),
        createTestLayer(3, 'performance'),
      ];
      const batch = await limitedExecutor.speculate(decision, skippedLayers);

      const mockRunLayer = vi.fn().mockResolvedValue(createLayerResult(0.99, 0.01));

      const verified = await limitedExecutor.verify(batch.predictions, skippedLayers, mockRunLayer);

      expect(mockRunLayer).toHaveBeenCalledTimes(1); // Only 1 verification
      expect(verified[0].verified).toBe(true);
      expect(verified[1].verified).toBe(false);
    });

    it('should handle verification errors gracefully', async () => {
      const decision = createExitDecision(0.9);
      const skippedLayers = [createTestLayer(2, 'e2e')];
      const batch = await executor.speculate(decision, skippedLayers);

      const mockRunLayer = vi.fn().mockRejectedValue(new Error('Test execution failed'));

      const verified = await executor.verify(batch.predictions, skippedLayers, mockRunLayer);

      expect(verified[0].verified).toBe(false);
      expect(verified[0].reasoning).toContain('verification failed');
    });
  });

  // ============================================================================
  // Historical Data Tests
  // ============================================================================
  describe('historical data', () => {
    it('should use history for more accurate predictions', async () => {
      // Set up history with high pass rate
      const history: LayerHistory = {
        layerIndex: 2,
        avgPassRate: 0.98,
        passRateVariance: 0.01,
        avgFlakyRate: 0.02,
        dataPoints: 20,
        trend: 0.01,
      };
      executor.setLayerHistory(history);

      const decision = createExitDecision(0.8); // Moderate confidence
      const skippedLayers = [createTestLayer(2, 'e2e')];

      const batch = await executor.speculate(decision, skippedLayers);

      // History should boost confidence towards 'pass'
      expect(batch.predictions[0].predicted).toBe('pass');
    });

    it('should predict flaky for high historical flaky rate', async () => {
      const history: LayerHistory = {
        layerIndex: 2,
        avgPassRate: 0.85,
        passRateVariance: 0.1,
        avgFlakyRate: 0.15,
        dataPoints: 15,
        trend: -0.02,
      };
      executor.setLayerHistory(history);

      const decision = createExitDecision(0.85);
      const skippedLayers = [createTestLayer(2, 'e2e')];

      const batch = await executor.speculate(decision, skippedLayers);

      expect(batch.predictions[0].predicted).toBe('flaky');
    });

    it('should predict fail for low historical pass rate', async () => {
      const history: LayerHistory = {
        layerIndex: 2,
        avgPassRate: 0.65,
        passRateVariance: 0.05,
        avgFlakyRate: 0.05,
        dataPoints: 10,
        trend: -0.05,
      };
      executor.setLayerHistory(history);

      const decision = createExitDecision(0.85);
      const skippedLayers = [createTestLayer(2, 'e2e')];

      const batch = await executor.speculate(decision, skippedLayers);

      expect(batch.predictions[0].predicted).toBe('fail');
    });

    it('should update history from verification results', async () => {
      const decision = createExitDecision(0.9);
      const skippedLayers = [createTestLayer(2, 'e2e')];
      const batch = await executor.speculate(decision, skippedLayers);

      const mockRunLayer = vi.fn().mockResolvedValue(createLayerResult(0.95, 0.03));

      await executor.verify(batch.predictions, skippedLayers, mockRunLayer);

      const history = executor.getLayerHistory(2);
      expect(history).toBeDefined();
      expect(history?.avgPassRate).toBeCloseTo(0.95, 2);
    });

    it('should calculate running statistics for history', async () => {
      const decision = createExitDecision(0.9);
      const skippedLayers = [createTestLayer(2, 'e2e')];

      // First verification
      const batch1 = await executor.speculate(decision, skippedLayers);
      await executor.verify(batch1.predictions, skippedLayers, () =>
        Promise.resolve(createLayerResult(0.90, 0.02))
      );

      // Second verification
      const batch2 = await executor.speculate(decision, skippedLayers);
      await executor.verify(batch2.predictions, skippedLayers, () =>
        Promise.resolve(createLayerResult(0.95, 0.03))
      );

      const history = executor.getLayerHistory(2);
      expect(history?.dataPoints).toBe(2);
      expect(history?.avgPassRate).toBeGreaterThan(0.9);
    });
  });

  // ============================================================================
  // Accuracy Statistics Tests
  // ============================================================================
  describe('accuracy statistics', () => {
    it('should track prediction accuracy', async () => {
      const decision = createExitDecision(0.9);
      const skippedLayers = [createTestLayer(2, 'e2e')];

      // Make several predictions and verify
      for (let i = 0; i < 3; i++) {
        const batch = await executor.speculate(decision, skippedLayers);
        await executor.verify(batch.predictions, skippedLayers, () =>
          Promise.resolve(createLayerResult(0.99, 0.01))
        );
      }

      const stats = executor.getAccuracyStats();

      expect(stats.total).toBe(3);
      expect(stats.verified).toBe(3);
      expect(stats.accuracy).toBeGreaterThan(0);
    });

    it('should track outcome breakdown', async () => {
      executor.clearAll();

      // High confidence -> predict pass
      const decision1 = createExitDecision(0.95);
      const batch1 = await executor.speculate(decision1, [createTestLayer(2, 'e2e')]);
      await executor.verify(batch1.predictions, [createTestLayer(2, 'e2e')], () =>
        Promise.resolve(createLayerResult(0.99, 0.01))
      );

      // Low confidence -> predict fail
      const decision2 = createExitDecision(0.5);
      const batch2 = await executor.speculate(decision2, [createTestLayer(2, 'e2e')]);
      await executor.verify(batch2.predictions, [createTestLayer(2, 'e2e')], () =>
        Promise.resolve(createLayerResult(0.6, 0.05))
      );

      const stats = executor.getAccuracyStats();

      expect(stats.outcomeBreakdown.pass.predicted).toBeGreaterThan(0);
      expect(stats.outcomeBreakdown.fail.predicted).toBeGreaterThan(0);
    });

    it('should reset statistics', async () => {
      const decision = createExitDecision(0.9);
      const skippedLayers = [createTestLayer(2, 'e2e')];

      const batch = await executor.speculate(decision, skippedLayers);
      await executor.verify(batch.predictions, skippedLayers, () =>
        Promise.resolve(createLayerResult(0.99, 0.01))
      );

      executor.reset();
      const stats = executor.getAccuracyStats();

      expect(stats.total).toBe(0);
    });

    it('should keep history on reset but clear on clearAll', async () => {
      const decision = createExitDecision(0.9);
      const skippedLayers = [createTestLayer(2, 'e2e')];

      const batch = await executor.speculate(decision, skippedLayers);
      await executor.verify(batch.predictions, skippedLayers, () =>
        Promise.resolve(createLayerResult(0.99, 0.01))
      );

      executor.reset();
      expect(executor.getLayerHistory(2)).toBeDefined();

      executor.clearAll();
      expect(executor.getLayerHistory(2)).toBeUndefined();
    });
  });

  // ============================================================================
  // Factory Function Tests
  // ============================================================================
  describe('factory functions', () => {
    it('should create executor with default config', () => {
      const instance = createSpeculativeExecutor();

      expect(instance).toBeInstanceOf(SpeculativeExecutor);
    });

    it('should create executor with custom config', () => {
      const instance = createSpeculativeExecutor({
        verificationLayers: 3,
        speculativeTests: 6,
      });

      expect(instance).toBeInstanceOf(SpeculativeExecutor);
    });
  });

  // ============================================================================
  // Edge Cases
  // ============================================================================
  describe('edge cases', () => {
    it('should handle empty skipped layers', async () => {
      const decision = createExitDecision(0.9);
      const batch = await executor.speculate(decision, []);

      expect(batch.predictions.length).toBe(0);
      expect(batch.batchConfidence).toBe(0);
    });

    it('should use layer historical pass rate if provided', async () => {
      const decision = createExitDecision(0.9);
      const skippedLayers = [{
        ...createTestLayer(2, 'e2e'),
        historicalPassRate: 0.7, // Lower than expected
      }];

      const batch = await executor.speculate(decision, skippedLayers);

      // Should reduce confidence due to lower historical pass rate
      expect(batch.predictions[0].reasoning).toContain('Historical pass rate');
    });
  });
});
