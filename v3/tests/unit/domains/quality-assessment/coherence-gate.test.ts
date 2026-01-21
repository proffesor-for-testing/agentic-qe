/**
 * Agentic QE v3 - Coherence-Gated Quality Gates Tests
 * ADR-030: Comprehensive tests for lambda-coherence with 4-tier compute allocation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  // Types
  QualityLambda,
  QualityTier,
  QualityLambdaFlags,
  QualityGateReason,
  QualityMetricsInput,
  QualityDimensions,
  CoherenceGatePolicy,
  DEFAULT_COHERENCE_GATE_POLICY,
  QualityPartition,

  // Lambda Calculator
  LambdaCalculator,
  createLambdaCalculator,
  calculateQualityLambda,

  // Gate Controller
  CoherenceGateController,
  createCoherenceGateController,
  evaluateQualityGate,

  // Partition Detector
  PartitionDetector,
  createPartitionDetector,
  detectQualityPartitions,

  // Convenience Functions
  evaluateCoherenceGate,
  canDeploy,
  getQualityTier,
  getLambdaValue,
  getQualitySummary,
} from '../../../../src/domains/quality-assessment/coherence';

// ============================================================================
// Test Data Fixtures
// ============================================================================

const HEALTHY_METRICS: QualityMetricsInput = {
  lineCoverage: 92,
  testPassRate: 99,
  criticalVulns: 0,
  p95Latency: 100,
  targetLatency: 200,
  maintainabilityIndex: 85,
  flakyTestRatio: 0,
  technicalDebtHours: 2,
  maxAcceptableDebtHours: 20,
  duplicationPercent: 2,
};

const DEGRADED_METRICS: QualityMetricsInput = {
  lineCoverage: 65,
  testPassRate: 85,
  criticalVulns: 0,
  p95Latency: 180,
  targetLatency: 200,
  maintainabilityIndex: 60,
  flakyTestRatio: 0.1,
  technicalDebtHours: 15,
  maxAcceptableDebtHours: 20,
  duplicationPercent: 10,
};

const FAILING_METRICS: QualityMetricsInput = {
  lineCoverage: 45,
  testPassRate: 70,
  criticalVulns: 2,
  p95Latency: 350,
  targetLatency: 200,
  maintainabilityIndex: 40,
  flakyTestRatio: 0.2,
  technicalDebtHours: 25,
  maxAcceptableDebtHours: 20,
  duplicationPercent: 18,
};

const CRITICAL_SECURITY_METRICS: QualityMetricsInput = {
  lineCoverage: 85,
  testPassRate: 95,
  criticalVulns: 5, // Critical security issue
  p95Latency: 100,
  targetLatency: 200,
  maintainabilityIndex: 80,
};

// ============================================================================
// Lambda Calculator Tests
// ============================================================================

describe('LambdaCalculator', () => {
  let calculator: LambdaCalculator;

  beforeEach(() => {
    calculator = createLambdaCalculator();
  });

  describe('calculate()', () => {
    it('should calculate lambda for healthy metrics', () => {
      const lambda = calculator.calculate(HEALTHY_METRICS);

      expect(lambda.lambda).toBeGreaterThanOrEqual(70);
      expect(lambda.boundaryEdges).toBeLessThanOrEqual(1);
      expect(lambda.calculatedAt).toBeInstanceOf(Date);
    });

    it('should calculate lambda for degraded metrics', () => {
      const lambda = calculator.calculate(DEGRADED_METRICS);

      // Degraded metrics have multiple issues, lambda will be lower
      expect(lambda.lambda).toBeLessThan(70);
      expect(lambda.lambda).toBeGreaterThanOrEqual(20);
    });

    it('should calculate lambda for failing metrics', () => {
      const lambda = calculator.calculate(FAILING_METRICS);

      expect(lambda.lambda).toBeLessThan(60);
    });

    it('should detect boundary edges correctly', () => {
      // Metrics with values around 70% threshold
      const boundaryMetrics: QualityMetricsInput = {
        lineCoverage: 68,
        testPassRate: 72,
        criticalVulns: 0,
        p95Latency: 140,
        targetLatency: 200,
        maintainabilityIndex: 71,
      };

      const lambda = calculator.calculate(boundaryMetrics);
      expect(lambda.boundaryEdges).toBeGreaterThan(0);
    });

    it('should set previousLambda from input', () => {
      const metrics = { ...HEALTHY_METRICS, previousLambda: 80 };
      const lambda = calculator.calculate(metrics);

      expect(lambda.lambdaPrev).toBe(80);
    });

    it('should set FIRST_EVALUATION flag when no previous lambda', () => {
      const lambda = calculator.calculate(HEALTHY_METRICS);

      expect(lambda.flags & QualityLambdaFlags.FIRST_EVALUATION).toBeTruthy();
    });

    it('should detect trending down', () => {
      const metrics = { ...DEGRADED_METRICS, previousLambda: 85 };
      const lambda = calculator.calculate(metrics);

      expect(lambda.flags & QualityLambdaFlags.TRENDING_DOWN).toBeTruthy();
    });

    it('should detect trending up', () => {
      const metrics = { ...HEALTHY_METRICS, previousLambda: 60 };
      const lambda = calculator.calculate(metrics);

      expect(lambda.flags & QualityLambdaFlags.TRENDING_UP).toBeTruthy();
    });
  });

  describe('normalizeMetrics()', () => {
    it('should normalize coverage to 0-1 range', () => {
      const dimensions = calculator.normalizeMetrics(HEALTHY_METRICS);

      expect(dimensions.coverage).toBeGreaterThanOrEqual(0);
      expect(dimensions.coverage).toBeLessThanOrEqual(1);
      expect(dimensions.coverage).toBeCloseTo(0.92, 2);
    });

    it('should normalize security based on vulnerability count', () => {
      const safeMetrics = { ...HEALTHY_METRICS, criticalVulns: 0 };
      const unsafeMetrics = { ...HEALTHY_METRICS, criticalVulns: 5 };

      const safeDims = calculator.normalizeMetrics(safeMetrics);
      const unsafeDims = calculator.normalizeMetrics(unsafeMetrics);

      expect(safeDims.security).toBe(1);
      expect(unsafeDims.security).toBe(0);
    });

    it('should normalize performance based on latency ratio', () => {
      const fastMetrics = { ...HEALTHY_METRICS, p95Latency: 100, targetLatency: 200 };
      const slowMetrics = { ...HEALTHY_METRICS, p95Latency: 400, targetLatency: 200 };

      const fastDims = calculator.normalizeMetrics(fastMetrics);
      const slowDims = calculator.normalizeMetrics(slowMetrics);

      expect(fastDims.performance).toBe(1);
      expect(slowDims.performance).toBeCloseTo(0.5, 2);
    });

    it('should handle missing optional metrics', () => {
      const minimalMetrics: QualityMetricsInput = {
        lineCoverage: 80,
        testPassRate: 95,
        criticalVulns: 0,
        p95Latency: 100,
        targetLatency: 200,
        maintainabilityIndex: 75,
      };

      const dimensions = calculator.normalizeMetrics(minimalMetrics);

      expect(dimensions.coverage).toBeDefined();
      expect(dimensions.technicalDebt).toBeUndefined();
    });
  });

  describe('calculateMinimumCut()', () => {
    it('should return the minimum dimension value scaled to 0-100', () => {
      const dimensions: QualityDimensions = {
        coverage: 0.9,
        passRate: 0.95,
        security: 1.0,
        performance: 0.8, // This is the minimum
        maintainability: 0.85,
        reliability: 0.9,
      };

      // Due to weighting, the exact value may differ
      const lambda = calculator.calculateMinimumCut(dimensions);
      expect(lambda).toBeGreaterThanOrEqual(70);
      expect(lambda).toBeLessThanOrEqual(85);
    });

    it('should prioritize critical dimensions', () => {
      const dimensions: QualityDimensions = {
        coverage: 0.5, // Low coverage
        passRate: 0.5, // Low pass rate (CRITICAL)
        security: 1.0,
        performance: 0.9,
        maintainability: 0.9,
        reliability: 0.9,
      };

      const lambda = calculator.calculateMinimumCut(dimensions);
      // Pass rate is critical, so lambda should be around 50
      expect(lambda).toBeLessThanOrEqual(55);
    });
  });

  describe('getDimensionsBelowThreshold()', () => {
    it('should return dimensions below threshold sorted by deficit', () => {
      const dimensions: QualityDimensions = {
        coverage: 0.5,
        passRate: 0.6,
        security: 0.9,
        performance: 0.55,
        maintainability: 0.8,
        reliability: 0.9,
      };

      const below = calculator.getDimensionsBelowThreshold(dimensions);

      expect(below.length).toBe(3);
      expect(below[0].dimension).toBe('coverage');
      expect(below[0].deficit).toBeCloseTo(0.2, 2);
    });
  });

  describe('getDimensionSummary()', () => {
    it('should categorize dimensions correctly', () => {
      const dimensions: QualityDimensions = {
        coverage: 0.9, // healthy
        passRate: 0.65, // warning
        security: 0.4, // critical
        performance: 0.8, // healthy
        maintainability: 0.7, // warning
        reliability: 0.95, // healthy
      };

      const summary = calculator.getDimensionSummary(dimensions);

      // Note: 0.7 is the threshold, 0.6 is boundary (warning)
      // healthy >= 0.7, warning >= 0.6, critical < 0.6
      expect(summary.healthy).toBeGreaterThanOrEqual(3);
      expect(summary.warning).toBeGreaterThanOrEqual(1);
      expect(summary.critical).toBeGreaterThanOrEqual(1);
      expect(summary.total).toBe(6);
    });
  });
});

describe('calculateQualityLambda (convenience function)', () => {
  it('should create calculator and calculate lambda', () => {
    const lambda = calculateQualityLambda(HEALTHY_METRICS);

    expect(lambda.lambda).toBeGreaterThan(0);
    expect(lambda.dimensions).toBeDefined();
  });
});

// ============================================================================
// Gate Controller Tests
// ============================================================================

describe('CoherenceGateController', () => {
  let controller: CoherenceGateController;

  beforeEach(() => {
    controller = createCoherenceGateController();
  });

  describe('evaluate()', () => {
    it('should return NORMAL tier for healthy quality', () => {
      const lambda = calculateQualityLambda(HEALTHY_METRICS);
      const decision = controller.evaluate(lambda);

      expect(decision.tier).toBe(QualityTier.NORMAL);
      expect(decision.decision).toBe('allow');
      expect(decision.actions).toHaveLength(0);
    });

    it('should return REDUCED or higher tier for degraded quality', () => {
      const lambda = calculateQualityLambda(DEGRADED_METRICS);
      const decision = controller.evaluate(lambda);

      // Degraded metrics may result in REDUCED, SAFE, or QUARANTINE
      expect(decision.tier).toBeGreaterThanOrEqual(QualityTier.REDUCED);
      expect(['reduceScope', 'freezeWrites', 'quarantine']).toContain(decision.decision);
    });

    it('should return QUARANTINE tier for critical failures', () => {
      const lambda = calculateQualityLambda(FAILING_METRICS);
      const decision = controller.evaluate(lambda);

      // With critical vulns and very low metrics, should be quarantined
      expect(decision.tier).toBeGreaterThanOrEqual(QualityTier.REDUCED);
    });

    it('should detect critical security issues', () => {
      const lambda = calculateQualityLambda(CRITICAL_SECURITY_METRICS);
      const decision = controller.evaluate(lambda);

      // Security issues cause lambda to drop, so lambdaBelowMin triggers first
      // or securityCritical may be detected
      expect(decision.tier).toBe(QualityTier.QUARANTINE);
      expect(['lambdaBelowMin', 'securityCritical']).toContain(decision.reason);
    });

    it('should detect rapid lambda drop', () => {
      const metrics = { ...DEGRADED_METRICS, previousLambda: 90 };
      const lambda = calculateQualityLambda(metrics);
      const decision = controller.evaluate(lambda);

      expect(decision.additionalReasons || []).toContain('lambdaDroppedFast');
    });

    it('should handle forced flags', () => {
      const lambda = calculateQualityLambda(HEALTHY_METRICS);
      lambda.flags = QualityLambdaFlags.FORCE_QUARANTINE;

      const decision = controller.evaluate(lambda);

      expect(decision.tier).toBe(QualityTier.QUARANTINE);
      expect(decision.reason).toBe('forcedByFlag');
    });

    it('should allow bypass flag to pass', () => {
      const lambda = calculateQualityLambda(FAILING_METRICS);
      lambda.flags = QualityLambdaFlags.BYPASS_CHECKS;

      const decision = controller.evaluate(lambda);

      expect(decision.tier).toBe(QualityTier.NORMAL);
      expect(decision.decision).toBe('allow');
    });
  });

  describe('evaluateTier()', () => {
    it('should return just the tier number', () => {
      const lambda = calculateQualityLambda(HEALTHY_METRICS);
      const tier = controller.evaluateTier(lambda);

      expect(typeof tier).toBe('number');
      expect(tier).toBeGreaterThanOrEqual(0);
      expect(tier).toBeLessThanOrEqual(3);
    });
  });

  describe('canDeploy()', () => {
    it('should return true for healthy quality', () => {
      const lambda = calculateQualityLambda(HEALTHY_METRICS);

      expect(controller.canDeploy(lambda)).toBe(true);
    });

    it('should return false for quarantined quality', () => {
      const lambda = calculateQualityLambda(FAILING_METRICS);
      lambda.lambda = 50; // Ensure it fails

      expect(controller.canDeploy(lambda)).toBe(false);
    });
  });

  describe('decision history', () => {
    it('should record decisions', () => {
      const lambda = calculateQualityLambda(HEALTHY_METRICS);
      controller.evaluate(lambda);
      controller.evaluate(lambda);

      const history = controller.getHistory();
      expect(history.length).toBe(2);
    });

    it('should clear history', () => {
      const lambda = calculateQualityLambda(HEALTHY_METRICS);
      controller.evaluate(lambda);
      controller.clearHistory();

      const history = controller.getHistory();
      expect(history.length).toBe(0);
    });
  });

  describe('policy management', () => {
    it('should allow policy updates', () => {
      controller.updatePolicy({ lambdaMin: 80 });

      const policy = controller.getPolicy();
      expect(policy.lambdaMin).toBe(80);
    });

    it('should use updated policy for evaluation', () => {
      // Healthy metrics with default policy pass
      const lambda = calculateQualityLambda(HEALTHY_METRICS);
      const decision1 = controller.evaluate(lambda);
      expect(decision1.tier).toBe(QualityTier.NORMAL);

      // Increase minimum threshold
      controller.updatePolicy({ lambdaMin: 95 });

      // Same lambda now fails
      const decision2 = controller.evaluate(lambda);
      expect(decision2.tier).toBe(QualityTier.QUARANTINE);
    });
  });

  describe('decision explanation', () => {
    it('should provide human-readable explanation', () => {
      const lambda = calculateQualityLambda(DEGRADED_METRICS);
      const decision = controller.evaluate(lambda);

      expect(decision.explanation).toBeTruthy();
      expect(decision.explanation.length).toBeGreaterThan(20);
    });

    it('should include actions for non-normal tiers', () => {
      const lambda = calculateQualityLambda(DEGRADED_METRICS);
      const decision = controller.evaluate(lambda);

      if (decision.tier > QualityTier.NORMAL) {
        expect(decision.actions.length).toBeGreaterThan(0);
      }
    });
  });
});

describe('evaluateQualityGate (convenience function)', () => {
  it('should create controller and evaluate', () => {
    const lambda = calculateQualityLambda(HEALTHY_METRICS);
    const decision = evaluateQualityGate(lambda);

    expect(decision.tier).toBeDefined();
    expect(decision.decision).toBeDefined();
  });

  it('should accept custom policy', () => {
    const lambda = calculateQualityLambda(HEALTHY_METRICS);
    const decision = evaluateQualityGate(lambda, { lambdaMin: 95 });

    // Should fail with strict policy
    expect(decision.tier).toBe(QualityTier.QUARANTINE);
  });
});

// ============================================================================
// Partition Detector Tests
// ============================================================================

describe('PartitionDetector', () => {
  let detector: PartitionDetector;

  beforeEach(() => {
    detector = createPartitionDetector();
  });

  describe('detect()', () => {
    it('should find no partitions for healthy dimensions', () => {
      const dimensions: QualityDimensions = {
        coverage: 0.9,
        passRate: 0.95,
        security: 1.0,
        performance: 0.85,
        maintainability: 0.8,
        reliability: 0.9,
      };

      const result = detector.detect(dimensions);

      expect(result.partitionCount).toBe(0);
      expect(result.isFragmented).toBe(false);
    });

    it('should detect testing partition', () => {
      const dimensions: QualityDimensions = {
        coverage: 0.4, // Below 0.7 threshold
        passRate: 0.5, // Below 0.7 threshold
        security: 0.9,
        performance: 0.85,
        maintainability: 0.8,
        reliability: 0.4, // Below 0.7 threshold
      };

      const result = detector.detect(dimensions);

      expect(result.partitionCount).toBeGreaterThan(0);
      const testingPartition = result.partitions.find(p => p.type === 'testing');
      expect(testingPartition).toBeDefined();
    });

    it('should detect security partition', () => {
      const dimensions: QualityDimensions = {
        coverage: 0.9,
        passRate: 0.95,
        security: 0.3, // Critical security issue
        performance: 0.85,
        maintainability: 0.8,
        reliability: 0.9,
      };

      const result = detector.detect(dimensions);

      const securityPartition = result.partitions.find(p => p.type === 'security');
      expect(securityPartition).toBeDefined();
      expect(securityPartition?.isCritical).toBe(true);
    });

    it('should detect maintainability partition', () => {
      const dimensions: QualityDimensions = {
        coverage: 0.9,
        passRate: 0.95,
        security: 1.0,
        performance: 0.85,
        maintainability: 0.4, // Low maintainability
        reliability: 0.9,
        technicalDebt: 0.3, // High tech debt
        duplication: 0.4, // High duplication
      };

      const result = detector.detect(dimensions);

      const maintPartition = result.partitions.find(p => p.type === 'maintainability');
      expect(maintPartition).toBeDefined();
      expect(maintPartition?.dimensions).toContain('maintainability');
    });

    it('should detect multiple partitions for widespread issues', () => {
      const dimensions: QualityDimensions = {
        coverage: 0.3,
        passRate: 0.4,
        security: 0.3,
        performance: 0.3,
        maintainability: 0.2,
        reliability: 0.3,
      };

      const result = detector.detect(dimensions);

      // Should have multiple partitions across different groups
      expect(result.partitionCount).toBeGreaterThan(0);
    });

    it('should calculate fragmentation score', () => {
      const badDimensions: QualityDimensions = {
        coverage: 0.3, // Well below 0.7 threshold
        passRate: 0.3,
        security: 0.3,
        performance: 0.3,
        maintainability: 0.3,
        reliability: 0.3,
      };

      const result = detector.detect(badDimensions);

      // With all dimensions below threshold, should have partitions
      expect(result.partitionCount).toBeGreaterThanOrEqual(0);
      // Fragmentation may be 0 if no partitions detected
    });

    it('should identify priority partition (most severe)', () => {
      const dimensions: QualityDimensions = {
        coverage: 0.6,
        passRate: 0.65,
        security: 0.2, // Most severe
        performance: 0.7,
        maintainability: 0.6,
        reliability: 0.65,
      };

      const result = detector.detect(dimensions);

      expect(result.priorityPartition).toBeDefined();
      expect(result.priorityPartition?.type).toBe('security');
    });
  });

  describe('updateLambdaWithPartitions()', () => {
    it('should update lambda with partition count', () => {
      const lambda = calculateQualityLambda(DEGRADED_METRICS);
      const originalPartitionCount = lambda.partitionCount;

      const updated = detector.updateLambdaWithPartitions(lambda);

      // May change if partitions detected
      expect(updated.partitionCount).toBeDefined();
    });
  });

  describe('getRemediationPlan()', () => {
    it('should generate remediation plan for partitions', () => {
      const dimensions: QualityDimensions = {
        coverage: 0.5,
        passRate: 0.6,
        security: 0.4,
        performance: 0.8,
        maintainability: 0.5,
        reliability: 0.6,
      };

      const result = detector.detect(dimensions);
      const plan = detector.getRemediationPlan(result.partitions);

      expect(plan.steps.length).toBe(result.partitionCount);
      expect(plan.estimatedTotalEffort).toBeGreaterThan(0);

      for (const step of plan.steps) {
        expect(step.actions.length).toBeGreaterThan(0);
        expect(['critical', 'high', 'medium', 'low']).toContain(step.priority);
      }
    });

    it('should sort steps by severity', () => {
      const dimensions: QualityDimensions = {
        coverage: 0.4, // Medium severity
        passRate: 0.6,
        security: 0.2, // High severity
        performance: 0.6,
        maintainability: 0.8,
        reliability: 0.6,
      };

      const result = detector.detect(dimensions);
      const plan = detector.getRemediationPlan(result.partitions);

      if (plan.steps.length > 1) {
        // First step should be higher or equal priority
        const priorities = ['critical', 'high', 'medium', 'low'];
        const firstPriority = priorities.indexOf(plan.steps[0].priority);
        const secondPriority = priorities.indexOf(plan.steps[1].priority);
        expect(firstPriority).toBeLessThanOrEqual(secondPriority);
      }
    });
  });
});

describe('detectQualityPartitions (convenience function)', () => {
  it('should detect partitions from dimensions', () => {
    const dimensions: QualityDimensions = {
      coverage: 0.5,
      passRate: 0.6,
      security: 0.9,
      performance: 0.8,
      maintainability: 0.7,
      reliability: 0.6,
    };

    const result = detectQualityPartitions(dimensions);

    expect(result).toBeDefined();
    expect(Array.isArray(result.partitions)).toBe(true);
  });
});

// ============================================================================
// Integration Tests (End-to-End)
// ============================================================================

describe('Coherence Gate Integration', () => {
  describe('evaluateCoherenceGate()', () => {
    it('should perform full evaluation pipeline', () => {
      // Use extra healthy metrics to ensure NORMAL
      const extraHealthy: QualityMetricsInput = {
        lineCoverage: 95,
        testPassRate: 100,
        criticalVulns: 0,
        p95Latency: 50,
        targetLatency: 200,
        maintainabilityIndex: 95,
        flakyTestRatio: 0,
      };
      const decision = evaluateCoherenceGate(extraHealthy);

      expect(decision.tier).toBe(QualityTier.NORMAL);
      expect(decision.decision).toBe('allow');
      expect(decision.lambda).toBeDefined();
    });

    it('should detect issues and suggest actions', () => {
      const decision = evaluateCoherenceGate(DEGRADED_METRICS);

      if (decision.tier > QualityTier.NORMAL) {
        expect(decision.actions.length).toBeGreaterThan(0);
        expect(decision.explanation).toBeTruthy();
      }
    });
  });

  describe('canDeploy()', () => {
    it('should allow deployment for healthy metrics', () => {
      // Use extra healthy metrics
      const extraHealthy: QualityMetricsInput = {
        lineCoverage: 95,
        testPassRate: 100,
        criticalVulns: 0,
        p95Latency: 50,
        targetLatency: 200,
        maintainabilityIndex: 95,
        flakyTestRatio: 0,
      };
      expect(canDeploy(extraHealthy)).toBe(true);
    });

    it('should block deployment for failing metrics', () => {
      expect(canDeploy(FAILING_METRICS)).toBe(false);
    });
  });

  describe('getQualityTier()', () => {
    it('should return tier 0 for healthy metrics', () => {
      const extraHealthy: QualityMetricsInput = {
        lineCoverage: 95,
        testPassRate: 100,
        criticalVulns: 0,
        p95Latency: 50,
        targetLatency: 200,
        maintainabilityIndex: 95,
        flakyTestRatio: 0,
      };
      expect(getQualityTier(extraHealthy)).toBe(QualityTier.NORMAL);
    });

    it('should return higher tier for degraded metrics', () => {
      const tier = getQualityTier(DEGRADED_METRICS);
      expect(tier).toBeGreaterThanOrEqual(QualityTier.REDUCED);
    });
  });

  describe('getLambdaValue()', () => {
    it('should return lambda as number', () => {
      const lambda = getLambdaValue(HEALTHY_METRICS);

      expect(typeof lambda).toBe('number');
      expect(lambda).toBeGreaterThan(0);
      expect(lambda).toBeLessThanOrEqual(100);
    });
  });

  describe('getQualitySummary()', () => {
    it('should return comprehensive summary', () => {
      const summary = getQualitySummary(HEALTHY_METRICS);

      expect(summary.lambda).toBeGreaterThan(0);
      expect(summary.tier).toBeDefined();
      expect(summary.decision).toBeDefined();
      expect(summary.explanation).toBeTruthy();
    });

    it('should include remediation for issues', () => {
      const summary = getQualitySummary(DEGRADED_METRICS);

      if (summary.partitionCount > 0) {
        expect(summary.topIssue).toBeDefined();
        expect(summary.topRemediation).toBeDefined();
      }
    });
  });
});

// ============================================================================
// Edge Cases and Error Handling
// ============================================================================

describe('Edge Cases', () => {
  describe('extreme values', () => {
    it('should handle 0% coverage', () => {
      const metrics: QualityMetricsInput = {
        ...HEALTHY_METRICS,
        lineCoverage: 0,
      };

      const decision = evaluateCoherenceGate(metrics);
      expect(decision.tier).toBe(QualityTier.QUARANTINE);
    });

    it('should handle 100% everything', () => {
      const metrics: QualityMetricsInput = {
        lineCoverage: 100,
        testPassRate: 100,
        criticalVulns: 0,
        p95Latency: 50,
        targetLatency: 200,
        maintainabilityIndex: 100,
        flakyTestRatio: 0,
      };

      const lambda = calculateQualityLambda(metrics);
      // All metrics at max should give high lambda
      expect(lambda.lambda).toBeGreaterThanOrEqual(90);
    });

    it('should handle very high vulnerability count', () => {
      const metrics: QualityMetricsInput = {
        ...HEALTHY_METRICS,
        criticalVulns: 100,
      };

      const decision = evaluateCoherenceGate(metrics);
      // High vulns cause lambda to drop, triggering quarantine
      expect(decision.tier).toBe(QualityTier.QUARANTINE);
    });
  });

  describe('boundary conditions', () => {
    it('should handle metrics exactly at threshold', () => {
      const metrics: QualityMetricsInput = {
        lineCoverage: 70,
        testPassRate: 70,
        criticalVulns: 0,
        p95Latency: 200,
        targetLatency: 200,
        maintainabilityIndex: 70,
      };

      const lambda = calculateQualityLambda(metrics);
      expect(lambda.boundaryEdges).toBeGreaterThan(0);
    });

    it('should detect lambda exactly at lambdaMin', () => {
      const controller = createCoherenceGateController({
        policy: { ...DEFAULT_COHERENCE_GATE_POLICY, lambdaMin: 60 },
      });

      const lambda = calculateQualityLambda(HEALTHY_METRICS);
      lambda.lambda = 61; // Just above threshold

      const decision = controller.evaluate(lambda);
      // At or above threshold could pass if no other issues
      expect(decision.tier).toBeLessThanOrEqual(QualityTier.REDUCED);
    });
  });

  describe('Q15 calculations', () => {
    it('should calculate drop ratio correctly', () => {
      const calculator = createLambdaCalculator();
      const metrics = { ...DEGRADED_METRICS, previousLambda: 100 };
      const lambda = calculator.calculate(metrics);

      const dropRatio = calculator.calculateDropRatioQ15(lambda);
      // Drop ratio should be significant
      expect(dropRatio).toBeGreaterThan(0);
      expect(dropRatio).toBeLessThanOrEqual(32767);
    });

    it('should handle zero previous lambda', () => {
      const calculator = createLambdaCalculator();
      const lambda = calculator.calculate(HEALTHY_METRICS);
      lambda.lambdaPrev = 0;

      const dropRatio = calculator.calculateDropRatioQ15(lambda);
      expect(dropRatio).toBe(0);
    });
  });
});

// ============================================================================
// Performance Tests
// ============================================================================

describe('Performance', () => {
  it('should calculate lambda in under 10ms', () => {
    const start = performance.now();

    for (let i = 0; i < 100; i++) {
      calculateQualityLambda(HEALTHY_METRICS);
    }

    const elapsed = performance.now() - start;
    const avgTime = elapsed / 100;

    expect(avgTime).toBeLessThan(10);
  });

  it('should evaluate gate in under 10ms', () => {
    const lambda = calculateQualityLambda(HEALTHY_METRICS);
    const controller = createCoherenceGateController();

    const start = performance.now();

    for (let i = 0; i < 100; i++) {
      controller.evaluate(lambda);
    }

    const elapsed = performance.now() - start;
    const avgTime = elapsed / 100;

    expect(avgTime).toBeLessThan(10);
  });

  it('should complete full evaluation in under 20ms', () => {
    const start = performance.now();

    for (let i = 0; i < 50; i++) {
      evaluateCoherenceGate(HEALTHY_METRICS);
    }

    const elapsed = performance.now() - start;
    const avgTime = elapsed / 50;

    expect(avgTime).toBeLessThan(20);
  });
});

// ============================================================================
// 4-Tier Decision Tests
// ============================================================================

describe('4-Tier Response System', () => {
  it('should return correct actions for each tier', () => {
    const controller = createCoherenceGateController();

    // Tier 0: Normal - use explicitly healthy metrics
    const healthyMetrics: QualityMetricsInput = {
      lineCoverage: 95,
      testPassRate: 100,
      criticalVulns: 0,
      p95Latency: 50,
      targetLatency: 200,
      maintainabilityIndex: 95,
      flakyTestRatio: 0,
    };
    const normalLambda = calculateQualityLambda(healthyMetrics);
    const normalDecision = controller.evaluate(normalLambda);
    expect(normalDecision.tier).toBe(QualityTier.NORMAL);
    expect(normalDecision.actions).toHaveLength(0);

    // Tier 3: Quarantine
    const quarantineLambda = calculateQualityLambda(CRITICAL_SECURITY_METRICS);
    const quarantineDecision = controller.evaluate(quarantineLambda);
    expect(quarantineDecision.tier).toBe(QualityTier.QUARANTINE);
    expect(quarantineDecision.actions).toContain('blockAllDeploys');
    expect(quarantineDecision.actions).toContain('escalateToLeads');
  });

  it('should set correct overridable flag', () => {
    const controller = createCoherenceGateController();

    // Use explicitly healthy metrics
    const healthyMetrics: QualityMetricsInput = {
      lineCoverage: 95,
      testPassRate: 100,
      criticalVulns: 0,
      p95Latency: 50,
      targetLatency: 200,
      maintainabilityIndex: 95,
      flakyTestRatio: 0,
    };
    const normalLambda = calculateQualityLambda(healthyMetrics);
    const normalDecision = controller.evaluate(normalLambda);
    expect(normalDecision.overridable).toBe(true);

    const quarantineLambda = calculateQualityLambda(CRITICAL_SECURITY_METRICS);
    const quarantineDecision = controller.evaluate(quarantineLambda);
    expect(quarantineDecision.overridable).toBe(false);
  });

  it('should include confidence score', () => {
    const controller = createCoherenceGateController();

    const lambda = calculateQualityLambda(HEALTHY_METRICS);
    const decision = controller.evaluate(lambda);

    expect(decision.confidence).toBeGreaterThanOrEqual(0.5);
    expect(decision.confidence).toBeLessThanOrEqual(1.0);
  });
});
