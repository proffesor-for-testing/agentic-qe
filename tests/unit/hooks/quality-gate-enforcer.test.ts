/**
 * Unit tests for QualityGateEnforcer
 *
 * Tests gate passing/blocking conditions, configurable thresholds,
 * multiple gate evaluation, and override mechanisms.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  QualityGateEnforcer,
  createQualityGateEnforcer,
  DEFAULT_QUALITY_GATE_CONFIG,
  type TaskResult,
  type TaskMetrics,
  type QualityGateConfig,
} from '../../../src/hooks/quality-gate-enforcer.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTaskResult(overrides: Partial<TaskResult> = {}): TaskResult {
  return {
    taskId: 'task-001',
    agentId: 'agent-001',
    domain: 'test-generation',
    type: 'unit-test',
    status: 'completed',
    output: {},
    metrics: {
      testsPassed: 10,
      testsFailed: 0,
      coverageChange: 0.05,
      securityIssues: 0,
      performanceMs: 1500,
    },
    duration: 2000,
    timestamp: Date.now(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('QualityGateEnforcer', () => {
  // -------------------------------------------------------------------------
  // Gate passing conditions
  // -------------------------------------------------------------------------

  describe('gate passing conditions', () => {
    it('should pass when all metrics meet default thresholds', () => {
      // Arrange
      const enforcer = new QualityGateEnforcer();
      const result = makeTaskResult();

      // Act
      const evaluation = enforcer.evaluate(result);

      // Assert
      expect(evaluation.passed).toBe(true);
      expect(evaluation.exitCode).toBe(0);
      expect(evaluation.score).toBeGreaterThanOrEqual(0.6);
    });

    it('should auto-pass when gates are disabled', () => {
      // Arrange
      const enforcer = new QualityGateEnforcer({ enabled: false });
      const result = makeTaskResult({ status: 'completed', metrics: { testsPassed: 0, testsFailed: 100 } });

      // Act
      const evaluation = enforcer.evaluate(result);

      // Assert
      expect(evaluation.passed).toBe(true);
      expect(evaluation.score).toBe(1.0);
      expect(evaluation.exitCode).toBe(0);
      expect(evaluation.reason).toBe('Quality gates disabled');
    });

    it('should return individual gate results with actual values', () => {
      // Arrange
      const enforcer = new QualityGateEnforcer();
      const result = makeTaskResult();

      // Act
      const evaluation = enforcer.evaluate(result);

      // Assert
      expect(evaluation.gates.length).toBe(DEFAULT_QUALITY_GATE_CONFIG.gates.length);
      for (const gate of evaluation.gates) {
        expect(gate).toHaveProperty('gate');
        expect(gate).toHaveProperty('passed');
        expect(gate).toHaveProperty('actual');
        expect(gate).toHaveProperty('threshold');
        expect(gate).toHaveProperty('weight');
      }
    });
  });

  // -------------------------------------------------------------------------
  // Gate blocking conditions
  // -------------------------------------------------------------------------

  describe('gate blocking conditions', () => {
    it('should fail when a required gate fails (test-pass-rate below threshold)', () => {
      // Arrange
      const enforcer = new QualityGateEnforcer();
      const result = makeTaskResult({
        metrics: {
          testsPassed: 2,
          testsFailed: 8,
          securityIssues: 0,
          performanceMs: 1000,
        },
      });

      // Act
      const evaluation = enforcer.evaluate(result);

      // Assert
      expect(evaluation.passed).toBe(false);
      expect(evaluation.exitCode).toBe(2);
      expect(evaluation.reason).toContain('Required gates failed');
      expect(evaluation.reason).toContain('test-pass-rate');
    });

    it('should fail with exit code 2 when task status is failed', () => {
      // Arrange
      const enforcer = new QualityGateEnforcer();
      const result = makeTaskResult({ status: 'failed' });

      // Act
      const evaluation = enforcer.evaluate(result);

      // Assert
      expect(evaluation.passed).toBe(false);
      expect(evaluation.exitCode).toBe(2);
      expect(evaluation.score).toBe(0);
      expect(evaluation.reason).toBe('Task reported failed status');
    });

    it('should fail when weighted score is below minQualityScore', () => {
      // Arrange
      const enforcer = new QualityGateEnforcer({
        minQualityScore: 0.95,
        gates: [
          { name: 'coverage', type: 'coverage', threshold: 0.8, weight: 1.0, required: false },
        ],
      });
      const result = makeTaskResult({
        metrics: { coverageChange: 0.5 },
      });

      // Act
      const evaluation = enforcer.evaluate(result);

      // Assert
      expect(evaluation.passed).toBe(false);
      expect(evaluation.score).toBeLessThan(0.95);
      expect(evaluation.reason).toContain('below minimum');
    });
  });

  // -------------------------------------------------------------------------
  // Configurable thresholds
  // -------------------------------------------------------------------------

  describe('configurable thresholds', () => {
    it('should use custom gate thresholds from constructor config', () => {
      // Arrange
      const enforcer = new QualityGateEnforcer({
        gates: [
          { name: 'coverage', type: 'coverage', threshold: 0.9, weight: 1.0, required: true },
        ],
        minQualityScore: 0.5,
      });
      const result = makeTaskResult({ metrics: { coverageChange: 0.85 } });

      // Act
      const evaluation = enforcer.evaluate(result);

      // Assert
      const coverageGate = evaluation.gates.find(g => g.gate === 'coverage');
      expect(coverageGate).toBeDefined();
      expect(coverageGate!.threshold).toBe(0.9);
      expect(coverageGate!.passed).toBe(false);
      expect(coverageGate!.actual).toBe(0.85);
    });

    it('should treat security gate as lower-is-better (actual <= threshold)', () => {
      // Arrange
      const enforcer = new QualityGateEnforcer({
        gates: [
          { name: 'security', type: 'security', threshold: 2, weight: 1.0, required: false },
        ],
        minQualityScore: 0.0,
      });

      // Act - 1 issue is within threshold of 2
      const passingResult = enforcer.evaluate(
        makeTaskResult({ metrics: { securityIssues: 1 } })
      );
      // Act - 5 issues exceeds threshold of 2
      const failingResult = enforcer.evaluate(
        makeTaskResult({ metrics: { securityIssues: 5 } })
      );

      // Assert
      expect(passingResult.gates[0].passed).toBe(true);
      expect(failingResult.gates[0].passed).toBe(false);
    });

    it('should treat performance gate as lower-is-better (actual <= threshold)', () => {
      // Arrange
      const enforcer = new QualityGateEnforcer({
        gates: [
          { name: 'perf', type: 'performance', threshold: 5000, weight: 1.0, required: false },
        ],
        minQualityScore: 0.0,
      });

      // Act
      const fast = enforcer.evaluate(makeTaskResult({ metrics: { performanceMs: 2000 } }));
      const slow = enforcer.evaluate(makeTaskResult({ metrics: { performanceMs: 10000 } }));

      // Assert
      expect(fast.gates[0].passed).toBe(true);
      expect(slow.gates[0].passed).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Multiple gate evaluation
  // -------------------------------------------------------------------------

  describe('multiple gate evaluation', () => {
    it('should evaluate all gates and compute weighted score', () => {
      // Arrange
      const enforcer = new QualityGateEnforcer({
        minQualityScore: 0.0,
        gates: [
          { name: 'tests', type: 'test-pass-rate', threshold: 0.8, weight: 0.5, required: false },
          { name: 'cov', type: 'coverage', threshold: 0.0, weight: 0.5, required: false },
        ],
      });
      const result = makeTaskResult({
        metrics: { testsPassed: 10, testsFailed: 0, coverageChange: 0.1 },
      });

      // Act
      const evaluation = enforcer.evaluate(result);

      // Assert
      expect(evaluation.gates).toHaveLength(2);
      expect(evaluation.gates.every(g => g.passed)).toBe(true);
      expect(evaluation.score).toBeCloseTo(1.0, 1);
    });

    it('should fail overall when one required gate fails even if score is high', () => {
      // Arrange
      const enforcer = new QualityGateEnforcer({
        minQualityScore: 0.0,
        gates: [
          { name: 'tests', type: 'test-pass-rate', threshold: 0.8, weight: 0.1, required: true },
          { name: 'cov', type: 'coverage', threshold: 0.0, weight: 0.9, required: false },
        ],
      });
      const result = makeTaskResult({
        metrics: { testsPassed: 1, testsFailed: 9, coverageChange: 1.0 },
      });

      // Act
      const evaluation = enforcer.evaluate(result);

      // Assert
      expect(evaluation.passed).toBe(false);
      expect(evaluation.reason).toContain('Required gates failed');
    });
  });

  // -------------------------------------------------------------------------
  // Gate override / rejectOnFailure
  // -------------------------------------------------------------------------

  describe('gate override mechanisms', () => {
    it('should return exitCode 0 when rejectOnFailure is false even on failure', () => {
      // Arrange
      const enforcer = new QualityGateEnforcer({
        rejectOnFailure: false,
        gates: [
          { name: 'tests', type: 'test-pass-rate', threshold: 0.99, weight: 1.0, required: true },
        ],
      });
      const result = makeTaskResult({
        metrics: { testsPassed: 5, testsFailed: 5 },
      });

      // Act
      const evaluation = enforcer.evaluate(result);

      // Assert
      expect(evaluation.passed).toBe(false);
      expect(evaluation.exitCode).toBe(0);
    });

    it('should return exitCode 0 for failed task status when rejectOnFailure is false', () => {
      // Arrange
      const enforcer = new QualityGateEnforcer({ rejectOnFailure: false });
      const result = makeTaskResult({ status: 'failed' });

      // Act
      const evaluation = enforcer.evaluate(result);

      // Assert
      expect(evaluation.passed).toBe(false);
      expect(evaluation.exitCode).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Factory and config access
  // -------------------------------------------------------------------------

  describe('createQualityGateEnforcer factory', () => {
    it('should create an enforcer with default config when no overrides given', () => {
      // Arrange & Act
      const enforcer = createQualityGateEnforcer();
      const config = enforcer.getConfig();

      // Assert
      expect(config.enabled).toBe(true);
      expect(config.minQualityScore).toBe(DEFAULT_QUALITY_GATE_CONFIG.minQualityScore);
      expect(config.gates).toHaveLength(DEFAULT_QUALITY_GATE_CONFIG.gates.length);
    });
  });

  // -------------------------------------------------------------------------
  // Custom gate type
  // -------------------------------------------------------------------------

  describe('custom gate type', () => {
    it('should read custom metric from task output by gate name', () => {
      // Arrange
      const enforcer = new QualityGateEnforcer({
        minQualityScore: 0.0,
        gates: [
          { name: 'complexity', type: 'custom', threshold: 5, weight: 1.0, required: false },
        ],
      });
      const result = makeTaskResult({
        output: { complexity: 3 },
      });

      // Act
      const evaluation = enforcer.evaluate(result);

      // Assert
      const gate = evaluation.gates.find(g => g.gate === 'complexity');
      expect(gate).toBeDefined();
      expect(gate!.actual).toBe(3);
      expect(gate!.passed).toBe(false); // 3 < 5 threshold (higher-is-better)
    });
  });
});
