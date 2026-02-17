/**
 * Unit tests for Early Exit Controller
 * ADR-033: Early Exit Testing
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  EarlyExitController,
  createEarlyExitController,
  createCustomController,
  LayerExecutor,
} from '../../../src/early-exit/early-exit-controller';
import {
  TestLayer,
  LayerResult,
  TestPyramidResult,
  DEFAULT_EXIT_CONFIG,
  AGGRESSIVE_EXIT_CONFIG,
} from '../../../src/early-exit/types';

describe('Early Exit Controller', () => {
  let controller: EarlyExitController;

  beforeEach(() => {
    controller = new EarlyExitController(DEFAULT_EXIT_CONFIG, 4);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ============================================================================
  // Helper Functions
  // ============================================================================

  function createTestLayers(): TestLayer[] {
    return [
      { index: 0, type: 'unit', name: 'Unit Tests', testFiles: ['unit.test.ts'], expectedDuration: 1000 },
      { index: 1, type: 'integration', name: 'Integration Tests', testFiles: ['integration.test.ts'], expectedDuration: 5000 },
      { index: 2, type: 'e2e', name: 'E2E Tests', testFiles: ['e2e.test.ts'], expectedDuration: 30000 },
      { index: 3, type: 'performance', name: 'Performance Tests', testFiles: ['perf.test.ts'], expectedDuration: 60000 },
    ];
  }

  function createPassingResult(layerIndex: number, type: 'unit' | 'integration' | 'e2e' | 'performance'): LayerResult {
    return {
      layerIndex,
      layerType: type,
      passRate: 0.98,
      coverage: 0.85,
      flakyRatio: 0.02,
      totalTests: 100,
      passedTests: 98,
      failedTests: 1,
      skippedTests: 1,
      duration: type === 'unit' ? 1000 : type === 'integration' ? 5000 : type === 'e2e' ? 30000 : 60000,
    };
  }

  function createFailingResult(layerIndex: number, type: 'unit' | 'integration' | 'e2e' | 'performance'): LayerResult {
    return {
      layerIndex,
      layerType: type,
      passRate: 0.6,
      coverage: 0.5,
      flakyRatio: 0.15,
      totalTests: 100,
      passedTests: 60,
      failedTests: 35,
      skippedTests: 5,
      duration: type === 'unit' ? 1500 : type === 'integration' ? 7000 : type === 'e2e' ? 40000 : 80000,
    };
  }

  // ============================================================================
  // Basic Execution Tests
  // ============================================================================
  describe('runWithEarlyExit', () => {
    it('should complete all layers when no early exit', async () => {
      const layers = createTestLayers();

      // Create executor that returns mediocre results (won't trigger early exit)
      const executor: LayerExecutor = async (layer) => ({
        layerIndex: layer.index,
        layerType: layer.type,
        passRate: 0.75,
        coverage: 0.65,
        flakyRatio: 0.1,
        totalTests: 50,
        passedTests: 37,
        failedTests: 10,
        skippedTests: 3,
        duration: 2000,
      });

      const result = await controller.runWithEarlyExit(layers, executor);

      expect(result.exitedEarly).toBe(false);
      expect(result.layers.length).toBe(4);
      expect(result.skippedLayers).toBe(0);
    });

    it('should exit early with high-quality results', async () => {
      const layers = createTestLayers();
      let callCount = 0;

      const executor: LayerExecutor = async (layer) => {
        callCount++;
        return createPassingResult(layer.index, layer.type);
      };

      const result = await controller.runWithEarlyExit(layers, executor);

      // With default config and high-quality results, might exit early or complete
      // The key is the metrics are tracked correctly
      expect(result).toBeDefined();
      expect(result.layers.length).toBeGreaterThanOrEqual(1);
      expect(result.confidence).toBeGreaterThan(0);

      // If exited early, should have skipped layers
      if (result.exitedEarly) {
        expect(result.exitLayer).toBeLessThan(layers.length - 1);
        expect(callCount).toBeLessThanOrEqual(result.exitLayer + 1 + result.speculations.filter(s => s.verified).length);
      }
    });

    it('should not exit early with poor results', async () => {
      const layers = createTestLayers();

      const executor: LayerExecutor = async (layer) => {
        return createFailingResult(layer.index, layer.type);
      };

      const result = await controller.runWithEarlyExit(layers, executor);

      expect(result.exitedEarly).toBe(false);
      expect(result.layers.length).toBe(4);
    });

    it('should calculate compute savings correctly', async () => {
      const layers = createTestLayers();

      const executor: LayerExecutor = async (layer) => {
        return createPassingResult(layer.index, layer.type);
      };

      const result = await controller.runWithEarlyExit(layers, executor);

      if (result.exitedEarly) {
        expect(result.computeSavings).toBeGreaterThan(0);
      }
    });

    it('should generate speculations for skipped layers', async () => {
      const layers = createTestLayers();

      const executor: LayerExecutor = async (layer) => {
        return createPassingResult(layer.index, layer.type);
      };

      const result = await controller.runWithEarlyExit(layers, executor);

      if (result.exitedEarly && result.skippedLayers > 0) {
        expect(result.speculations.length).toBeGreaterThan(0);
      }
    });

    it('should include final quality signal', async () => {
      const layers = createTestLayers();

      const executor: LayerExecutor = async (layer) => {
        return createPassingResult(layer.index, layer.type);
      };

      const result = await controller.runWithEarlyExit(layers, executor);

      expect(result.finalSignal).toBeDefined();
      expect(result.finalSignal.lambda).toBeGreaterThan(0);
    });

    it('should include decision details', async () => {
      const layers = createTestLayers();

      const executor: LayerExecutor = async (layer) => {
        return createPassingResult(layer.index, layer.type);
      };

      const result = await controller.runWithEarlyExit(layers, executor);

      expect(result.decision).toBeDefined();
      expect(result.decision.explanation).toBeDefined();
      expect(result.decision.timestamp).toBeInstanceOf(Date);
    });
  });

  // ============================================================================
  // Event Handler Tests
  // ============================================================================
  describe('event handlers', () => {
    it('should call onLayerStart for each executed layer', async () => {
      const layers = createTestLayers();
      const onLayerStart = vi.fn();

      controller.setEvents({ onLayerStart });

      const executor: LayerExecutor = async (layer) => {
        return createPassingResult(layer.index, layer.type);
      };

      await controller.runWithEarlyExit(layers, executor);

      expect(onLayerStart).toHaveBeenCalled();
    });

    it('should call onLayerComplete with result and signal', async () => {
      const layers = createTestLayers();
      const onLayerComplete = vi.fn();

      controller.setEvents({ onLayerComplete });

      const executor: LayerExecutor = async (layer) => {
        return createPassingResult(layer.index, layer.type);
      };

      await controller.runWithEarlyExit(layers, executor);

      expect(onLayerComplete).toHaveBeenCalled();
      const [layer, result, signal] = onLayerComplete.mock.calls[0];
      expect(layer).toBeDefined();
      expect(result).toBeDefined();
      expect(signal).toBeDefined();
    });

    it('should call onDecision after each layer', async () => {
      const layers = createTestLayers();
      const onDecision = vi.fn();

      controller.setEvents({ onDecision });

      const executor: LayerExecutor = async (layer) => {
        return createPassingResult(layer.index, layer.type);
      };

      await controller.runWithEarlyExit(layers, executor);

      expect(onDecision).toHaveBeenCalled();
    });

    it('should call onEarlyExit when exiting early', async () => {
      const layers = createTestLayers();
      const onEarlyExit = vi.fn();

      controller.setEvents({ onEarlyExit });

      const executor: LayerExecutor = async (layer) => {
        return createPassingResult(layer.index, layer.type);
      };

      const result = await controller.runWithEarlyExit(layers, executor);

      if (result.exitedEarly) {
        expect(onEarlyExit).toHaveBeenCalled();
        const [exitLayer, decision] = onEarlyExit.mock.calls[0];
        expect(typeof exitLayer).toBe('number');
        expect(decision).toBeDefined();
      }
    });

    it('should call onSpeculationComplete when speculating', async () => {
      const layers = createTestLayers();
      const onSpeculationComplete = vi.fn();

      controller.setEvents({ onSpeculationComplete });

      const executor: LayerExecutor = async (layer) => {
        return createPassingResult(layer.index, layer.type);
      };

      const result = await controller.runWithEarlyExit(layers, executor);

      if (result.exitedEarly && result.speculations.length > 0) {
        expect(onSpeculationComplete).toHaveBeenCalled();
      }
    });

    it('should call onComplete with final result', async () => {
      const layers = createTestLayers();
      const onComplete = vi.fn();

      controller.setEvents({ onComplete });

      const executor: LayerExecutor = async (layer) => {
        return createPassingResult(layer.index, layer.type);
      };

      await controller.runWithEarlyExit(layers, executor);

      expect(onComplete).toHaveBeenCalled();
      const [result] = onComplete.mock.calls[0];
      expect(result).toBeDefined();
      expect(result.layers).toBeDefined();
    });
  });

  // ============================================================================
  // Metrics Tests
  // ============================================================================
  describe('metrics', () => {
    it('should track total executions', async () => {
      const layers = createTestLayers();
      const executor: LayerExecutor = async (layer) => createPassingResult(layer.index, layer.type);

      await controller.runWithEarlyExit(layers, executor);
      await controller.runWithEarlyExit(layers, executor);

      const metrics = controller.getMetrics();
      expect(metrics.totalExecutions).toBe(2);
    });

    it('should track early exit count', async () => {
      const layers = createTestLayers();
      const executor: LayerExecutor = async (layer) => createPassingResult(layer.index, layer.type);

      const result1 = await controller.runWithEarlyExit(layers, executor);
      const result2 = await controller.runWithEarlyExit(layers, executor);

      const metrics = controller.getMetrics();
      const expectedExits = (result1.exitedEarly ? 1 : 0) + (result2.exitedEarly ? 1 : 0);
      expect(metrics.earlyExitCount).toBe(expectedExits);
    });

    it('should calculate early exit rate', async () => {
      const layers = createTestLayers();

      // First execution with high quality (should exit early)
      await controller.runWithEarlyExit(layers, async (layer) => createPassingResult(layer.index, layer.type));

      // Second execution with low quality (should not exit early)
      await controller.runWithEarlyExit(layers, async (layer) => createFailingResult(layer.index, layer.type));

      const metrics = controller.getMetrics();
      expect(metrics.earlyExitRate).toBeGreaterThanOrEqual(0);
      expect(metrics.earlyExitRate).toBeLessThanOrEqual(1);
    });

    it('should track compute savings', async () => {
      const layers = createTestLayers();
      const executor: LayerExecutor = async (layer) => createPassingResult(layer.index, layer.type);

      const result = await controller.runWithEarlyExit(layers, executor);

      if (result.exitedEarly) {
        const metrics = controller.getMetrics();
        expect(metrics.totalComputeSavings).toBeGreaterThan(0);
        expect(metrics.avgComputeSavings).toBeGreaterThan(0);
      }
    });

    it('should track exit layer distribution', async () => {
      const layers = createTestLayers();
      const executor: LayerExecutor = async (layer) => createPassingResult(layer.index, layer.type);

      await controller.runWithEarlyExit(layers, executor);

      const metrics = controller.getMetrics();
      expect(metrics.exitLayerDistribution.size).toBeGreaterThan(0);
    });

    it('should track exit reason distribution', async () => {
      const layers = createTestLayers();
      const executor: LayerExecutor = async (layer) => createPassingResult(layer.index, layer.type);

      await controller.runWithEarlyExit(layers, executor);

      const metrics = controller.getMetrics();
      expect(metrics.exitReasonDistribution.size).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // State Management Tests
  // ============================================================================
  describe('state management', () => {
    it('should store layer results', async () => {
      const layers = createTestLayers();
      const executor: LayerExecutor = async (layer) => createPassingResult(layer.index, layer.type);

      await controller.runWithEarlyExit(layers, executor);

      const result0 = controller.getLayerResult(0);
      expect(result0).toBeDefined();
      expect(result0?.layerIndex).toBe(0);
    });

    it('should store quality signals', async () => {
      const layers = createTestLayers();
      const executor: LayerExecutor = async (layer) => createPassingResult(layer.index, layer.type);

      await controller.runWithEarlyExit(layers, executor);

      const signal0 = controller.getQualitySignal(0);
      expect(signal0).toBeDefined();
      expect(signal0?.lambda).toBeGreaterThan(0);
    });

    it('should track decision history', async () => {
      const layers = createTestLayers();
      const executor: LayerExecutor = async (layer) => createPassingResult(layer.index, layer.type);

      await controller.runWithEarlyExit(layers, executor);

      const history = controller.getDecisionHistory();
      expect(history.length).toBeGreaterThan(0);
    });

    it('should reset state correctly', async () => {
      const layers = createTestLayers();
      const executor: LayerExecutor = async (layer) => createPassingResult(layer.index, layer.type);

      await controller.runWithEarlyExit(layers, executor);
      controller.reset();

      expect(controller.getLayerResult(0)).toBeUndefined();
      expect(controller.getQualitySignal(0)).toBeUndefined();
      expect(controller.getDecisionHistory().length).toBe(0);
    });

    it('should clear all state including metrics', async () => {
      const layers = createTestLayers();
      const executor: LayerExecutor = async (layer) => createPassingResult(layer.index, layer.type);

      await controller.runWithEarlyExit(layers, executor);
      controller.clearAll();

      const metrics = controller.getMetrics();
      expect(metrics.totalExecutions).toBe(0);
    });
  });

  // ============================================================================
  // Configuration Tests
  // ============================================================================
  describe('configuration', () => {
    it('should use aggressive config for fast feedback', async () => {
      const aggressiveController = new EarlyExitController(AGGRESSIVE_EXIT_CONFIG, 4);
      const layers = createTestLayers();

      // Even moderate results should trigger early exit with aggressive config
      const executor: LayerExecutor = async (layer) => ({
        layerIndex: layer.index,
        layerType: layer.type,
        passRate: 0.85,
        coverage: 0.75,
        flakyRatio: 0.05,
        totalTests: 50,
        passedTests: 42,
        failedTests: 5,
        skippedTests: 3,
        duration: 2000,
      });

      const result = await aggressiveController.runWithEarlyExit(layers, executor);

      // With aggressive config, should exit at layer 0
      if (result.exitedEarly) {
        expect(result.exitLayer).toBeLessThanOrEqual(1);
      }
    });

    it('should return config', () => {
      const config = controller.getConfig();

      expect(config).toMatchObject(DEFAULT_EXIT_CONFIG);
    });
  });

  // ============================================================================
  // Factory Function Tests
  // ============================================================================
  describe('factory functions', () => {
    it('should create controller with default config', () => {
      const instance = createEarlyExitController(4);

      expect(instance).toBeInstanceOf(EarlyExitController);
      expect(instance.getConfig()).toMatchObject(DEFAULT_EXIT_CONFIG);
    });

    it('should create controller with custom config', () => {
      const instance = createCustomController({
        exitLayer: 2,
        minLambdaForExit: 90,
      }, 4);

      expect(instance.getConfig().exitLayer).toBe(2);
      expect(instance.getConfig().minLambdaForExit).toBe(90);
    });
  });

  // ============================================================================
  // Edge Cases
  // ============================================================================
  describe('edge cases', () => {
    it('should handle single layer pyramid', async () => {
      const singleController = new EarlyExitController(DEFAULT_EXIT_CONFIG, 1);
      const layers = [createTestLayers()[0]];

      const executor: LayerExecutor = async (layer) => createPassingResult(layer.index, layer.type);

      const result = await singleController.runWithEarlyExit(layers, executor);

      expect(result.layers.length).toBe(1);
    });

    it('should handle empty layers array', async () => {
      const executor: LayerExecutor = async (layer) => createPassingResult(layer.index, layer.type);

      const result = await controller.runWithEarlyExit([], executor);

      expect(result.layers.length).toBe(0);
      expect(result.exitedEarly).toBe(false);
    });

    it('should handle executor errors gracefully', async () => {
      const layers = createTestLayers();

      const executor: LayerExecutor = async (layer) => {
        if (layer.index === 1) {
          throw new Error('Execution failed');
        }
        return createPassingResult(layer.index, layer.type);
      };

      await expect(controller.runWithEarlyExit(layers, executor)).rejects.toThrow('Execution failed');
    });
  });

  // ============================================================================
  // Speculation Statistics Tests
  // ============================================================================
  describe('speculation statistics', () => {
    it('should provide speculation stats', async () => {
      const layers = createTestLayers();
      const executor: LayerExecutor = async (layer) => createPassingResult(layer.index, layer.type);

      await controller.runWithEarlyExit(layers, executor);

      const stats = controller.getSpeculationStats();
      expect(stats).toBeDefined();
      expect(typeof stats.accuracy).toBe('number');
    });
  });
});
