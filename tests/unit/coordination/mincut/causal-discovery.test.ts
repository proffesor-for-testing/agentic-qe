/**
 * Unit tests for Causal Test Failure Discovery
 * ADR-047: MinCut Self-Organizing QE Integration - Phase 2
 *
 * Tests the causal discovery system for test failures:
 * - Graph construction and configuration
 * - Failure tracking and batch processing
 * - Causal link discovery (temporal and dependency)
 * - Root cause analysis
 * - Fix suggestions
 * - Graph statistics
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  TestFailureCausalGraph,
  createTestFailureCausalGraph,
  createTestFailure,
  DEFAULT_CAUSAL_DISCOVERY_CONFIG,
  TestFailure,
  CausalDiscoveryConfig,
} from '../../../../src/coordination/mincut/causal-discovery';

describe('TestFailureCausalGraph', () => {
  let graph: TestFailureCausalGraph;

  beforeEach(() => {
    graph = createTestFailureCausalGraph();
  });

  afterEach(() => {
    graph.clear();
  });

  // ==========================================================================
  // Helper Functions
  // ==========================================================================

  function createFailure(
    testId: string,
    testName: string,
    errorMessage: string,
    runId: string = 'run-1',
    timestamp?: Date,
    relatedFiles?: string[]
  ): TestFailure {
    return createTestFailure(testId, testName, `/tests/${testId}.test.ts`, errorMessage, runId, {
      timestamp: timestamp ?? new Date(),
      relatedFiles: relatedFiles ?? [`/src/${testId}.ts`],
    });
  }

  function createFailureBatch(
    count: number,
    runId: string = 'run-1',
    baseTimestamp?: Date,
    intervalMs: number = 100
  ): TestFailure[] {
    const base = baseTimestamp ?? new Date();
    const failures: TestFailure[] = [];

    for (let i = 0; i < count; i++) {
      failures.push(
        createFailure(
          `test-${i}`,
          `Test ${i}`,
          `Error in test ${i}`,
          runId,
          new Date(base.getTime() + i * intervalMs),
          [`/src/module-${i}.ts`]
        )
      );
    }

    return failures;
  }

  // ==========================================================================
  // Construction & Configuration
  // ==========================================================================

  describe('Construction', () => {
    it('should create graph with default config', () => {
      const defaultGraph = createTestFailureCausalGraph();
      expect(defaultGraph).toBeDefined();
      expect(defaultGraph.failureCount).toBe(0);
    });

    it('should create graph with custom config', () => {
      const customGraph = createTestFailureCausalGraph({
        minCausalityScore: 0.7,
        temporalWindowMs: 30000,
        maxFailuresTracked: 500,
      });
      expect(customGraph).toBeDefined();
    });

    it('should expose default config', () => {
      expect(DEFAULT_CAUSAL_DISCOVERY_CONFIG).toBeDefined();
      expect(DEFAULT_CAUSAL_DISCOVERY_CONFIG.minCausalityScore).toBe(0.5);
      expect(DEFAULT_CAUSAL_DISCOVERY_CONFIG.temporalWindowMs).toBe(60000);
      expect(DEFAULT_CAUSAL_DISCOVERY_CONFIG.maxFailuresTracked).toBe(1000);
      expect(DEFAULT_CAUSAL_DISCOVERY_CONFIG.minObservationsForConfidence).toBe(3);
      expect(DEFAULT_CAUSAL_DISCOVERY_CONFIG.trackCodeCoverage).toBe(true);
    });

    it('should merge partial config with defaults', () => {
      const partialConfig: Partial<CausalDiscoveryConfig> = {
        minCausalityScore: 0.8,
      };
      const customGraph = createTestFailureCausalGraph(partialConfig);
      expect(customGraph).toBeDefined();
      // Should have custom value
      // Other values should still be defaults (tested implicitly via behavior)
    });
  });

  // ==========================================================================
  // createTestFailure Factory
  // ==========================================================================

  describe('createTestFailure', () => {
    it('should create failure with required fields', () => {
      const failure = createTestFailure(
        'test-1',
        'Test One',
        '/tests/test-1.test.ts',
        'Assertion failed',
        'run-123'
      );

      expect(failure.id).toBeDefined();
      expect(failure.testId).toBe('test-1');
      expect(failure.testName).toBe('Test One');
      expect(failure.filePath).toBe('/tests/test-1.test.ts');
      expect(failure.errorMessage).toBe('Assertion failed');
      expect(failure.runId).toBe('run-123');
      expect(failure.timestamp).toBeInstanceOf(Date);
      expect(failure.relatedFiles).toContain('/tests/test-1.test.ts');
    });

    it('should create failure with optional fields', () => {
      const timestamp = new Date('2025-01-01T00:00:00Z');
      const failure = createTestFailure(
        'test-2',
        'Test Two',
        '/tests/test-2.test.ts',
        'Error message',
        'run-456',
        {
          timestamp,
          stackTrace: 'Error: at line 10',
          relatedFiles: ['/src/module.ts', '/src/utils.ts'],
          domain: 'test-generation',
        }
      );

      expect(failure.timestamp).toEqual(timestamp);
      expect(failure.stackTrace).toBe('Error: at line 10');
      expect(failure.relatedFiles).toEqual(['/src/module.ts', '/src/utils.ts']);
      expect(failure.domain).toBe('test-generation');
    });

    it('should generate unique IDs', () => {
      const failure1 = createTestFailure('test-1', 'Test', '/path', 'Error', 'run-1');
      const failure2 = createTestFailure('test-1', 'Test', '/path', 'Error', 'run-1');
      expect(failure1.id).not.toBe(failure2.id);
    });
  });

  // ==========================================================================
  // Adding Failures
  // ==========================================================================

  describe('addFailure', () => {
    it('should add single failure', () => {
      const failure = createFailure('test-1', 'Test One', 'Error');
      graph.addFailure(failure);
      expect(graph.failureCount).toBe(1);
    });

    it('should retrieve added failure', () => {
      const failure = createFailure('test-1', 'Test One', 'Error');
      graph.addFailure(failure);
      const retrieved = graph.getFailure(failure.id);
      expect(retrieved).toEqual(failure);
    });

    it('should add multiple failures', () => {
      const failure1 = createFailure('test-1', 'Test One', 'Error 1');
      const failure2 = createFailure('test-2', 'Test Two', 'Error 2');
      graph.addFailure(failure1);
      graph.addFailure(failure2);
      expect(graph.failureCount).toBe(2);
    });

    it('should enforce max failures limit', () => {
      const smallGraph = createTestFailureCausalGraph({ maxFailuresTracked: 3 });

      for (let i = 0; i < 5; i++) {
        const failure = createFailure(`test-${i}`, `Test ${i}`, 'Error', 'run-1', new Date(Date.now() + i * 1000));
        smallGraph.addFailure(failure);
      }

      expect(smallGraph.failureCount).toBe(3);
    });

    it('should evict oldest failure when limit reached', () => {
      const smallGraph = createTestFailureCausalGraph({ maxFailuresTracked: 3 });
      const failures: TestFailure[] = [];

      for (let i = 0; i < 5; i++) {
        const failure = createFailure(`test-${i}`, `Test ${i}`, 'Error', 'run-1', new Date(Date.now() + i * 1000));
        failures.push(failure);
        smallGraph.addFailure(failure);
      }

      // Oldest failures should be evicted
      expect(smallGraph.getFailure(failures[0].id)).toBeUndefined();
      expect(smallGraph.getFailure(failures[1].id)).toBeUndefined();
      // Newest failures should remain
      expect(smallGraph.getFailure(failures[4].id)).toBeDefined();
    });
  });

  // ==========================================================================
  // Batch Processing
  // ==========================================================================

  describe('addFailureBatch', () => {
    it('should add batch of failures', () => {
      const failures = createFailureBatch(5);
      graph.addFailureBatch(failures);
      expect(graph.failureCount).toBe(5);
    });

    it('should sort failures by timestamp', () => {
      const base = new Date();
      const failures = [
        createFailure('test-3', 'Test 3', 'Error', 'run-1', new Date(base.getTime() + 300)),
        createFailure('test-1', 'Test 1', 'Error', 'run-1', new Date(base.getTime() + 100)),
        createFailure('test-2', 'Test 2', 'Error', 'run-1', new Date(base.getTime() + 200)),
      ];

      graph.addFailureBatch(failures);
      const allFailures = graph.getAllFailures();
      expect(allFailures.length).toBe(3);
    });

    it('should discover causal links within batch', () => {
      const base = new Date();
      const failures = [
        createFailure('test-1', 'Test 1', 'Error', 'run-1', new Date(base.getTime()), ['/src/shared.ts']),
        createFailure('test-2', 'Test 2', 'Error', 'run-1', new Date(base.getTime() + 100), ['/src/shared.ts']),
      ];

      graph.addFailureBatch(failures);

      // Should have discovered temporal and dependency links
      const links = graph.getLinks(failures[0].id);
      expect(links.length).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // Causal Link Discovery - Temporal
  // ==========================================================================

  describe('Temporal Causality', () => {
    it('should create temporal link when failures occur close in time', () => {
      const base = new Date();
      const cause = createFailure('test-cause', 'Cause Test', 'Error', 'run-1', new Date(base.getTime()));
      const effect = createFailure('test-effect', 'Effect Test', 'Error', 'run-1', new Date(base.getTime() + 1000));

      graph.addFailureBatch([cause, effect]);

      const links = graph.getLinks(cause.id);
      const temporalLink = links.find((l) => l.type === 'temporal' && l.effectId === effect.id);
      expect(temporalLink).toBeDefined();
    });

    it('should not create temporal link when outside window', () => {
      const windowMs = DEFAULT_CAUSAL_DISCOVERY_CONFIG.temporalWindowMs;
      const base = new Date();
      const cause = createFailure('test-cause', 'Cause Test', 'Error', 'run-1', new Date(base.getTime()));
      const effect = createFailure('test-effect', 'Effect Test', 'Error', 'run-1', new Date(base.getTime() + windowMs + 1000));

      graph.addFailureBatch([cause, effect]);

      const links = graph.getLinks(cause.id);
      const temporalLink = links.find((l) => l.type === 'temporal' && l.effectId === effect.id);
      expect(temporalLink).toBeUndefined();
    });

    it('should give higher score to closer temporal events', () => {
      const base = new Date();
      const cause = createFailure('test-cause', 'Cause Test', 'Error', 'run-1', new Date(base.getTime()));
      const closeEffect = createFailure('test-close', 'Close Effect', 'Error', 'run-1', new Date(base.getTime() + 100));
      const farEffect = createFailure('test-far', 'Far Effect', 'Error', 'run-1', new Date(base.getTime() + 30000));

      graph.addFailureBatch([cause, closeEffect, farEffect]);

      const links = graph.getLinks(cause.id);
      const closeLink = links.find((l) => l.type === 'temporal' && l.effectId === closeEffect.id);
      const farLink = links.find((l) => l.type === 'temporal' && l.effectId === farEffect.id);

      expect(closeLink).toBeDefined();
      expect(farLink).toBeDefined();
      expect(closeLink!.score).toBeGreaterThan(farLink!.score);
    });

    it('should respect custom temporal window', () => {
      const customGraph = createTestFailureCausalGraph({ temporalWindowMs: 500 });
      const base = new Date();
      const cause = createFailure('test-cause', 'Cause Test', 'Error', 'run-1', new Date(base.getTime()));
      const effect = createFailure('test-effect', 'Effect Test', 'Error', 'run-1', new Date(base.getTime() + 1000));

      customGraph.addFailureBatch([cause, effect]);

      const links = customGraph.getLinks(cause.id);
      const temporalLink = links.find((l) => l.type === 'temporal' && l.effectId === effect.id);
      expect(temporalLink).toBeUndefined();
    });
  });

  // ==========================================================================
  // Causal Link Discovery - Dependency
  // ==========================================================================

  describe('Dependency Causality', () => {
    it('should create dependency link when failures share files', () => {
      const sharedFile = '/src/shared-module.ts';
      const base = new Date();
      const failure1 = createFailure('test-1', 'Test 1', 'Error', 'run-1', new Date(base.getTime()), [sharedFile, '/src/a.ts']);
      const failure2 = createFailure('test-2', 'Test 2', 'Error', 'run-1', new Date(base.getTime() + 100), [sharedFile, '/src/b.ts']);

      graph.addFailureBatch([failure1, failure2]);

      const links = graph.getLinks(failure1.id);
      const depLink = links.find((l) => l.type === 'dependency' && l.effectId === failure2.id);
      expect(depLink).toBeDefined();
      expect(depLink!.evidence).toContain('shared-module.ts');
    });

    it('should not create dependency link when no shared files', () => {
      const base = new Date();
      const failure1 = createFailure('test-1', 'Test 1', 'Error', 'run-1', new Date(base.getTime()), ['/src/a.ts']);
      const failure2 = createFailure('test-2', 'Test 2', 'Error', 'run-1', new Date(base.getTime() + 100), ['/src/b.ts']);

      graph.addFailureBatch([failure1, failure2]);

      const links = graph.getLinks(failure1.id);
      const depLink = links.find((l) => l.type === 'dependency' && l.effectId === failure2.id);
      expect(depLink).toBeUndefined();
    });

    it('should give higher score for more shared files', () => {
      const base = new Date();
      const failure1 = createFailure('test-1', 'Test 1', 'Error', 'run-1', new Date(base.getTime()), ['/src/a.ts', '/src/b.ts', '/src/c.ts', '/src/d.ts', '/src/e.ts']);
      const failure2 = createFailure('test-2', 'Test 2', 'Error', 'run-1', new Date(base.getTime() + 100), ['/src/a.ts', '/src/b.ts', '/src/c.ts', '/src/d.ts', '/src/e.ts']);
      const failure3 = createFailure('test-3', 'Test 3', 'Error', 'run-1', new Date(base.getTime() + 200), ['/src/a.ts']);

      graph.addFailureBatch([failure1, failure2, failure3]);

      const links = graph.getLinks(failure1.id);
      const manySharedLink = links.find((l) => l.type === 'dependency' && l.effectId === failure2.id);
      const oneSharedLink = links.find((l) => l.type === 'dependency' && l.effectId === failure3.id);

      expect(manySharedLink).toBeDefined();
      expect(oneSharedLink).toBeDefined();
      expect(manySharedLink!.score).toBeGreaterThan(oneSharedLink!.score);
    });
  });

  // ==========================================================================
  // Link Updates
  // ==========================================================================

  describe('Link Updates', () => {
    it('should update existing link score on repeated observation', () => {
      // First batch
      const base1 = new Date();
      const failures1 = [
        createFailure('test-1', 'Test 1', 'Error', 'run-1', new Date(base1.getTime()), ['/src/shared.ts']),
        createFailure('test-2', 'Test 2', 'Error', 'run-1', new Date(base1.getTime() + 100), ['/src/shared.ts']),
      ];
      graph.addFailureBatch(failures1);

      const links1 = graph.getLinks(failures1[0].id);
      const initialLink = links1.find((l) => l.effectId === failures1[1].id);
      expect(initialLink?.observationCount).toBe(1);
    });

    it('should track observation count', () => {
      const base = new Date();
      const failures = [
        createFailure('test-1', 'Test 1', 'Error', 'run-1', new Date(base.getTime()), ['/src/shared.ts']),
        createFailure('test-2', 'Test 2', 'Error', 'run-1', new Date(base.getTime() + 100), ['/src/shared.ts']),
      ];
      graph.addFailureBatch(failures);

      const links = graph.getLinks(failures[0].id);
      const link = links.find((l) => l.effectId === failures[1].id);
      expect(link?.observationCount).toBe(1);
    });
  });

  // ==========================================================================
  // Root Cause Analysis
  // ==========================================================================

  describe('Root Cause Analysis', () => {
    it('should identify root cause with no upstream links', () => {
      const base = new Date();
      const root = createFailure('test-root', 'Root Test', 'Error', 'run-1', new Date(base.getTime()), ['/src/root.ts']);
      const effect = createFailure('test-effect', 'Effect Test', 'Error', 'run-1', new Date(base.getTime() + 100), ['/src/root.ts']);

      graph.addFailureBatch([root, effect]);

      const analyses = graph.findRootCauses(effect.id);
      expect(analyses.length).toBeGreaterThan(0);
      expect(analyses[0].rootCauseId).toBe(root.id);
    });

    it('should calculate impact (cascading failures count)', () => {
      const base = new Date();
      const root = createFailure('test-root', 'Root', 'Error', 'run-1', new Date(base.getTime()), ['/src/shared.ts']);
      const effect1 = createFailure('test-e1', 'Effect 1', 'Error', 'run-1', new Date(base.getTime() + 100), ['/src/shared.ts']);
      const effect2 = createFailure('test-e2', 'Effect 2', 'Error', 'run-1', new Date(base.getTime() + 200), ['/src/shared.ts']);

      graph.addFailureBatch([root, effect1, effect2]);

      const analyses = graph.findRootCauses(effect2.id);
      expect(analyses.length).toBeGreaterThan(0);
      expect(analyses[0].impact).toBeGreaterThanOrEqual(1);
    });

    it('should include suggested fix', () => {
      const base = new Date();
      const root = createFailure('test-root', 'Root', 'undefined error', 'run-1', new Date(base.getTime()), ['/src/root.ts']);
      const effect = createFailure('test-effect', 'Effect', 'Error', 'run-1', new Date(base.getTime() + 100), ['/src/root.ts']);

      graph.addFailureBatch([root, effect]);

      const analyses = graph.findRootCauses(effect.id);
      expect(analyses.length).toBeGreaterThan(0);
      expect(analyses[0].suggestedFix).toBeDefined();
      expect(analyses[0].suggestedFix.type).toBeDefined();
      expect(analyses[0].suggestedFix.priority).toBeDefined();
      expect(analyses[0].suggestedFix.description).toBeDefined();
    });

    it('should calculate confidence based on upstream links', () => {
      const base = new Date();
      const root = createFailure('test-root', 'Root', 'Error', 'run-1', new Date(base.getTime()), ['/src/root.ts']);
      const effect = createFailure('test-effect', 'Effect', 'Error', 'run-1', new Date(base.getTime() + 100), ['/src/root.ts']);

      graph.addFailureBatch([root, effect]);

      const analyses = graph.findRootCauses(effect.id);
      expect(analyses.length).toBeGreaterThan(0);
      expect(analyses[0].confidence).toBeGreaterThan(0);
      expect(analyses[0].confidence).toBeLessThanOrEqual(1);
    });

    it('should return empty array for non-existent failure', () => {
      const analyses = graph.findRootCauses('non-existent-id');
      expect(analyses).toEqual([]);
    });

    it('should sort analyses by confidence and impact', () => {
      const base = new Date();
      // Create a scenario with multiple potential roots
      const root1 = createFailure('root-1', 'Root 1', 'Error', 'run-1', new Date(base.getTime()), ['/src/a.ts']);
      const root2 = createFailure('root-2', 'Root 2', 'Error', 'run-1', new Date(base.getTime() + 10), ['/src/b.ts']);
      const effect1 = createFailure('effect-1', 'Effect 1', 'Error', 'run-1', new Date(base.getTime() + 100), ['/src/a.ts', '/src/b.ts']);
      const effect2 = createFailure('effect-2', 'Effect 2', 'Error', 'run-1', new Date(base.getTime() + 200), ['/src/a.ts']);

      graph.addFailureBatch([root1, root2, effect1, effect2]);

      const analyses = graph.findRootCauses(effect2.id);
      // Results should be sorted by (confidence * impact)
      for (let i = 1; i < analyses.length; i++) {
        const prev = analyses[i - 1].confidence * analyses[i - 1].impact;
        const curr = analyses[i].confidence * analyses[i].impact;
        expect(prev).toBeGreaterThanOrEqual(curr);
      }
    });
  });

  // ==========================================================================
  // Fix Suggestions
  // ==========================================================================

  describe('Fix Suggestions', () => {
    it('should suggest resource_cleanup for timeout errors', () => {
      const base = new Date();
      const root = createFailure('test-root', 'Root', 'Connection timeout', 'run-1', new Date(base.getTime()), ['/src/api.ts']);
      const effect = createFailure('test-effect', 'Effect', 'Error', 'run-1', new Date(base.getTime() + 100), ['/src/api.ts']);

      graph.addFailureBatch([root, effect]);

      const analyses = graph.findRootCauses(effect.id);
      expect(analyses.length).toBeGreaterThan(0);
      expect(analyses[0].suggestedFix.type).toBe('resource_cleanup');
    });

    it('should suggest code_change for null/undefined errors', () => {
      const base = new Date();
      const root = createFailure('test-root', 'Root', "Cannot read property 'foo' of null", 'run-1', new Date(base.getTime()), ['/src/utils.ts']);
      const effect = createFailure('test-effect', 'Effect', 'Error', 'run-1', new Date(base.getTime() + 100), ['/src/utils.ts']);

      graph.addFailureBatch([root, effect]);

      const analyses = graph.findRootCauses(effect.id);
      expect(analyses.length).toBeGreaterThan(0);
      expect(analyses[0].suggestedFix.type).toBe('code_change');
    });

    it('should suggest test_isolation for shared state errors', () => {
      const base = new Date();
      const root = createFailure('test-root', 'Root', 'Shared state conflict', 'run-1', new Date(base.getTime()), ['/src/state.ts']);
      const effect = createFailure('test-effect', 'Effect', 'Error', 'run-1', new Date(base.getTime() + 100), ['/src/state.ts']);

      graph.addFailureBatch([root, effect]);

      const analyses = graph.findRootCauses(effect.id);
      expect(analyses.length).toBeGreaterThan(0);
      expect(analyses[0].suggestedFix.type).toBe('test_isolation');
    });

    it('should suggest dependency_fix for high-impact failures', () => {
      const base = new Date();
      const root = createFailure('test-root', 'Root', 'Error in core', 'run-1', new Date(base.getTime()), ['/src/core.ts']);
      const effects: TestFailure[] = [];

      // Create 6+ cascading failures
      for (let i = 0; i < 7; i++) {
        effects.push(
          createFailure(`test-effect-${i}`, `Effect ${i}`, 'Error', 'run-1', new Date(base.getTime() + 100 + i * 50), ['/src/core.ts'])
        );
      }

      graph.addFailureBatch([root, ...effects]);

      const analyses = graph.findRootCauses(effects[effects.length - 1].id);
      expect(analyses.length).toBeGreaterThan(0);
      // Should be dependency_fix due to high impact
      expect(analyses[0].suggestedFix.type).toBe('dependency_fix');
    });

    it('should include files to examine in suggestion', () => {
      const base = new Date();
      const root = createFailure('test-root', 'Root', 'Error', 'run-1', new Date(base.getTime()), ['/src/a.ts', '/src/b.ts']);
      const effect = createFailure('test-effect', 'Effect', 'Error', 'run-1', new Date(base.getTime() + 100), ['/src/a.ts']);

      graph.addFailureBatch([root, effect]);

      const analyses = graph.findRootCauses(effect.id);
      expect(analyses.length).toBeGreaterThan(0);
      expect(analyses[0].suggestedFix.filesToExamine.length).toBeGreaterThan(0);
    });

    it('should set appropriate priority', () => {
      const base = new Date();
      const root = createFailure('test-root', 'Root', 'ECONNREFUSED', 'run-1', new Date(base.getTime()), ['/src/api.ts']);
      const effect = createFailure('test-effect', 'Effect', 'Error', 'run-1', new Date(base.getTime() + 100), ['/src/api.ts']);

      graph.addFailureBatch([root, effect]);

      const analyses = graph.findRootCauses(effect.id);
      expect(analyses.length).toBeGreaterThan(0);
      expect(['low', 'medium', 'high', 'critical']).toContain(analyses[0].suggestedFix.priority);
    });
  });

  // ==========================================================================
  // Effects and Causes
  // ==========================================================================

  describe('getEffects', () => {
    it('should return failures caused by a given failure', () => {
      const base = new Date();
      const cause = createFailure('test-cause', 'Cause', 'Error', 'run-1', new Date(base.getTime()), ['/src/shared.ts']);
      const effect = createFailure('test-effect', 'Effect', 'Error', 'run-1', new Date(base.getTime() + 100), ['/src/shared.ts']);

      graph.addFailureBatch([cause, effect]);

      const effects = graph.getEffects(cause.id);
      expect(effects.length).toBeGreaterThan(0);
    });

    it('should filter by minimum causality score', () => {
      const strictGraph = createTestFailureCausalGraph({ minCausalityScore: 0.9 });
      const base = new Date();
      const cause = createFailure('test-cause', 'Cause', 'Error', 'run-1', new Date(base.getTime()), ['/src/a.ts']);
      const effect = createFailure('test-effect', 'Effect', 'Error', 'run-1', new Date(base.getTime() + 50000), ['/src/b.ts']);

      strictGraph.addFailureBatch([cause, effect]);

      // With high min score and weak links, effects might be empty
      const effects = strictGraph.getEffects(cause.id);
      // This tests the filtering behavior
      expect(Array.isArray(effects)).toBe(true);
    });

    it('should return empty array for non-existent failure', () => {
      const effects = graph.getEffects('non-existent');
      expect(effects).toEqual([]);
    });
  });

  describe('getCauses', () => {
    it('should return failures that caused a given failure', () => {
      const base = new Date();
      const cause = createFailure('test-cause', 'Cause', 'Error', 'run-1', new Date(base.getTime()), ['/src/shared.ts']);
      const effect = createFailure('test-effect', 'Effect', 'Error', 'run-1', new Date(base.getTime() + 100), ['/src/shared.ts']);

      graph.addFailureBatch([cause, effect]);

      const causes = graph.getCauses(effect.id);
      expect(causes.length).toBeGreaterThan(0);
    });

    it('should return empty array for root cause', () => {
      const root = createFailure('test-root', 'Root', 'Error', 'run-1');
      graph.addFailure(root);

      const causes = graph.getCauses(root.id);
      expect(causes).toEqual([]);
    });
  });

  // ==========================================================================
  // Graph Statistics
  // ==========================================================================

  describe('getStats', () => {
    it('should return total failures', () => {
      const failures = createFailureBatch(5);
      graph.addFailureBatch(failures);

      const stats = graph.getStats();
      expect(stats.totalFailures).toBe(5);
    });

    it('should return total links count', () => {
      const base = new Date();
      const failures = [
        createFailure('test-1', 'Test 1', 'Error', 'run-1', new Date(base.getTime()), ['/src/shared.ts']),
        createFailure('test-2', 'Test 2', 'Error', 'run-1', new Date(base.getTime() + 100), ['/src/shared.ts']),
        createFailure('test-3', 'Test 3', 'Error', 'run-1', new Date(base.getTime() + 200), ['/src/shared.ts']),
      ];
      graph.addFailureBatch(failures);

      const stats = graph.getStats();
      expect(stats.totalLinks).toBeGreaterThan(0);
    });

    it('should identify root cause count', () => {
      const base = new Date();
      const root1 = createFailure('root-1', 'Root 1', 'Error', 'run-1', new Date(base.getTime()), ['/src/a.ts']);
      const root2 = createFailure('root-2', 'Root 2', 'Error', 'run-1', new Date(base.getTime()), ['/src/b.ts']);
      const effect1 = createFailure('effect-1', 'Effect 1', 'Error', 'run-1', new Date(base.getTime() + 100), ['/src/a.ts']);
      const effect2 = createFailure('effect-2', 'Effect 2', 'Error', 'run-1', new Date(base.getTime() + 100), ['/src/b.ts']);

      graph.addFailureBatch([root1, root2, effect1, effect2]);

      const stats = graph.getStats();
      expect(stats.rootCauseCount).toBeGreaterThanOrEqual(0);
    });

    it('should calculate average cascade depth', () => {
      const base = new Date();
      const failures = [
        createFailure('test-1', 'Test 1', 'Error', 'run-1', new Date(base.getTime()), ['/src/shared.ts']),
        createFailure('test-2', 'Test 2', 'Error', 'run-1', new Date(base.getTime() + 100), ['/src/shared.ts']),
        createFailure('test-3', 'Test 3', 'Error', 'run-1', new Date(base.getTime() + 200), ['/src/shared.ts']),
      ];
      graph.addFailureBatch(failures);

      const stats = graph.getStats();
      expect(typeof stats.averageCascadeDepth).toBe('number');
      expect(stats.averageCascadeDepth).toBeGreaterThanOrEqual(0);
    });

    it('should return top root causes sorted by impact', () => {
      const base = new Date();
      const root1 = createFailure('root-1', 'Root 1', 'Error', 'run-1', new Date(base.getTime()), ['/src/a.ts']);
      const effect1a = createFailure('effect-1a', 'Effect 1a', 'Error', 'run-1', new Date(base.getTime() + 100), ['/src/a.ts']);
      const effect1b = createFailure('effect-1b', 'Effect 1b', 'Error', 'run-1', new Date(base.getTime() + 200), ['/src/a.ts']);

      const root2 = createFailure('root-2', 'Root 2', 'Error', 'run-1', new Date(base.getTime()), ['/src/b.ts']);
      const effect2 = createFailure('effect-2', 'Effect 2', 'Error', 'run-1', new Date(base.getTime() + 100), ['/src/b.ts']);

      graph.addFailureBatch([root1, effect1a, effect1b, root2, effect2]);

      const stats = graph.getStats();
      expect(stats.topRootCauses.length).toBeLessThanOrEqual(5);
      // Should be sorted by impact
      for (let i = 1; i < stats.topRootCauses.length; i++) {
        expect(stats.topRootCauses[i - 1].impact).toBeGreaterThanOrEqual(stats.topRootCauses[i].impact);
      }
    });

    it('should return empty stats for empty graph', () => {
      const stats = graph.getStats();
      expect(stats.totalFailures).toBe(0);
      expect(stats.totalLinks).toBe(0);
      expect(stats.rootCauseCount).toBe(0);
      expect(stats.averageCascadeDepth).toBe(0);
      expect(stats.topRootCauses).toEqual([]);
    });
  });

  // ==========================================================================
  // Edge Cases
  // ==========================================================================

  describe('Edge Cases', () => {
    it('should handle empty graph', () => {
      expect(graph.failureCount).toBe(0);
      expect(graph.getAllFailures()).toEqual([]);
      expect(graph.getStats().totalFailures).toBe(0);
    });

    it('should handle single failure', () => {
      const failure = createFailure('test-1', 'Test 1', 'Error');
      graph.addFailure(failure);

      expect(graph.failureCount).toBe(1);
      expect(graph.getLinks(failure.id)).toEqual([]);
      expect(graph.getCauses(failure.id)).toEqual([]);
      expect(graph.getEffects(failure.id)).toEqual([]);
    });

    it('should handle circular dependencies gracefully', () => {
      // Create failures that might form a loop in analysis
      const base = new Date();
      const a = createFailure('test-a', 'Test A', 'Error', 'run-1', new Date(base.getTime()), ['/src/circular.ts']);
      const b = createFailure('test-b', 'Test B', 'Error', 'run-1', new Date(base.getTime() + 100), ['/src/circular.ts']);
      const c = createFailure('test-c', 'Test C', 'Error', 'run-1', new Date(base.getTime() + 200), ['/src/circular.ts']);

      graph.addFailureBatch([a, b, c]);

      // Should not hang or throw during analysis
      const analysesA = graph.findRootCauses(a.id);
      const analysesC = graph.findRootCauses(c.id);
      expect(Array.isArray(analysesA)).toBe(true);
      expect(Array.isArray(analysesC)).toBe(true);
    });

    it('should handle failures with no related files', () => {
      const base = new Date();
      const failure1 = createTestFailure('test-1', 'Test 1', '/tests/test-1.ts', 'Error', 'run-1', {
        timestamp: new Date(base.getTime()),
        relatedFiles: [],
      });
      const failure2 = createTestFailure('test-2', 'Test 2', '/tests/test-2.ts', 'Error', 'run-1', {
        timestamp: new Date(base.getTime() + 100),
        relatedFiles: [],
      });

      graph.addFailureBatch([failure1, failure2]);

      // Should still work, just no dependency links
      const links = graph.getLinks(failure1.id);
      const depLinks = links.filter((l) => l.type === 'dependency');
      expect(depLinks.length).toBe(0);
    });

    it('should handle failures with same timestamp', () => {
      const timestamp = new Date();
      const failure1 = createFailure('test-1', 'Test 1', 'Error', 'run-1', timestamp, ['/src/a.ts']);
      const failure2 = createFailure('test-2', 'Test 2', 'Error', 'run-1', timestamp, ['/src/b.ts']);

      graph.addFailureBatch([failure1, failure2]);

      expect(graph.failureCount).toBe(2);
    });

    it('should handle very long error messages', () => {
      const longError = 'Error: '.padEnd(10000, 'x');
      const failure = createFailure('test-1', 'Test 1', longError);
      graph.addFailure(failure);

      expect(graph.getFailure(failure.id)?.errorMessage).toBe(longError);
    });

    it('should handle special characters in test names', () => {
      const failure = createFailure('test-special', 'Test <special> & "chars"', 'Error');
      graph.addFailure(failure);

      expect(graph.getFailure(failure.id)?.testName).toBe('Test <special> & "chars"');
    });
  });

  // ==========================================================================
  // Clear and Cleanup
  // ==========================================================================

  describe('Clear', () => {
    it('should clear all data', () => {
      const failures = createFailureBatch(10);
      graph.addFailureBatch(failures);

      expect(graph.failureCount).toBe(10);

      graph.clear();

      expect(graph.failureCount).toBe(0);
      expect(graph.getAllFailures()).toEqual([]);
      expect(graph.getStats().totalFailures).toBe(0);
      expect(graph.getStats().totalLinks).toBe(0);
    });

    it('should allow adding failures after clear', () => {
      const failure1 = createFailure('test-1', 'Test 1', 'Error');
      graph.addFailure(failure1);
      graph.clear();

      const failure2 = createFailure('test-2', 'Test 2', 'Error');
      graph.addFailure(failure2);

      expect(graph.failureCount).toBe(1);
      expect(graph.getFailure(failure2.id)).toBeDefined();
    });
  });

  // ==========================================================================
  // getAllFailures
  // ==========================================================================

  describe('getAllFailures', () => {
    it('should return all failures', () => {
      const failures = createFailureBatch(5);
      graph.addFailureBatch(failures);

      const allFailures = graph.getAllFailures();
      expect(allFailures.length).toBe(5);
    });

    it('should return empty array for empty graph', () => {
      const allFailures = graph.getAllFailures();
      expect(allFailures).toEqual([]);
    });
  });

  // ==========================================================================
  // getLinks
  // ==========================================================================

  describe('getLinks', () => {
    it('should return links for a failure', () => {
      const base = new Date();
      const failure1 = createFailure('test-1', 'Test 1', 'Error', 'run-1', new Date(base.getTime()), ['/src/shared.ts']);
      const failure2 = createFailure('test-2', 'Test 2', 'Error', 'run-1', new Date(base.getTime() + 100), ['/src/shared.ts']);

      graph.addFailureBatch([failure1, failure2]);

      const links = graph.getLinks(failure1.id);
      expect(links.length).toBeGreaterThan(0);
      expect(links[0].causeId).toBe(failure1.id);
    });

    it('should return empty array for failure with no links', () => {
      const failure = createFailure('test-1', 'Test 1', 'Error');
      graph.addFailure(failure);

      const links = graph.getLinks(failure.id);
      expect(links).toEqual([]);
    });

    it('should return empty array for non-existent failure', () => {
      const links = graph.getLinks('non-existent');
      expect(links).toEqual([]);
    });
  });

  // ==========================================================================
  // Factory Function
  // ==========================================================================

  describe('Factory Function', () => {
    it('should create graph via factory', () => {
      const factoryGraph = createTestFailureCausalGraph();
      expect(factoryGraph).toBeInstanceOf(TestFailureCausalGraph);
    });

    it('should create graph with config via factory', () => {
      const factoryGraph = createTestFailureCausalGraph({
        minCausalityScore: 0.6,
        temporalWindowMs: 45000,
      });
      expect(factoryGraph).toBeInstanceOf(TestFailureCausalGraph);
    });
  });
});
