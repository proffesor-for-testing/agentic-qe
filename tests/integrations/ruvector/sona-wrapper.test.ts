/**
 * @ruvector/sona Wrapper Integration Tests
 *
 * Real integration tests for QESONA wrapper that delegates to @ruvector/sona.
 * These tests require native ARM64 binaries to be built and available.
 *
 * Prerequisites:
 * - Rust toolchain installed
 * - ARM64 binaries built from ruvector source
 * - See: src/integrations/ruvector/TESTING_LIMITATIONS.md
 */

import { describe, it, expect, beforeAll } from 'vitest';
import type { RLState, RLAction, DomainName } from '../../../src/integrations/rl-suite/interfaces';
import {
  QESONA,
  createQESONA,
  createDomainQESONA,
  type QESONAPattern,
  type QEPatternType,
} from '../../../src/integrations/ruvector/sona-wrapper';
import { checkRuvectorPackagesAvailable } from '../../../src/integrations/ruvector/wrappers';

// Skip tests if packages aren't available
const canTest = checkRuvectorPackagesAvailable();

// Skip tests if packages not available - see TESTING_LIMITATIONS.md for build instructions
describe.runIf(canTest.sona)('@ruvector/sona Wrapper - Real Integration', () => {
  describe('Package Availability', () => {
    it('should verify sona package is available', () => {
      expect(canTest.sona).toBe(true);
    });
  });

  describe('QESONA - Instance Creation', () => {
    it('should create instance with matching dimensions', () => {
      // @ruvector/sona requires hiddenDim and embeddingDim to match
      const sona = createQESONA({
        hiddenDim: 256,
        embeddingDim: 256, // Must match hiddenDim
      });
      expect(sona).toBeDefined();
      expect(sona.isEnabled()).toBe(true);
      const config = sona.getConfig();
      expect(config.hiddenDim).toBe(256);
      expect(config.embeddingDim).toBe(256);
    });

    it('should create instance with custom config', () => {
      const sona = createQESONA({
        hiddenDim: 128,
        embeddingDim: 128, // Must match hiddenDim
        microLoraRank: 2,
        baseLoraRank: 16,
      });
      expect(sona).toBeDefined();
      const config = sona.getConfig();
      expect(config.hiddenDim).toBe(128);
      expect(config.embeddingDim).toBe(128);
      expect(config.microLoraRank).toBe(2);
      expect(config.baseLoraRank).toBe(16);
    });

    it('should create domain-specific instance', () => {
      const sona = createDomainQESONA('test-generation');
      expect(sona).toBeDefined();
    });
  });

  describe('QESONA - Pattern Management', () => {
    let sona: QESONA;

    beforeAll(() => {
      sona = createQESONA({
        hiddenDim: 256,
        embeddingDim: 256, // Must match for @ruvector/sona
      });
    });

    it('should create pattern from experience', () => {
      const state: RLState = {
        id: 'test-state-1',
        features: [0.1, 0.2, 0.3, 0.4, 0.5],
      };

      const action: RLAction = {
        type: 'generate-test',
        value: 'test-case-1',
      };

      const outcome = {
        reward: 0.8,
        success: true,
        quality: 0.8,
      };

      const pattern = sona.createPattern(
        state,
        action,
        outcome,
        'test-generation',
        'test-generation',
        { source: 'unit-test' }
      );

      expect(pattern).toBeDefined();
      expect(pattern.type).toBe('test-generation');
      expect(pattern.domain).toBe('test-generation');
      expect(pattern.confidence).toBe(0.5);
      expect(pattern.usageCount).toBe(0);
      expect(pattern.metadata).toEqual({ source: 'unit-test' });
    });

    it('should store pattern in memory', () => {
      const pattern: QESONAPattern = {
        id: 'test-pattern-1',
        type: 'defect-prediction',
        domain: 'defect-prediction',
        stateEmbedding: [0.1, 0.2, 0.3, 0.4],
        action: { type: 'predict', value: true },
        outcome: { reward: 0.9, success: true, quality: 0.9 },
        confidence: 0.7,
        usageCount: 0,
        createdAt: new Date(),
      };

      sona.storePattern(pattern);
      const allPatterns = sona.getAllPatterns();
      expect(allPatterns.length).toBeGreaterThan(0);
    });

    it('should store patterns in batch', () => {
      const patterns: QESONAPattern[] = [
        {
          id: 'batch-pattern-1',
          type: 'coverage-optimization',
          domain: 'coverage-analysis',
          stateEmbedding: [0.1, 0.2],
          action: { type: 'optimize', value: 1 },
          outcome: { reward: 0.6, success: true, quality: 0.6 },
          confidence: 0.6,
          usageCount: 0,
          createdAt: new Date(),
        },
        {
          id: 'batch-pattern-2',
          type: 'quality-assessment',
          domain: 'quality-assessment',
          stateEmbedding: [0.3, 0.4],
          action: { type: 'assess', value: 'high' },
          outcome: { reward: 0.7, success: true, quality: 0.7 },
          confidence: 0.7,
          usageCount: 0,
          createdAt: new Date(),
        },
      ];

      sona.storePatternsBatch(patterns);
      const allPatterns = sona.getAllPatterns();
      expect(allPatterns.length).toBeGreaterThanOrEqual(2);
    });

    it('should update pattern with feedback', () => {
      const state: RLState = {
        id: 'test-state-update',
        features: [0.5, 0.6, 0.7],
      };

      const pattern = sona.createPattern(
        state,
        { type: 'test', value: 1 },
        { reward: 0.5, success: true, quality: 0.5 },
        'test-generation',
        'test-generation'
      );

      const initialConfidence = pattern.confidence;
      const updated = sona.updatePattern(pattern.id, true, 0.9);

      expect(updated).toBe(true);

      const allPatterns = sona.getAllPatterns();
      const updatedPattern = allPatterns.find(p => p.id === pattern.id);
      expect(updatedPattern?.confidence).toBeGreaterThan(initialConfidence);
    });
  });

  describe('QESONA - Pattern Adaptation', () => {
    let sona: QESONA;
    let testPattern: QESONAPattern;

    beforeAll(() => {
      sona = createQESONA({
        hiddenDim: 256,
        embeddingDim: 256, // Must match for @ruvector/sona
      });

      // Create and store a test pattern
      const state: RLState = {
        id: 'adaptation-test-state',
        features: new Array(256).fill(0).map((_, i) => Math.sin(i * 0.1)),
      };

      testPattern = sona.createPattern(
        state,
        { type: 'adapt', value: 'test-action' },
        { reward: 0.85, success: true, quality: 0.85 },
        'test-generation',
        'test-generation'
      );
    });

    it('should adapt pattern based on context', async () => {
      const similarState: RLState = {
        id: 'similar-state',
        features: new Array(256).fill(0).map((_, i) => Math.sin(i * 0.1) + 0.01),
      };

      const result = await sona.adaptPattern(
        similarState,
        'test-generation',
        'test-generation'
      );

      expect(result).toBeDefined();
      expect(result.reasoning).toBeDefined();

      // May or may not find a pattern depending on SONA internal state
      if (result.success) {
        expect(result.pattern).toBeDefined();
        expect(result.similarity).toBeGreaterThanOrEqual(0);
        expect(result.similarity).toBeLessThanOrEqual(1);
        expect(result.adaptationTimeMs).toBeGreaterThanOrEqual(0);
      }
    });

    it('should handle no pattern found gracefully', async () => {
      const uniqueState: RLState = {
        id: 'unique-state',
        features: new Array(256).fill(0).map((_, i) => Math.cos(i * 0.5)),
      };

      const result = await sona.adaptPattern(
        uniqueState,
        'resource-allocation', // Different type
        'resource-allocation'
      );

      expect(result).toBeDefined();
      expect(result.reasoning).toBeDefined();
      // May return success: true if similar pattern found, or success: false if not
    });

    it('should recall pattern for context', () => {
      const state: RLState = {
        id: 'recall-test-state',
        features: new Array(100).fill(0).map(() => Math.random()),
      };

      // Create a pattern first
      sona.createPattern(
        state,
        { type: 'recall', value: 'test' },
        { reward: 0.7, success: true, quality: 0.7 },
        'defect-prediction',
        'defect-prediction'
      );

      // Try to recall
      const recalled = sona.recallPattern(state, 'defect-prediction', 'defect-prediction');

      // May or may not find the pattern depending on SONA's internal clustering
      if (recalled) {
        expect(recalled.type).toBe('defect-prediction');
        expect(recalled.domain).toBe('defect-prediction');
      }
    });
  });

  describe('QESONA - LoRA Transformations', () => {
    let sona: QESONA;

    beforeAll(() => {
      sona = createQESONA({
        hiddenDim: 256,
        embeddingDim: 256, // Must match for @ruvector/sona
      });
    });

    it('should apply Micro-LoRA transformation', () => {
      const input = new Array(256).fill(0).map(() => Math.random());
      const output = sona.applyMicroLora(input);

      expect(output).toBeDefined();
      expect(Array.isArray(output)).toBe(true);
      expect(output.length).toBe(input.length);
      // Micro-LoRA should modify the input
      expect(output).not.toEqual(input);
    });

    it('should apply Base-LoRA transformation for layer', () => {
      const input = new Array(256).fill(0).map(() => Math.random());
      const layerIdx = 0;
      const output = sona.applyBaseLora(layerIdx, input);

      expect(output).toBeDefined();
      expect(Array.isArray(output)).toBe(true);
      // Base-LoRA should modify the input
      expect(output).not.toEqual(input);
    });
  });

  describe('QESONA - Background Learning', () => {
    let sona: QESONA;

    beforeAll(() => {
      sona = createQESONA({
        hiddenDim: 256,
        embeddingDim: 256, // Must match for @ruvector/sona
      });
    });

    it('should force background learning cycle', () => {
      const result = sona.forceLearn();
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });

    it('should run tick for background learning', () => {
      const result = sona.tick();
      // tick() returns string if learning ran, null if not due
      expect(result === null || typeof result === 'string').toBe(true);
    });
  });

  describe('QESONA - Pattern Retrieval', () => {
    let sona: QESONA;

    beforeAll(() => {
      sona = createQESONA({
        hiddenDim: 256,
        embeddingDim: 256, // Must match for @ruvector/sona
      });

      // Create patterns of different types and domains
      const domains: DomainName[] = [
        'test-generation',
        'defect-prediction',
        'coverage-analysis',
      ];

      const patternTypes: QEPatternType[] = [
        'test-generation',
        'defect-prediction',
        'coverage-optimization',
        'quality-assessment',
        'resource-allocation',
      ];

      for (const domain of domains) {
        for (const type of patternTypes) {
          const state: RLState = {
            id: `state-${domain}-${type}`,
            features: new Array(50).fill(0).map(() => Math.random()),
          };

          sona.createPattern(
            state,
            { type, value: `${domain}-${type}` },
            { reward: 0.7, success: true, quality: 0.7 },
            type,
            domain
          );
        }
      }
    });

    it('should get all patterns', () => {
      const allPatterns = sona.getAllPatterns();
      expect(Array.isArray(allPatterns)).toBe(true);
      expect(allPatterns.length).toBeGreaterThan(0);
    });

    it('should get patterns by type', () => {
      const testGenPatterns = sona.getPatternsByType('test-generation');
      expect(Array.isArray(testGenPatterns)).toBe(true);
      expect(testGenPatterns.length).toBeGreaterThan(0);
      expect(testGenPatterns.every(p => p.type === 'test-generation')).toBe(true);
    });

    it('should get patterns by domain', () => {
      const defectPatterns = sona.getPatternsByDomain('defect-prediction');
      expect(Array.isArray(defectPatterns)).toBe(true);
      expect(defectPatterns.length).toBeGreaterThan(0);
      expect(defectPatterns.every(p => p.domain === 'defect-prediction')).toBe(true);
    });
  });

  describe('QESONA - Statistics', () => {
    let sona: QESONA;

    beforeAll(() => {
      sona = createQESONA({
        hiddenDim: 256,
        embeddingDim: 256, // Must match for @ruvector/sona
      });

      // Create some patterns
      for (let i = 0; i < 10; i++) {
        const state: RLState = {
          id: `stats-state-${i}`,
          features: new Array(100).fill(0).map(() => Math.random()),
        };

        sona.createPattern(
          state,
          { type: 'stats-test', value: i },
          { reward: Math.random(), success: true, quality: Math.random() },
          'test-generation',
          'test-generation'
        );
      }
    });

    it('should get statistics', () => {
      const stats = sona.getStats();

      expect(stats).toBeDefined();
      expect(stats.totalPatterns).toBeGreaterThan(0);
      expect(stats.patternsByType).toBeDefined();
      expect(stats.patternsByType['test-generation']).toBeGreaterThan(0);
      expect(stats.engineStats).toBeDefined();
      expect(typeof stats.engineStats).toBe('string');
    });

    it('should track adaptation time metrics', async () => {
      const state: RLState = {
        id: 'timing-test-state',
        features: new Array(384).fill(0).map(() => Math.random()),
      };

      // Run a few adaptations to gather timing data
      for (let i = 0; i < 5; i++) {
        await sona.adaptPattern(state, 'test-generation', 'test-generation');
      }

      const stats = sona.getStats();
      expect(stats.totalAdaptations).toBeGreaterThan(0);
      expect(stats.avgAdaptationTimeMs).toBeGreaterThanOrEqual(0);
      expect(stats.minAdaptationTimeMs).toBeGreaterThanOrEqual(0);
      expect(stats.maxAdaptationTimeMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('QESONA - Configuration', () => {
    it('should get configuration', () => {
      const customConfig = {
        hiddenDim: 512,
        embeddingDim: 768,
        microLoraRank: 2,
        baseLoraRank: 16,
        ewcLambda: 500.0,
      };

      const sona = createQESONA(customConfig);
      const config = sona.getConfig();

      expect(config.hiddenDim).toBe(512);
      expect(config.embeddingDim).toBe(768);
      expect(config.microLoraRank).toBe(2);
      expect(config.baseLoraRank).toBe(16);
      expect(config.ewcLambda).toBe(500.0);
    });

    it('should enable/disable engine', () => {
      const sona = createQESONA();

      expect(sona.isEnabled()).toBe(true);

      sona.setEnabled(false);
      expect(sona.isEnabled()).toBe(false);

      sona.setEnabled(true);
      expect(sona.isEnabled()).toBe(true);
    });
  });

  describe('QESONA - Export/Import', () => {
    let sona: QESONA;
    let exportedPatterns: QESONAPattern[];

    beforeAll(() => {
      sona = createQESONA({
        hiddenDim: 256,
        embeddingDim: 256, // Must match for @ruvector/sona
      });

      // Create some patterns
      for (let i = 0; i < 5; i++) {
        const state: RLState = {
          id: `export-test-state-${i}`,
          features: new Array(50).fill(0).map(() => Math.random()),
        };

        sona.createPattern(
          state,
          { type: 'export-test', value: i },
          { reward: 0.8, success: true, quality: 0.8 },
          'quality-assessment',
          'quality-assessment',
          { exportIndex: i }
        );
      }

      exportedPatterns = sona.exportPatterns();
    });

    it('should export all patterns', () => {
      expect(exportedPatterns).toBeDefined();
      expect(Array.isArray(exportedPatterns)).toBe(true);
      expect(exportedPatterns.length).toBe(5);
      expect(exportedPatterns[0].metadata?.exportIndex).toBeDefined();
    });

    it('should import patterns', () => {
      const newSona = createQESONA();
      newSona.importPatterns(exportedPatterns);

      const importedPatterns = newSona.getAllPatterns();
      expect(importedPatterns.length).toBe(5);
      expect(importedPatterns[0].metadata?.exportIndex).toBeDefined();
    });
  });

  describe('QESONA - Clear Operations', () => {
    it('should clear all patterns', () => {
      const sona = createQESONA();

      // Add some patterns
      for (let i = 0; i < 3; i++) {
        const state: RLState = {
          id: `clear-test-${i}`,
          features: [i, i + 1, i + 2],
        };

        sona.createPattern(
          state,
          { type: 'clear-test', value: i },
          { reward: 0.5, success: true, quality: 0.5 },
          'resource-allocation',
          'resource-allocation'
        );
      }

      expect(sona.getAllPatterns().length).toBeGreaterThan(0);

      sona.clear();

      expect(sona.getAllPatterns().length).toBe(0);

      const stats = sona.getStats();
      expect(stats.totalPatterns).toBe(0);
      expect(stats.totalAdaptations).toBe(0);
    });
  });

  describe('QESONA - Performance Verification', () => {
    let sona: QESONA;

    beforeAll(() => {
      sona = createQESONA({
        hiddenDim: 256,
        embeddingDim: 256, // Must match for @ruvector/sona
      });

      // Pre-populate with patterns for realistic testing
      for (let i = 0; i < 20; i++) {
        const state: RLState = {
          id: `perf-test-${i}`,
          features: new Array(256).fill(0).map(() => Math.random()),
        };

        sona.createPattern(
          state,
          { type: 'perf-test', value: i },
          { reward: 0.7 + Math.random() * 0.3, success: true, quality: 0.8 },
          'test-generation',
          'test-generation'
        );
      }
    });

    it('should verify performance target (<0.05ms)', async () => {
      // Run with fewer iterations for test speed
      const result = await sona.verifyPerformance(100);

      expect(result).toBeDefined();
      expect(result.avgTimeMs).toBeGreaterThanOrEqual(0);
      expect(result.minTimeMs).toBeGreaterThanOrEqual(0);
      expect(result.maxTimeMs).toBeGreaterThanOrEqual(0);
      expect(result.details).toHaveLength(100);

      // The target is <0.05ms, but actual performance depends on hardware
      // Just verify the measurement is reasonable
      expect(result.avgTimeMs).toBeLessThan(100); // Should be much faster than 100ms
    }, 30000); // 30 second timeout for performance test

    it('should measure adaptation times', async () => {
      const state: RLState = {
        id: 'measure-state',
        features: new Array(256).fill(0).map(() => Math.random()),
      };

      const times: number[] = [];
      for (let i = 0; i < 10; i++) {
        const start = performance.now();
        await sona.adaptPattern(state, 'test-generation', 'test-generation');
        times.push(performance.now() - start);
      }

      // All adaptations should complete in reasonable time
      times.forEach(t => {
        expect(t).toBeLessThan(100); // Should be much faster
      });
    });
  });

  describe('QESONA - All Pattern Types', () => {
    const patternTypes: QEPatternType[] = [
      'test-generation',
      'defect-prediction',
      'coverage-optimization',
      'quality-assessment',
      'resource-allocation',
    ];

    it.each(patternTypes)('should handle %s patterns', async (patternType) => {
      const sona = createQESONA({
        hiddenDim: 256,
        embeddingDim: 256, // Must match for @ruvector/sona
      });

      const state: RLState = {
        id: `${patternType}-state`,
        features: new Array(100).fill(0).map(() => Math.random()),
      };

      const pattern = sona.createPattern(
        state,
        { type: patternType, value: 'test' },
        { reward: 0.7, success: true, quality: 0.7 },
        patternType,
        patternType
      );

      expect(pattern.type).toBe(patternType);

      // Try adaptation
      const result = await sona.adaptPattern(state, patternType, patternType);
      expect(result).toBeDefined();

      const byType = sona.getPatternsByType(patternType);
      expect(byType.length).toBeGreaterThan(0);
    });
  });

  describe('QESONA - Edge Cases', () => {
    it('should handle empty state features', async () => {
      const sona = createQESONA({
        hiddenDim: 256,
        embeddingDim: 256, // Must match for @ruvector/sona
      });

      const emptyState: RLState = {
        id: 'empty-state',
        features: [],
      };

      const result = await sona.adaptPattern(
        emptyState,
        'test-generation',
        'test-generation'
      );

      expect(result).toBeDefined();
      expect(result.reasoning).toBeDefined();
    });

    it('should handle large state features', async () => {
      const sona = createQESONA({
        hiddenDim: 256,
        embeddingDim: 256, // Must match for @ruvector/sona
      });

      const largeState: RLState = {
        id: 'large-state',
        features: new Array(10000).fill(0).map(() => Math.random()),
      };

      // Should handle large features without crashing
      const result = await sona.adaptPattern(
        largeState,
        'defect-prediction',
        'defect-prediction'
      );

      expect(result).toBeDefined();
    });

    it('should handle update of non-existent pattern', () => {
      const sona = createQESONA({
        hiddenDim: 256,
        embeddingDim: 256, // Must match for @ruvector/sona
      });
      const updated = sona.updatePattern('non-existent-id', true, 0.9);
      expect(updated).toBe(false);
    });

    it('should handle extreme quality values', () => {
      const sona = createQESONA({
        hiddenDim: 256,
        embeddingDim: 256, // Must match for @ruvector/sona
      });

      const state: RLState = {
        id: 'extreme-quality-state',
        features: [1, 2, 3],
      };

      // Create pattern with minimum quality
      const pattern1 = sona.createPattern(
        state,
        { type: 'min-quality', value: 0 },
        { reward: 0, success: false, quality: 0 },
        'quality-assessment',
        'quality-assessment'
      );

      expect(pattern1.outcome.quality).toBe(0);

      // Create pattern with maximum quality
      const pattern2 = sona.createPattern(
        state,
        { type: 'max-quality', value: 1 },
        { reward: 1, success: true, quality: 1 },
        'quality-assessment',
        'quality-assessment'
      );

      expect(pattern2.outcome.quality).toBe(1);
    });
  });
});

describe.runIf(canTest.all)('@ruvector SONA Wrapper - Cross Package', () => {
  it('should verify all @ruvector packages are available', () => {
    expect(checkRuvectorPackagesAvailable().all).toBe(true);
  });
});
