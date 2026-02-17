/**
 * Unit tests for governance/compliance-reporter.ts
 *
 * Tests: violation recording, filtering, scoring, report generation,
 * alert thresholds, and statistics.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies before importing the module under test
vi.mock('../../../src/governance/feature-flags.js', () => ({
  governanceFlags: {
    getFlags: vi.fn().mockReturnValue({
      proofEnvelope: { enabled: false },
      global: { enableAllGates: true, logViolations: false },
    }),
  },
}));

vi.mock('../../../src/governance/proof-envelope-integration.js', () => ({
  proofEnvelopeIntegration: {
    isInitialized: vi.fn().mockReturnValue(true),
    initialize: vi.fn().mockResolvedValue(undefined),
    createSignedEnvelope: vi.fn().mockReturnValue({ id: 'env-mock-1' }),
    appendToChain: vi.fn(),
    getEnvelopeById: vi.fn().mockReturnValue(null),
  },
  ProofEnvelopeIntegration: vi.fn(),
}));

vi.mock('../../../src/kernel/unified-memory.js', () => ({
  getUnifiedMemory: vi.fn().mockReturnValue({
    isInitialized: () => true,
    initialize: vi.fn().mockResolvedValue(undefined),
    kvGet: vi.fn().mockResolvedValue(null),
    kvSet: vi.fn().mockResolvedValue(undefined),
  }),
}));

import {
  ComplianceReporter,
  createComplianceReporter,
  type ViolationType,
  type ViolationSeverity,
} from '../../../src/governance/compliance-reporter.js';

describe('ComplianceReporter', () => {
  let reporter: ComplianceReporter;

  beforeEach(() => {
    reporter = createComplianceReporter(undefined, {
      enabled: true,
      autoRecordViolations: true,
      retentionDays: 90,
      alertOnCritical: true,
      generateDailyReport: false,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ============================================================================
  // Violation Recording
  // ============================================================================

  describe('recordViolation', () => {
    it('should record a violation and return an id', () => {
      const id = reporter.recordViolation({
        type: 'loop_detected',
        severity: 'medium',
        gate: 'continueGate',
        description: 'Agent stuck in loop',
      });

      expect(id).toMatch(/^viol_/);
      const violation = reporter.getViolation(id);
      expect(violation).not.toBeNull();
      expect(violation!.type).toBe('loop_detected');
      expect(violation!.severity).toBe('medium');
      expect(violation!.resolved).toBe(false);
    });

    it('should set timestamp automatically', () => {
      const before = Date.now();
      const id = reporter.recordViolation({
        type: 'budget_exceeded',
        severity: 'high',
        gate: 'budgetMeter',
        description: 'Budget limit exceeded',
      });
      const after = Date.now();

      const violation = reporter.getViolation(id);
      expect(violation!.timestamp).toBeGreaterThanOrEqual(before);
      expect(violation!.timestamp).toBeLessThanOrEqual(after);
    });

    it('should record violation with optional agentId and context', () => {
      const id = reporter.recordViolation({
        type: 'trust_violation',
        severity: 'low',
        gate: 'trustAccumulator',
        description: 'Trust too low',
        agentId: 'agent-42',
        context: { taskId: 'task-1', score: 0.3 },
      });

      const violation = reporter.getViolation(id);
      expect(violation!.agentId).toBe('agent-42');
      expect(violation!.context).toEqual({ taskId: 'task-1', score: 0.3 });
    });
  });

  // ============================================================================
  // Violation Resolution
  // ============================================================================

  describe('resolveViolation', () => {
    it('should mark violation as resolved', () => {
      const id = reporter.recordViolation({
        type: 'contradiction',
        severity: 'medium',
        gate: 'memoryWriteGate',
        description: 'Contradictory pattern detected',
      });

      reporter.resolveViolation(id, 'Pattern updated with supersession marker');

      const violation = reporter.getViolation(id);
      expect(violation!.resolved).toBe(true);
      expect(violation!.resolution).toBe('Pattern updated with supersession marker');
      expect(violation!.resolvedAt).toBeDefined();
    });

    it('should throw for non-existent violation', () => {
      expect(() => reporter.resolveViolation('nonexistent', 'fix')).toThrow(
        'Violation not found: nonexistent'
      );
    });
  });

  // ============================================================================
  // Violation Filtering
  // ============================================================================

  describe('getViolations', () => {
    beforeEach(() => {
      reporter.recordViolation({ type: 'loop_detected', severity: 'medium', gate: 'continueGate', description: 'loop 1', agentId: 'agent-1' });
      reporter.recordViolation({ type: 'budget_exceeded', severity: 'critical', gate: 'budgetMeter', description: 'budget 1', agentId: 'agent-2' });
      reporter.recordViolation({ type: 'loop_detected', severity: 'high', gate: 'continueGate', description: 'loop 2', agentId: 'agent-1' });
    });

    it('should return all violations when no filter provided', () => {
      const violations = reporter.getViolations();
      expect(violations).toHaveLength(3);
    });

    it('should filter by type', () => {
      const violations = reporter.getViolations({ type: 'loop_detected' });
      expect(violations).toHaveLength(2);
      expect(violations.every(v => v.type === 'loop_detected')).toBe(true);
    });

    it('should filter by severity', () => {
      const violations = reporter.getViolations({ severity: 'critical' });
      expect(violations).toHaveLength(1);
      expect(violations[0].type).toBe('budget_exceeded');
    });

    it('should filter by agentId', () => {
      const violations = reporter.getViolations({ agentId: 'agent-1' });
      expect(violations).toHaveLength(2);
    });

    it('should filter by gate', () => {
      const violations = reporter.getViolations({ gate: 'budgetMeter' });
      expect(violations).toHaveLength(1);
    });

    it('should respect limit parameter', () => {
      const violations = reporter.getViolations({ limit: 1 });
      expect(violations).toHaveLength(1);
    });

    it('should sort results by timestamp descending', () => {
      const violations = reporter.getViolations();
      for (let i = 1; i < violations.length; i++) {
        expect(violations[i - 1].timestamp).toBeGreaterThanOrEqual(violations[i].timestamp);
      }
    });
  });

  // ============================================================================
  // Compliance Scoring
  // ============================================================================

  describe('calculateScore', () => {
    it('should return 100 when no violations exist', () => {
      const score = reporter.calculateScore();
      expect(score.overall).toBe(100);
      expect(score.totalViolations).toBe(0);
    });

    it('should decrease score for unresolved violations', () => {
      reporter.recordViolation({
        type: 'loop_detected',
        severity: 'high',
        gate: 'continueGate',
        description: 'loop detected',
      });

      const score = reporter.calculateScore();
      expect(score.overall).toBeLessThan(100);
      expect(score.totalViolations).toBe(1);
    });

    it('should score resolved violations less harshly', () => {
      const id = reporter.recordViolation({
        type: 'loop_detected',
        severity: 'high',
        gate: 'continueGate',
        description: 'loop detected',
      });

      const unresolvedScore = reporter.calculateScore().overall;

      reporter.resolveViolation(id, 'Fixed');
      const resolvedScore = reporter.calculateScore().overall;

      expect(resolvedScore).toBeGreaterThan(unresolvedScore);
    });

    it('should include score breakdown by gate', () => {
      reporter.recordViolation({ type: 'loop_detected', severity: 'medium', gate: 'continueGate', description: 'loop' });
      reporter.recordViolation({ type: 'budget_exceeded', severity: 'high', gate: 'budgetMeter', description: 'budget' });

      const score = reporter.calculateScore();
      expect(score.byGate).toHaveProperty('continueGate');
      expect(score.byGate).toHaveProperty('budgetMeter');
      expect(score.byGate['continueGate']).toBeLessThan(100);
    });

    it('should return trend information', () => {
      const score = reporter.calculateScore();
      expect(['improving', 'stable', 'declining']).toContain(score.trend);
    });
  });

  // ============================================================================
  // Report Generation
  // ============================================================================

  describe('generateReport', () => {
    it('should generate a report with summary', () => {
      reporter.recordViolation({ type: 'loop_detected', severity: 'medium', gate: 'continueGate', description: 'loop' });

      const report = reporter.generateReport();

      expect(report.generatedAt).toBeDefined();
      expect(report.timeWindow).toBeDefined();
      expect(report.summary).toBeDefined();
      expect(report.summary.totalViolations).toBe(1);
      expect(report.summary.overallScore).toBeLessThan(100);
    });

    it('should include violations by type and severity counts', () => {
      reporter.recordViolation({ type: 'loop_detected', severity: 'medium', gate: 'continueGate', description: 'loop' });
      reporter.recordViolation({ type: 'budget_exceeded', severity: 'critical', gate: 'budgetMeter', description: 'budget' });

      const report = reporter.generateReport();

      expect(report.violationsByType.loop_detected).toBe(1);
      expect(report.violationsByType.budget_exceeded).toBe(1);
      expect(report.violationsBySeverity.medium).toBe(1);
      expect(report.violationsBySeverity.critical).toBe(1);
    });

    it('should include detailed violations when requested', () => {
      reporter.recordViolation({ type: 'loop_detected', severity: 'medium', gate: 'continueGate', description: 'loop' });

      const report = reporter.generateReport({ includeViolations: true });
      expect(report.violations).toBeDefined();
      expect(report.violations!.length).toBeGreaterThan(0);
    });

    it('should include recommendations when requested', () => {
      reporter.recordViolation({ type: 'adversarial_detected', severity: 'critical', gate: 'adversarialDefense', description: 'threat' });

      const report = reporter.generateReport({ includeRecommendations: true });
      expect(report.recommendations).toBeDefined();
      expect(report.recommendations!.length).toBeGreaterThan(0);
    });

    it('should include trend analysis when requested', () => {
      const report = reporter.generateReport({ includeTrendAnalysis: true });
      expect(report.trendAnalysis).toBeDefined();
      expect(report.trendAnalysis!.currentPeriodScore).toBeDefined();
    });
  });

  // ============================================================================
  // Report Export
  // ============================================================================

  describe('exportReport', () => {
    it('should export report as JSON', () => {
      reporter.recordViolation({ type: 'loop_detected', severity: 'medium', gate: 'continueGate', description: 'loop' });
      const report = reporter.generateReport();

      const json = reporter.exportReport(report, 'json');
      const parsed = JSON.parse(json);
      expect(parsed.summary.totalViolations).toBe(1);
    });

    it('should export report as markdown', () => {
      reporter.recordViolation({ type: 'loop_detected', severity: 'medium', gate: 'continueGate', description: 'loop' });
      const report = reporter.generateReport();

      const md = reporter.exportReport(report, 'markdown');
      expect(md).toContain('# Compliance Report');
      expect(md).toContain('Executive Summary');
    });
  });

  // ============================================================================
  // Alert Thresholds
  // ============================================================================

  describe('alerts', () => {
    it('should set and get alert thresholds', () => {
      reporter.setAlertThreshold('testGate', 75);
      expect(reporter.getAlertThreshold('testGate')).toBe(75);
    });

    it('should reject invalid threshold values', () => {
      expect(() => reporter.setAlertThreshold('gate', -1)).toThrow();
      expect(() => reporter.setAlertThreshold('gate', 101)).toThrow();
    });

    it('should notify alert listeners on critical violations', () => {
      const listener = vi.fn();
      reporter.onAlert(listener);

      reporter.recordViolation({
        type: 'adversarial_detected',
        severity: 'critical',
        gate: 'adversarialDefense',
        description: 'Critical threat detected',
      });

      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  // ============================================================================
  // Statistics
  // ============================================================================

  describe('getComplianceStats', () => {
    it('should return zero stats when empty', () => {
      const stats = reporter.getComplianceStats();
      expect(stats.totalViolations).toBe(0);
      expect(stats.resolvedViolations).toBe(0);
      expect(stats.resolutionRate).toBe(1); // No violations = 100% compliant
      expect(stats.currentScore).toBe(100);
    });

    it('should compute comprehensive stats after violations', () => {
      const id1 = reporter.recordViolation({ type: 'loop_detected', severity: 'medium', gate: 'continueGate', description: 'loop 1', agentId: 'a1' });
      reporter.recordViolation({ type: 'budget_exceeded', severity: 'high', gate: 'budgetMeter', description: 'budget 1', agentId: 'a2' });
      reporter.resolveViolation(id1, 'Fixed');

      const stats = reporter.getComplianceStats();
      expect(stats.totalViolations).toBe(2);
      expect(stats.resolvedViolations).toBe(1);
      expect(stats.resolutionRate).toBe(0.5);
      expect(stats.byType.loop_detected).toBe(1);
      expect(stats.byType.budget_exceeded).toBe(1);
      expect(stats.bySeverity.medium).toBe(1);
      expect(stats.bySeverity.high).toBe(1);
      expect(stats.byGate['continueGate']).toBe(1);
      expect(stats.byAgent['a1']).toBe(1);
      expect(stats.byAgent['a2']).toBe(1);
    });
  });

  // ============================================================================
  // Maintenance
  // ============================================================================

  describe('clearViolations / reset', () => {
    it('should clear all violations', () => {
      reporter.recordViolation({ type: 'loop_detected', severity: 'low', gate: 'continueGate', description: 'test' });
      expect(reporter.getViolations()).toHaveLength(1);

      reporter.clearViolations();
      expect(reporter.getViolations()).toHaveLength(0);
    });

    it('should fully reset reporter state', () => {
      reporter.recordViolation({ type: 'loop_detected', severity: 'low', gate: 'continueGate', description: 'test' });
      reporter.setAlertThreshold('myGate', 50);

      reporter.reset();

      expect(reporter.getViolations()).toHaveLength(0);
      expect(reporter.getAlertThreshold('myGate')).toBeUndefined();
      expect(reporter.isInitialized()).toBe(false);
    });
  });
});
