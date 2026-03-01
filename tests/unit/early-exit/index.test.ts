/**
 * Integration tests for Early Exit Testing Module
 * ADR-033: Lambda-stability decisions with speculative execution
 */

import { describe, it, expect } from 'vitest';
import {
  // Types
  DEFAULT_EXIT_CONFIG,
  AGGRESSIVE_EXIT_CONFIG,
  CONSERVATIVE_EXIT_CONFIG,
  QualityFlags,
  // Quality Signal
  calculateQualitySignal,
  calculateLambdaStability,
  calculateConfidence,
  createQualitySignal,
  // Early Exit Decision
  CoherenceEarlyExit,
  createEarlyExit,
  createCustomEarlyExit,
  // Speculative Executor
  SpeculativeExecutor,
  createSpeculativeExecutor,
  // Controller
  EarlyExitController,
  createEarlyExitController,
  createCustomController,
} from '../../../src/early-exit';

describe('Early Exit Module Exports', () => {
  describe('configuration presets', () => {
    it('should export DEFAULT_EXIT_CONFIG', () => {
      expect(DEFAULT_EXIT_CONFIG).toBeDefined();
      expect(DEFAULT_EXIT_CONFIG.exitLayer).toBe(1);
      expect(DEFAULT_EXIT_CONFIG.minLambdaForExit).toBe(80);
    });

    it('should export AGGRESSIVE_EXIT_CONFIG', () => {
      expect(AGGRESSIVE_EXIT_CONFIG).toBeDefined();
      expect(AGGRESSIVE_EXIT_CONFIG.exitLayer).toBe(0);
      expect(AGGRESSIVE_EXIT_CONFIG.minLambdaForExit).toBe(60);
    });

    it('should export CONSERVATIVE_EXIT_CONFIG', () => {
      expect(CONSERVATIVE_EXIT_CONFIG).toBeDefined();
      expect(CONSERVATIVE_EXIT_CONFIG.exitLayer).toBe(2);
      expect(CONSERVATIVE_EXIT_CONFIG.minLambdaForExit).toBe(95);
    });
  });

  describe('quality flags', () => {
    it('should export QualityFlags enum', () => {
      expect(QualityFlags.NONE).toBe(0);
      expect(QualityFlags.CRITICAL_FAILURE).toBeDefined();
      expect(QualityFlags.FORCE_CONTINUE).toBeDefined();
    });
  });

  describe('quality signal functions', () => {
    it('should export calculateQualitySignal', () => {
      expect(typeof calculateQualitySignal).toBe('function');

      const signal = calculateQualitySignal({
        layerIndex: 0,
        layerType: 'unit',
        passRate: 0.95,
        coverage: 0.85,
        flakyRatio: 0.02,
        totalTests: 100,
        passedTests: 95,
        failedTests: 3,
        skippedTests: 2,
        duration: 1000,
      });

      expect(signal.lambda).toBeGreaterThan(0);
    });

    it('should export calculateLambdaStability', () => {
      expect(typeof calculateLambdaStability).toBe('function');
    });

    it('should export calculateConfidence', () => {
      expect(typeof calculateConfidence).toBe('function');
    });

    it('should export createQualitySignal', () => {
      expect(typeof createQualitySignal).toBe('function');

      const signal = createQualitySignal(0.95, 0.85, 0.02);
      expect(signal.lambda).toBeGreaterThan(0);
    });
  });

  describe('early exit decision', () => {
    it('should export CoherenceEarlyExit class', () => {
      expect(CoherenceEarlyExit).toBeDefined();

      const instance = new CoherenceEarlyExit(DEFAULT_EXIT_CONFIG, 4);
      expect(instance).toBeInstanceOf(CoherenceEarlyExit);
    });

    it('should export createEarlyExit factory', () => {
      expect(typeof createEarlyExit).toBe('function');

      const instance = createEarlyExit(4);
      expect(instance).toBeInstanceOf(CoherenceEarlyExit);
    });

    it('should export createCustomEarlyExit factory', () => {
      expect(typeof createCustomEarlyExit).toBe('function');

      const instance = createCustomEarlyExit({ exitLayer: 2 }, 4);
      expect(instance.getConfig().exitLayer).toBe(2);
    });
  });

  describe('speculative executor', () => {
    it('should export SpeculativeExecutor class', () => {
      expect(SpeculativeExecutor).toBeDefined();

      const instance = new SpeculativeExecutor(DEFAULT_EXIT_CONFIG);
      expect(instance).toBeInstanceOf(SpeculativeExecutor);
    });

    it('should export createSpeculativeExecutor factory', () => {
      expect(typeof createSpeculativeExecutor).toBe('function');

      const instance = createSpeculativeExecutor();
      expect(instance).toBeInstanceOf(SpeculativeExecutor);
    });
  });

  describe('early exit controller', () => {
    it('should export EarlyExitController class', () => {
      expect(EarlyExitController).toBeDefined();

      const instance = new EarlyExitController(DEFAULT_EXIT_CONFIG, 4);
      expect(instance).toBeInstanceOf(EarlyExitController);
    });

    it('should export createEarlyExitController factory', () => {
      expect(typeof createEarlyExitController).toBe('function');

      const instance = createEarlyExitController(4);
      expect(instance).toBeInstanceOf(EarlyExitController);
    });

    it('should export createCustomController factory', () => {
      expect(typeof createCustomController).toBe('function');

      const instance = createCustomController({ exitLayer: 2 }, 4);
      expect(instance.getConfig().exitLayer).toBe(2);
    });
  });

  describe('integration: full early exit workflow', () => {
    it('should run a complete early exit workflow', async () => {
      // Create controller
      const controller = createEarlyExitController(4);

      // Define test layers
      const layers = [
        { index: 0, type: 'unit' as const, name: 'Unit', testFiles: ['unit.test.ts'] },
        { index: 1, type: 'integration' as const, name: 'Integration', testFiles: ['int.test.ts'] },
        { index: 2, type: 'e2e' as const, name: 'E2E', testFiles: ['e2e.test.ts'] },
        { index: 3, type: 'performance' as const, name: 'Perf', testFiles: ['perf.test.ts'] },
      ];

      // Mock executor returning high-quality results
      const executor = async (layer: typeof layers[0]) => ({
        layerIndex: layer.index,
        layerType: layer.type,
        passRate: 0.98,
        coverage: 0.9,
        flakyRatio: 0.01,
        totalTests: 100,
        passedTests: 98,
        failedTests: 1,
        skippedTests: 1,
        duration: 1000,
      });

      // Run with early exit
      const result = await controller.runWithEarlyExit(layers, executor);

      // Verify result structure
      expect(result).toMatchObject({
        layers: expect.any(Array),
        exitedEarly: expect.any(Boolean),
        exitLayer: expect.any(Number),
        exitReason: expect.any(String),
        confidence: expect.any(Number),
        speculations: expect.any(Array),
        skippedLayers: expect.any(Number),
        totalDuration: expect.any(Number),
        computeSavings: expect.any(Number),
        finalSignal: expect.any(Object),
        decision: expect.any(Object),
      });

      // If exited early, validate savings
      if (result.exitedEarly) {
        expect(result.skippedLayers).toBeGreaterThan(0);
        expect(result.confidence).toBeGreaterThan(0.8);
      }
    });

    it('should track metrics across multiple runs', async () => {
      const controller = createEarlyExitController(4);
      const layers = [
        { index: 0, type: 'unit' as const, name: 'Unit', testFiles: ['unit.test.ts'] },
        { index: 1, type: 'integration' as const, name: 'Integration', testFiles: ['int.test.ts'] },
      ];

      const goodExecutor = async (layer: typeof layers[0]) => ({
        layerIndex: layer.index,
        layerType: layer.type,
        passRate: 0.98,
        coverage: 0.9,
        flakyRatio: 0.01,
        totalTests: 100,
        passedTests: 98,
        failedTests: 1,
        skippedTests: 1,
        duration: 1000,
      });

      const badExecutor = async (layer: typeof layers[0]) => ({
        layerIndex: layer.index,
        layerType: layer.type,
        passRate: 0.6,
        coverage: 0.5,
        flakyRatio: 0.15,
        totalTests: 100,
        passedTests: 60,
        failedTests: 35,
        skippedTests: 5,
        duration: 2000,
      });

      // Run both good and bad executions
      await controller.runWithEarlyExit(layers, goodExecutor);
      await controller.runWithEarlyExit(layers, badExecutor);

      const metrics = controller.getMetrics();

      expect(metrics.totalExecutions).toBe(2);
      expect(metrics.earlyExitRate).toBeGreaterThanOrEqual(0);
      expect(metrics.earlyExitRate).toBeLessThanOrEqual(1);
    });
  });
});
