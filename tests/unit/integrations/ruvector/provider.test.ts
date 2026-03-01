/**
 * Agentic QE v3 - Provider Factory Functions Tests
 *
 * Tests ML-first approach with observability integration for all factory functions.
 * Verifies that:
 * 1. ML path works when config.enabled = true
 * 2. Fallback triggers observability alerts
 * 3. Metrics are recorded correctly for both paths
 *
 * @module tests/unit/integrations/ruvector/provider.test
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Import factory functions
import {
  createQLearningRouter,
  createQLearningRouterSync,
} from '../../../../src/integrations/ruvector/q-learning-router.js';
import {
  createASTComplexityAnalyzer,
  createASTComplexityAnalyzerSync,
} from '../../../../src/integrations/ruvector/ast-complexity.js';
import {
  createDiffRiskClassifier,
  createDiffRiskClassifierSync,
} from '../../../../src/integrations/ruvector/diff-risk-classifier.js';
import {
  createCoverageRouter,
  createCoverageRouterSync,
} from '../../../../src/integrations/ruvector/coverage-router.js';
import {
  createGraphBoundariesAnalyzer,
  createGraphBoundariesAnalyzerSync,
} from '../../../../src/integrations/ruvector/graph-boundaries.js';

// Import ML implementations (to verify type)
import { RuVectorQLearningRouter } from '../../../../src/integrations/ruvector/q-learning-router.js';
import { RuVectorASTComplexityAnalyzer } from '../../../../src/integrations/ruvector/ast-complexity.js';
import { RuVectorDiffRiskClassifier } from '../../../../src/integrations/ruvector/diff-risk-classifier.js';
import { RuVectorCoverageRouter } from '../../../../src/integrations/ruvector/coverage-router.js';
import { RuVectorGraphBoundariesAnalyzer } from '../../../../src/integrations/ruvector/graph-boundaries.js';

// Import fallback implementations (to verify type)
import {
  FallbackQLearningRouter,
  FallbackASTComplexityAnalyzer,
  FallbackDiffRiskClassifier,
  FallbackCoverageRouter,
  FallbackGraphBoundariesAnalyzer,
} from '../../../../src/integrations/ruvector/fallback.js';

// Import observability
import {
  RuVectorObservability,
  getRuVectorObservability,
} from '../../../../src/integrations/ruvector/observability.js';

// Import types
import type { RuVectorConfig } from '../../../../src/integrations/ruvector/interfaces.js';

// ============================================================================
// Test Configuration
// ============================================================================

const createEnabledConfig = (): RuVectorConfig => ({
  enabled: true,
  endpoint: 'http://localhost:8080',
  fallbackEnabled: true,
  cacheEnabled: false,
  timeout: 5000,
  retryAttempts: 3,
  cacheTtl: 300000,
});

const createDisabledConfig = (): RuVectorConfig => ({
  enabled: false,
  endpoint: 'http://localhost:8080',
  fallbackEnabled: true,
  cacheEnabled: false,
  timeout: 5000,
  retryAttempts: 3,
  cacheTtl: 300000,
});

// ============================================================================
// Test Suite
// ============================================================================

describe('Provider Factory Functions - ML-First Approach', () => {
  let observability: RuVectorObservability;

  beforeEach(() => {
    // Reset observability singleton before each test
    RuVectorObservability.resetInstance();
    observability = getRuVectorObservability();
    observability.updateConfig({
      enableConsoleAlerts: false, // Suppress alerts during tests
      verboseLogging: false,
    });
  });

  afterEach(() => {
    observability.clear();
    RuVectorObservability.resetInstance();
  });

  // ==========================================================================
  // Q-Learning Router Tests
  // ==========================================================================

  describe('createQLearningRouter', () => {
    it('should return ML implementation when config.enabled = true', async () => {
      const config = createEnabledConfig();
      const router = await createQLearningRouter(config);

      // Verify it's the ML implementation
      expect(router).toBeInstanceOf(RuVectorQLearningRouter);
    });

    it('should record ML usage when config.enabled = true', async () => {
      const config = createEnabledConfig();
      await createQLearningRouter(config);

      const metrics = observability.getComponentMetrics('q-learning-router');
      expect(metrics).toBeDefined();
      expect(metrics!.mlUsedCount).toBe(1);
      expect(metrics!.fallbackUsedCount).toBe(0);
    });

    it('should return fallback implementation when config.enabled = false', async () => {
      const config = createDisabledConfig();
      const router = await createQLearningRouter(config);

      // Verify it's the fallback implementation
      expect(router).toBeInstanceOf(FallbackQLearningRouter);
    });

    it('should record fallback with "disabled" reason when config.enabled = false', async () => {
      const config = createDisabledConfig();
      await createQLearningRouter(config);

      const metrics = observability.getComponentMetrics('q-learning-router');
      expect(metrics).toBeDefined();
      expect(metrics!.mlUsedCount).toBe(0);
      expect(metrics!.fallbackUsedCount).toBe(1);
      expect(metrics!.fallbackReasons.get('disabled')).toBe(1);
    });

    it('sync version should also track observability', () => {
      const config = createEnabledConfig();
      const router = createQLearningRouterSync(config);

      expect(router).toBeInstanceOf(RuVectorQLearningRouter);

      const metrics = observability.getComponentMetrics('q-learning-router');
      expect(metrics).toBeDefined();
      expect(metrics!.mlUsedCount).toBe(1);
    });
  });

  // ==========================================================================
  // AST Complexity Analyzer Tests
  // ==========================================================================

  describe('createASTComplexityAnalyzer', () => {
    it('should return ML implementation when config.enabled = true', async () => {
      const config = createEnabledConfig();
      const analyzer = await createASTComplexityAnalyzer(config);

      expect(analyzer).toBeInstanceOf(RuVectorASTComplexityAnalyzer);
    });

    it('should record ML usage when config.enabled = true', async () => {
      const config = createEnabledConfig();
      await createASTComplexityAnalyzer(config);

      const metrics = observability.getComponentMetrics('ast-complexity');
      expect(metrics).toBeDefined();
      expect(metrics!.mlUsedCount).toBe(1);
      expect(metrics!.fallbackUsedCount).toBe(0);
    });

    it('should return fallback implementation when config.enabled = false', async () => {
      const config = createDisabledConfig();
      const analyzer = await createASTComplexityAnalyzer(config);

      expect(analyzer).toBeInstanceOf(FallbackASTComplexityAnalyzer);
    });

    it('should record fallback with "disabled" reason when config.enabled = false', async () => {
      const config = createDisabledConfig();
      await createASTComplexityAnalyzer(config);

      const metrics = observability.getComponentMetrics('ast-complexity');
      expect(metrics).toBeDefined();
      expect(metrics!.mlUsedCount).toBe(0);
      expect(metrics!.fallbackUsedCount).toBe(1);
      expect(metrics!.fallbackReasons.get('disabled')).toBe(1);
    });

    it('sync version should also track observability', () => {
      const config = createEnabledConfig();
      const analyzer = createASTComplexityAnalyzerSync(config);

      expect(analyzer).toBeInstanceOf(RuVectorASTComplexityAnalyzer);

      const metrics = observability.getComponentMetrics('ast-complexity');
      expect(metrics).toBeDefined();
      expect(metrics!.mlUsedCount).toBe(1);
    });
  });

  // ==========================================================================
  // Diff Risk Classifier Tests
  // ==========================================================================

  describe('createDiffRiskClassifier', () => {
    it('should return ML implementation when config.enabled = true', async () => {
      const config = createEnabledConfig();
      const classifier = await createDiffRiskClassifier(config);

      expect(classifier).toBeInstanceOf(RuVectorDiffRiskClassifier);
    });

    it('should record ML usage when config.enabled = true', async () => {
      const config = createEnabledConfig();
      await createDiffRiskClassifier(config);

      const metrics = observability.getComponentMetrics('diff-risk-classifier');
      expect(metrics).toBeDefined();
      expect(metrics!.mlUsedCount).toBe(1);
      expect(metrics!.fallbackUsedCount).toBe(0);
    });

    it('should return fallback implementation when config.enabled = false', async () => {
      const config = createDisabledConfig();
      const classifier = await createDiffRiskClassifier(config);

      expect(classifier).toBeInstanceOf(FallbackDiffRiskClassifier);
    });

    it('should record fallback with "disabled" reason when config.enabled = false', async () => {
      const config = createDisabledConfig();
      await createDiffRiskClassifier(config);

      const metrics = observability.getComponentMetrics('diff-risk-classifier');
      expect(metrics).toBeDefined();
      expect(metrics!.mlUsedCount).toBe(0);
      expect(metrics!.fallbackUsedCount).toBe(1);
      expect(metrics!.fallbackReasons.get('disabled')).toBe(1);
    });

    it('sync version should also track observability', () => {
      const config = createEnabledConfig();
      const classifier = createDiffRiskClassifierSync(config);

      expect(classifier).toBeInstanceOf(RuVectorDiffRiskClassifier);

      const metrics = observability.getComponentMetrics('diff-risk-classifier');
      expect(metrics).toBeDefined();
      expect(metrics!.mlUsedCount).toBe(1);
    });
  });

  // ==========================================================================
  // Coverage Router Tests
  // ==========================================================================

  describe('createCoverageRouter', () => {
    it('should return ML implementation when config.enabled = true', async () => {
      const config = createEnabledConfig();
      const router = await createCoverageRouter(config);

      expect(router).toBeInstanceOf(RuVectorCoverageRouter);
    });

    it('should record ML usage when config.enabled = true', async () => {
      const config = createEnabledConfig();
      await createCoverageRouter(config);

      const metrics = observability.getComponentMetrics('coverage-router');
      expect(metrics).toBeDefined();
      expect(metrics!.mlUsedCount).toBe(1);
      expect(metrics!.fallbackUsedCount).toBe(0);
    });

    it('should return fallback implementation when config.enabled = false', async () => {
      const config = createDisabledConfig();
      const router = await createCoverageRouter(config);

      expect(router).toBeInstanceOf(FallbackCoverageRouter);
    });

    it('should record fallback with "disabled" reason when config.enabled = false', async () => {
      const config = createDisabledConfig();
      await createCoverageRouter(config);

      const metrics = observability.getComponentMetrics('coverage-router');
      expect(metrics).toBeDefined();
      expect(metrics!.mlUsedCount).toBe(0);
      expect(metrics!.fallbackUsedCount).toBe(1);
      expect(metrics!.fallbackReasons.get('disabled')).toBe(1);
    });

    it('sync version should also track observability', () => {
      const config = createEnabledConfig();
      const router = createCoverageRouterSync(config);

      expect(router).toBeInstanceOf(RuVectorCoverageRouter);

      const metrics = observability.getComponentMetrics('coverage-router');
      expect(metrics).toBeDefined();
      expect(metrics!.mlUsedCount).toBe(1);
    });
  });

  // ==========================================================================
  // Graph Boundaries Analyzer Tests
  // ==========================================================================

  describe('createGraphBoundariesAnalyzer', () => {
    it('should return ML implementation when config.enabled = true', async () => {
      const config = createEnabledConfig();
      const analyzer = await createGraphBoundariesAnalyzer(config);

      expect(analyzer).toBeInstanceOf(RuVectorGraphBoundariesAnalyzer);
    });

    it('should record ML usage when config.enabled = true', async () => {
      const config = createEnabledConfig();
      await createGraphBoundariesAnalyzer(config);

      const metrics = observability.getComponentMetrics('graph-boundaries');
      expect(metrics).toBeDefined();
      expect(metrics!.mlUsedCount).toBe(1);
      expect(metrics!.fallbackUsedCount).toBe(0);
    });

    it('should return fallback implementation when config.enabled = false', async () => {
      const config = createDisabledConfig();
      const analyzer = await createGraphBoundariesAnalyzer(config);

      expect(analyzer).toBeInstanceOf(FallbackGraphBoundariesAnalyzer);
    });

    it('should record fallback with "disabled" reason when config.enabled = false', async () => {
      const config = createDisabledConfig();
      await createGraphBoundariesAnalyzer(config);

      const metrics = observability.getComponentMetrics('graph-boundaries');
      expect(metrics).toBeDefined();
      expect(metrics!.mlUsedCount).toBe(0);
      expect(metrics!.fallbackUsedCount).toBe(1);
      expect(metrics!.fallbackReasons.get('disabled')).toBe(1);
    });

    it('sync version should also track observability', () => {
      const config = createEnabledConfig();
      const analyzer = createGraphBoundariesAnalyzerSync(config);

      expect(analyzer).toBeInstanceOf(RuVectorGraphBoundariesAnalyzer);

      const metrics = observability.getComponentMetrics('graph-boundaries');
      expect(metrics).toBeDefined();
      expect(metrics!.mlUsedCount).toBe(1);
    });
  });

  // ==========================================================================
  // Cross-Component Tests
  // ==========================================================================

  describe('Cross-component observability', () => {
    it('should track metrics across multiple factory calls', async () => {
      const enabledConfig = createEnabledConfig();
      const disabledConfig = createDisabledConfig();

      // Create some with ML, some with fallback
      await createQLearningRouter(enabledConfig);
      await createASTComplexityAnalyzer(enabledConfig);
      await createDiffRiskClassifier(disabledConfig);
      await createCoverageRouter(disabledConfig);
      await createGraphBoundariesAnalyzer(enabledConfig);

      const report = observability.getReport();

      expect(report.metrics.totalMLUsed).toBe(3);
      expect(report.metrics.totalFallbackUsed).toBe(2);
      expect(report.metrics.mlUsagePercentage).toBe(60); // 3/5 = 60%
    });

    it('should generate accurate observability report', async () => {
      const enabledConfig = createEnabledConfig();
      const disabledConfig = createDisabledConfig();

      // Create multiple instances
      await createQLearningRouter(enabledConfig);
      await createQLearningRouter(enabledConfig);
      await createQLearningRouter(disabledConfig);
      await createASTComplexityAnalyzer(disabledConfig);
      await createDiffRiskClassifier(enabledConfig);

      const report = observability.getReport();

      // Check overall metrics
      expect(report.metrics.totalMLUsed).toBe(3);
      expect(report.metrics.totalFallbackUsed).toBe(2);
      expect(report.metrics.mlUsagePercentage).toBe(60);

      // Check component breakdown
      const qLearningBreakdown = report.componentBreakdown.find(
        (c) => c.component === 'q-learning-router'
      );
      expect(qLearningBreakdown).toBeDefined();
      expect(qLearningBreakdown!.mlUsed).toBe(2);
      expect(qLearningBreakdown!.fallbackUsed).toBe(1);

      const astBreakdown = report.componentBreakdown.find(
        (c) => c.component === 'ast-complexity'
      );
      expect(astBreakdown).toBeDefined();
      expect(astBreakdown!.mlUsed).toBe(0);
      expect(astBreakdown!.fallbackUsed).toBe(1);
    });

    it('should determine correct health status based on ML usage', async () => {
      const enabledConfig = createEnabledConfig();
      const disabledConfig = createDisabledConfig();

      // All ML - should be healthy
      await createQLearningRouter(enabledConfig);
      await createASTComplexityAnalyzer(enabledConfig);
      let report = observability.getReport();
      expect(report.healthStatus).toBe('healthy');

      observability.clear();

      // 50% ML - should be degraded
      await createQLearningRouter(enabledConfig);
      await createASTComplexityAnalyzer(disabledConfig);
      report = observability.getReport();
      expect(report.healthStatus).toBe('degraded');

      observability.clear();

      // All fallback - should be critical
      await createQLearningRouter(disabledConfig);
      await createASTComplexityAnalyzer(disabledConfig);
      report = observability.getReport();
      expect(report.healthStatus).toBe('critical');
    });
  });

  // ==========================================================================
  // Alert Tests
  // ==========================================================================

  describe('Fallback alerts', () => {
    it('should trigger alerts when ML usage drops below threshold', async () => {
      const disabledConfig = createDisabledConfig();

      // Create many fallback instances to exceed threshold
      for (let i = 0; i < 10; i++) {
        await createQLearningRouter(disabledConfig);
      }

      // Check alerts
      const alerts = observability.checkAndAlert();

      // Should have global alert (0% ML usage)
      const globalAlert = alerts.find((a) => a.component === 'global');
      expect(globalAlert).toBeDefined();
      expect(globalAlert!.currentPercentage).toBe(0);
    });

    it('should include fallback reasons in alerts', async () => {
      const disabledConfig = createDisabledConfig();

      await createQLearningRouter(disabledConfig);
      await createQLearningRouter(disabledConfig);
      await createQLearningRouter(disabledConfig);
      await createQLearningRouter(disabledConfig);
      await createQLearningRouter(disabledConfig);

      const metrics = observability.getComponentMetrics('q-learning-router');
      expect(metrics!.fallbackReasons.get('disabled')).toBe(5);
    });
  });

  // ==========================================================================
  // Latency Tracking Tests
  // ==========================================================================

  describe('Latency tracking', () => {
    it('should record ML latency when available', async () => {
      const config = createEnabledConfig();

      // Create multiple instances
      await createQLearningRouter(config);
      await createQLearningRouter(config);
      await createQLearningRouter(config);

      const metrics = observability.getComponentMetrics('q-learning-router');
      expect(metrics).toBeDefined();
      // Latencies should be recorded (3 instances)
      expect(metrics!.mlLatencies.length).toBe(3);
      // All latencies should be >= 0
      metrics!.mlLatencies.forEach((latency) => {
        expect(latency).toBeGreaterThanOrEqual(0);
      });
    });
  });
});
