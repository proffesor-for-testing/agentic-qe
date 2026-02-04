/**
 * Integration tests for Compliance Reporter governance audits
 *
 * Tests verify:
 * - Violation recording and tracking
 * - Compliance score calculation
 * - Report generation (JSON and Markdown)
 * - Proof envelope integration
 * - Alert thresholds and notifications
 * - Statistics and analytics
 *
 * @see ADR-058-guidance-governance-integration.md
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  ComplianceReporter,
  complianceReporter,
  createComplianceReporter,
  DEFAULT_COMPLIANCE_REPORTER_FLAGS,
  type ViolationType,
  type ViolationSeverity,
  type ComplianceViolation,
  type ComplianceScore,
  type ComplianceReport,
  type Alert,
} from '../../../src/governance/compliance-reporter.js';
import {
  ProofEnvelopeIntegration,
  createProofEnvelopeIntegration,
} from '../../../src/governance/proof-envelope-integration.js';
import { governanceFlags, isComplianceReporterEnabled } from '../../../src/governance/feature-flags.js';

describe('Compliance Reporter Integration', () => {
  let reporter: ComplianceReporter;
  let proofIntegration: ProofEnvelopeIntegration;
  const testSigningKey = 'test-compliance-key-12345';

  beforeEach(async () => {
    proofIntegration = createProofEnvelopeIntegration();
    await proofIntegration.initialize(testSigningKey);

    reporter = createComplianceReporter(proofIntegration);
    await reporter.initialize();
  });

  afterEach(() => {
    reporter.reset();
    proofIntegration.reset();
  });

  describe('Initialization', () => {
    it('should initialize correctly', async () => {
      const newReporter = createComplianceReporter();
      expect(newReporter.isInitialized()).toBe(false);

      await newReporter.initialize();
      expect(newReporter.isInitialized()).toBe(true);

      newReporter.reset();
    });

    it('should handle multiple initialize calls idempotently', async () => {
      const newReporter = createComplianceReporter();
      await newReporter.initialize();
      await newReporter.initialize();

      expect(newReporter.isInitialized()).toBe(true);
      newReporter.reset();
    });

    it('should use provided proof integration', async () => {
      const customProof = createProofEnvelopeIntegration();
      await customProof.initialize();

      const customReporter = createComplianceReporter(customProof);
      await customReporter.initialize();

      expect(customReporter.isInitialized()).toBe(true);

      customProof.reset();
      customReporter.reset();
    });

    it('should use singleton instance correctly', async () => {
      await complianceReporter.initialize();
      expect(complianceReporter).toBeInstanceOf(ComplianceReporter);
      complianceReporter.reset();
    });

    it('should return feature flags', () => {
      const flags = reporter.getFlags();
      expect(flags).toHaveProperty('enabled');
      expect(flags).toHaveProperty('autoRecordViolations');
      expect(flags).toHaveProperty('retentionDays');
      expect(flags).toHaveProperty('alertOnCritical');
      expect(flags).toHaveProperty('generateDailyReport');
    });

    it('should have default flags', () => {
      expect(DEFAULT_COMPLIANCE_REPORTER_FLAGS.enabled).toBe(true);
      expect(DEFAULT_COMPLIANCE_REPORTER_FLAGS.autoRecordViolations).toBe(true);
      expect(DEFAULT_COMPLIANCE_REPORTER_FLAGS.retentionDays).toBe(90);
      expect(DEFAULT_COMPLIANCE_REPORTER_FLAGS.alertOnCritical).toBe(true);
      expect(DEFAULT_COMPLIANCE_REPORTER_FLAGS.generateDailyReport).toBe(false);
    });

    it('should update flags', () => {
      reporter.updateFlags({ retentionDays: 30 });
      expect(reporter.getFlags().retentionDays).toBe(30);
    });
  });

  describe('Violation Recording', () => {
    it('should record a violation', () => {
      const id = reporter.recordViolation({
        type: 'loop_detected',
        severity: 'medium',
        gate: 'continueGate',
        description: 'Agent stuck in retry loop',
        agentId: 'test-agent-1',
      });

      expect(id).toMatch(/^viol_[a-z0-9]+_[a-z0-9]+$/);

      const violation = reporter.getViolation(id);
      expect(violation).not.toBeNull();
      expect(violation?.type).toBe('loop_detected');
      expect(violation?.severity).toBe('medium');
      expect(violation?.gate).toBe('continueGate');
      expect(violation?.agentId).toBe('test-agent-1');
      expect(violation?.resolved).toBe(false);
      expect(violation?.timestamp).toBeGreaterThan(0);
    });

    it('should record violation with context', () => {
      const id = reporter.recordViolation({
        type: 'budget_exceeded',
        severity: 'high',
        gate: 'budgetMeter',
        description: 'Token budget exceeded',
        context: {
          budget: 1000,
          used: 1500,
          overage: 500,
        },
      });

      const violation = reporter.getViolation(id);
      expect(violation?.context).toEqual({
        budget: 1000,
        used: 1500,
        overage: 500,
      });
    });

    it('should create proof envelope for violation', () => {
      const id = reporter.recordViolation({
        type: 'trust_violation',
        severity: 'high',
        gate: 'trustAccumulator',
        description: 'Low trust agent attempted critical task',
        agentId: 'untrusted-agent',
      });

      const violation = reporter.getViolation(id);
      expect(violation?.proofEnvelopeId).toBeDefined();

      const envelope = proofIntegration.getEnvelopeById(violation!.proofEnvelopeId!);
      expect(envelope).not.toBeNull();
      expect(envelope?.action).toBe('violation_recorded');
    });

    it('should resolve violation', () => {
      const id = reporter.recordViolation({
        type: 'contradiction',
        severity: 'low',
        gate: 'memoryWriteGate',
        description: 'Conflicting pattern detected',
      });

      reporter.resolveViolation(id, 'Removed conflicting pattern');

      const violation = reporter.getViolation(id);
      expect(violation?.resolved).toBe(true);
      expect(violation?.resolution).toBe('Removed conflicting pattern');
      expect(violation?.resolvedAt).toBeGreaterThan(0);
    });

    it('should throw when resolving non-existent violation', () => {
      expect(() => reporter.resolveViolation('invalid-id', 'resolution'))
        .toThrow(/Violation not found/);
    });

    it('should return null for non-existent violation', () => {
      expect(reporter.getViolation('invalid-id')).toBeNull();
    });

    it('should record all violation types', () => {
      const types: ViolationType[] = [
        'loop_detected',
        'contradiction',
        'trust_violation',
        'budget_exceeded',
        'adversarial_detected',
        'invariant_violated',
        'unauthorized_access',
        'chain_tampered',
        'schema_violation',
        'rate_limit_exceeded',
      ];

      for (const type of types) {
        const id = reporter.recordViolation({
          type,
          severity: 'low',
          gate: 'testGate',
          description: `Test ${type}`,
        });
        expect(reporter.getViolation(id)?.type).toBe(type);
      }
    });

    it('should record all severity levels', () => {
      const severities: ViolationSeverity[] = ['low', 'medium', 'high', 'critical'];

      for (const severity of severities) {
        const id = reporter.recordViolation({
          type: 'loop_detected',
          severity,
          gate: 'testGate',
          description: `Test ${severity}`,
        });
        expect(reporter.getViolation(id)?.severity).toBe(severity);
      }
    });
  });

  describe('Violation Filtering', () => {
    beforeEach(() => {
      // Create a diverse set of violations
      const violations = [
        { type: 'loop_detected', severity: 'low', gate: 'continueGate', agentId: 'agent-1' },
        { type: 'contradiction', severity: 'medium', gate: 'memoryWriteGate', agentId: 'agent-1' },
        { type: 'trust_violation', severity: 'high', gate: 'trustAccumulator', agentId: 'agent-2' },
        { type: 'budget_exceeded', severity: 'critical', gate: 'budgetMeter', agentId: 'agent-2' },
        { type: 'adversarial_detected', severity: 'critical', gate: 'adversarialDefense', agentId: 'agent-3' },
      ] as const;

      for (const v of violations) {
        reporter.recordViolation({
          type: v.type,
          severity: v.severity,
          gate: v.gate,
          agentId: v.agentId,
          description: `Test violation: ${v.type}`,
        });
      }

      // Resolve one violation
      const allViols = reporter.getViolations();
      reporter.resolveViolation(allViols[0].id, 'Resolved');
    });

    it('should get all violations', () => {
      const violations = reporter.getViolations();
      expect(violations).toHaveLength(5);
    });

    it('should filter by type', () => {
      const violations = reporter.getViolations({ type: 'loop_detected' });
      expect(violations).toHaveLength(1);
      expect(violations[0].type).toBe('loop_detected');
    });

    it('should filter by severity', () => {
      const violations = reporter.getViolations({ severity: 'critical' });
      expect(violations).toHaveLength(2);
      violations.forEach(v => expect(v.severity).toBe('critical'));
    });

    it('should filter by agent', () => {
      const violations = reporter.getViolations({ agentId: 'agent-1' });
      expect(violations).toHaveLength(2);
      violations.forEach(v => expect(v.agentId).toBe('agent-1'));
    });

    it('should filter by gate', () => {
      const violations = reporter.getViolations({ gate: 'budgetMeter' });
      expect(violations).toHaveLength(1);
      expect(violations[0].gate).toBe('budgetMeter');
    });

    it('should filter by resolved status', () => {
      const resolved = reporter.getViolations({ resolved: true });
      expect(resolved).toHaveLength(1);

      const unresolved = reporter.getViolations({ resolved: false });
      expect(unresolved).toHaveLength(4);
    });

    it('should filter by time range', () => {
      const now = Date.now();
      const violations = reporter.getViolations({
        startTime: now - 1000,
        endTime: now + 1000,
      });
      expect(violations).toHaveLength(5);

      const oldViolations = reporter.getViolations({
        startTime: 0,
        endTime: now - 10000,
      });
      expect(oldViolations).toHaveLength(0);
    });

    it('should limit results', () => {
      const violations = reporter.getViolations({ limit: 2 });
      expect(violations).toHaveLength(2);
    });

    it('should combine multiple filters', () => {
      const violations = reporter.getViolations({
        agentId: 'agent-2',
        resolved: false,
      });
      expect(violations).toHaveLength(2);
    });

    it('should sort by timestamp descending', () => {
      const violations = reporter.getViolations();
      for (let i = 1; i < violations.length; i++) {
        expect(violations[i - 1].timestamp).toBeGreaterThanOrEqual(violations[i].timestamp);
      }
    });
  });

  describe('Compliance Scoring', () => {
    it('should return perfect score with no violations', () => {
      const score = reporter.calculateScore();
      expect(score.overall).toBe(100);
      expect(score.totalViolations).toBe(0);
    });

    it('should decrease score with violations', () => {
      reporter.recordViolation({
        type: 'loop_detected',
        severity: 'medium',
        gate: 'continueGate',
        description: 'Test violation',
      });

      const score = reporter.calculateScore();
      expect(score.overall).toBeLessThan(100);
      expect(score.totalViolations).toBe(1);
    });

    it('should weight severity correctly', () => {
      // Low severity
      reporter.recordViolation({
        type: 'loop_detected',
        severity: 'low',
        gate: 'gateA',
        description: 'Low severity',
      });
      const lowScore = reporter.calculateScore();
      reporter.clearViolations();

      // High severity
      reporter.recordViolation({
        type: 'loop_detected',
        severity: 'high',
        gate: 'gateA',
        description: 'High severity',
      });
      const highScore = reporter.calculateScore();
      reporter.clearViolations();

      // Critical severity
      reporter.recordViolation({
        type: 'loop_detected',
        severity: 'critical',
        gate: 'gateA',
        description: 'Critical severity',
      });
      const criticalScore = reporter.calculateScore();

      expect(lowScore.overall).toBeGreaterThan(highScore.overall);
      expect(highScore.overall).toBeGreaterThan(criticalScore.overall);
    });

    it('should calculate score by gate', () => {
      reporter.recordViolation({
        type: 'loop_detected',
        severity: 'medium',
        gate: 'continueGate',
        description: 'Gate A violation',
      });
      reporter.recordViolation({
        type: 'budget_exceeded',
        severity: 'high',
        gate: 'budgetMeter',
        description: 'Gate B violation',
      });

      const score = reporter.calculateScore();
      expect(score.byGate['continueGate']).toBeDefined();
      expect(score.byGate['budgetMeter']).toBeDefined();
      expect(score.byGate['continueGate']).toBeGreaterThan(score.byGate['budgetMeter']);
    });

    it('should calculate score by agent', () => {
      reporter.recordViolation({
        type: 'loop_detected',
        severity: 'low',
        gate: 'continueGate',
        agentId: 'good-agent',
        description: 'Minor issue',
      });
      reporter.recordViolation({
        type: 'trust_violation',
        severity: 'critical',
        gate: 'trustAccumulator',
        agentId: 'bad-agent',
        description: 'Major issue',
      });

      const score = reporter.calculateScore();
      expect(score.byAgent['good-agent']).toBeGreaterThan(score.byAgent['bad-agent']);
    });

    it('should use custom time window', () => {
      const now = Date.now();
      reporter.recordViolation({
        type: 'loop_detected',
        severity: 'medium',
        gate: 'continueGate',
        description: 'Test',
      });

      const futureScore = reporter.calculateScore({
        start: now + 10000,
        end: now + 20000,
      });
      expect(futureScore.totalViolations).toBe(0);
      expect(futureScore.overall).toBe(100);
    });

    it('should count resolved violations for half', () => {
      const id = reporter.recordViolation({
        type: 'loop_detected',
        severity: 'high',
        gate: 'continueGate',
        description: 'Test',
      });
      const unresolvedScore = reporter.calculateScore();

      reporter.resolveViolation(id, 'Fixed');
      const resolvedScore = reporter.calculateScore();

      expect(resolvedScore.overall).toBeGreaterThan(unresolvedScore.overall);
      expect(resolvedScore.resolvedViolations).toBe(1);
    });

    it('should track score history', () => {
      reporter.calculateScore();
      reporter.recordViolation({
        type: 'loop_detected',
        severity: 'medium',
        gate: 'continueGate',
        description: 'Test',
      });
      reporter.calculateScore();

      const history = reporter.getScoreHistory(5);
      expect(history.length).toBeGreaterThanOrEqual(2);
    });

    it('should calculate trend', () => {
      const score = reporter.calculateScore();
      expect(['improving', 'stable', 'declining']).toContain(score.trend);
    });
  });

  describe('Report Generation', () => {
    beforeEach(() => {
      // Create violations for report
      reporter.recordViolation({
        type: 'loop_detected',
        severity: 'low',
        gate: 'continueGate',
        agentId: 'agent-1',
        description: 'Agent retry loop',
      });
      reporter.recordViolation({
        type: 'budget_exceeded',
        severity: 'critical',
        gate: 'budgetMeter',
        agentId: 'agent-2',
        description: 'Budget overrun',
      });
      reporter.recordViolation({
        type: 'adversarial_detected',
        severity: 'high',
        gate: 'adversarialDefense',
        agentId: 'agent-3',
        description: 'Possible injection',
      });
    });

    it('should generate basic report', () => {
      const report = reporter.generateReport();

      expect(report.generatedAt).toBeGreaterThan(0);
      expect(report.timeWindow).toBeDefined();
      expect(report.summary.totalViolations).toBe(3);
      expect(report.summary.criticalViolations).toBe(1);
      expect(report.summary.highViolations).toBe(1);
      expect(report.gateScores).toBeDefined();
      expect(report.violationsByType).toBeDefined();
      expect(report.violationsBySeverity).toBeDefined();
    });

    it('should include agent rankings when requested', () => {
      const report = reporter.generateReport({ includeAgentRankings: true });

      expect(report.agentRankings).toBeDefined();
      expect(report.agentRankings!.length).toBe(3);
      expect(report.agentRankings![0]).toHaveProperty('agentId');
      expect(report.agentRankings![0]).toHaveProperty('score');
      expect(report.agentRankings![0]).toHaveProperty('violations');
      expect(report.agentRankings![0]).toHaveProperty('trend');
    });

    it('should include violations when requested', () => {
      const report = reporter.generateReport({ includeViolations: true });

      expect(report.violations).toBeDefined();
      expect(report.violations!.length).toBe(3);
    });

    it('should limit violations', () => {
      const report = reporter.generateReport({
        includeViolations: true,
        maxViolations: 2,
      });

      expect(report.violations).toHaveLength(2);
    });

    it('should include recommendations when requested', () => {
      const report = reporter.generateReport({ includeRecommendations: true });

      expect(report.recommendations).toBeDefined();
      expect(report.recommendations!.length).toBeGreaterThan(0);
    });

    it('should include trend analysis when requested', () => {
      const report = reporter.generateReport({ includeTrendAnalysis: true });

      expect(report.trendAnalysis).toBeDefined();
      expect(report.trendAnalysis!).toHaveProperty('currentPeriodScore');
      expect(report.trendAnalysis!).toHaveProperty('previousPeriodScore');
      expect(report.trendAnalysis!).toHaveProperty('change');
      expect(report.trendAnalysis!).toHaveProperty('violationTrend');
    });

    it('should use custom time window', () => {
      const now = Date.now();
      const report = reporter.generateReport({
        timeWindow: {
          start: now - 1000,
          end: now + 1000,
        },
      });

      expect(report.timeWindow.start).toBe(now - 1000);
      expect(report.timeWindow.end).toBe(now + 1000);
    });

    it('should export report as JSON', () => {
      const report = reporter.generateReport();
      const json = reporter.exportReport(report, 'json');

      const parsed = JSON.parse(json);
      expect(parsed.generatedAt).toBe(report.generatedAt);
      expect(parsed.summary).toEqual(report.summary);
    });

    it('should export report as Markdown', () => {
      const report = reporter.generateReport({
        includeViolations: true,
        includeAgentRankings: true,
        includeRecommendations: true,
        includeTrendAnalysis: true,
      });
      const markdown = reporter.exportReport(report, 'markdown');

      expect(markdown).toContain('# Compliance Report');
      expect(markdown).toContain('## Executive Summary');
      expect(markdown).toContain('## Gate Compliance Scores');
      expect(markdown).toContain('## Violations by Type');
      expect(markdown).toContain('## Violations by Severity');
      expect(markdown).toContain('## Agent Compliance Rankings');
      expect(markdown).toContain('## Recommendations');
      expect(markdown).toContain('## Trend Analysis');
    });

    it('should generate recommendations for critical violations', () => {
      const report = reporter.generateReport({ includeRecommendations: true });

      const hasUrgent = report.recommendations!.some(r => r.includes('URGENT'));
      expect(hasUrgent).toBe(true);
    });

    it('should count violations by type correctly', () => {
      const report = reporter.generateReport();

      expect(report.violationsByType.loop_detected).toBe(1);
      expect(report.violationsByType.budget_exceeded).toBe(1);
      expect(report.violationsByType.adversarial_detected).toBe(1);
      expect(report.violationsByType.contradiction).toBe(0);
    });

    it('should count violations by severity correctly', () => {
      const report = reporter.generateReport();

      expect(report.violationsBySeverity.low).toBe(1);
      expect(report.violationsBySeverity.medium).toBe(0);
      expect(report.violationsBySeverity.high).toBe(1);
      expect(report.violationsBySeverity.critical).toBe(1);
    });
  });

  describe('Proof Integration', () => {
    it('should attach proof to violation', () => {
      const violationId = reporter.recordViolation({
        type: 'loop_detected',
        severity: 'medium',
        gate: 'continueGate',
        description: 'Test',
      });

      const envelope = proofIntegration.createSignedEnvelope(
        'system',
        'manual_proof',
        { reason: 'Additional evidence' }
      );
      proofIntegration.appendToChain(envelope);

      reporter.attachProof(violationId, envelope.id);

      const violation = reporter.getViolation(violationId);
      expect(violation?.proofEnvelopeId).toBe(envelope.id);
    });

    it('should throw when attaching proof to non-existent violation', () => {
      const envelope = proofIntegration.createSignedEnvelope('system', 'test', {});
      proofIntegration.appendToChain(envelope);

      expect(() => reporter.attachProof('invalid-id', envelope.id))
        .toThrow(/Violation not found/);
    });

    it('should throw when attaching non-existent proof', () => {
      const violationId = reporter.recordViolation({
        type: 'loop_detected',
        severity: 'medium',
        gate: 'continueGate',
        description: 'Test',
      });

      expect(() => reporter.attachProof(violationId, 'invalid-envelope-id'))
        .toThrow(/Proof envelope not found/);
    });

    it('should get violations with proof', () => {
      // Record a violation (auto-creates proof)
      reporter.recordViolation({
        type: 'loop_detected',
        severity: 'medium',
        gate: 'continueGate',
        description: 'With proof',
      });

      const violationsWithProof = reporter.getViolationsWithProof();
      expect(violationsWithProof.length).toBeGreaterThan(0);
      violationsWithProof.forEach(v => {
        expect(v.proofEnvelopeId).toBeDefined();
      });
    });

    it('should get proof envelope for violation', () => {
      const violationId = reporter.recordViolation({
        type: 'trust_violation',
        severity: 'high',
        gate: 'trustAccumulator',
        description: 'Test with proof',
      });

      const violation = reporter.getViolation(violationId);
      expect(violation?.proofEnvelopeId).toBeDefined();

      const envelope = proofIntegration.getEnvelopeById(violation!.proofEnvelopeId!);
      expect(envelope).not.toBeNull();
      expect(envelope?.payload).toHaveProperty('violationId', violationId);
    });
  });

  describe('Alerts', () => {
    it('should set alert threshold', () => {
      reporter.setAlertThreshold('continueGate', 80);
      expect(reporter.getAlertThreshold('continueGate')).toBe(80);
    });

    it('should throw for invalid threshold', () => {
      expect(() => reporter.setAlertThreshold('gate', -1)).toThrow(/between 0 and 100/);
      expect(() => reporter.setAlertThreshold('gate', 101)).toThrow(/between 0 and 100/);
    });

    it('should check alerts', () => {
      reporter.setAlertThreshold('testGate', 90);

      // Create violations to lower score
      for (let i = 0; i < 5; i++) {
        reporter.recordViolation({
          type: 'loop_detected',
          severity: 'high',
          gate: 'testGate',
          description: `Violation ${i}`,
        });
      }

      const alerts = reporter.checkAlerts();
      const testGateAlert = alerts.find(a => a.gate === 'testGate');

      if (testGateAlert) {
        expect(testGateAlert.currentScore).toBeLessThan(90);
        expect(testGateAlert.threshold).toBe(90);
      }
    });

    it('should notify alert listeners', async () => {
      const alerts: Alert[] = [];
      const unsubscribe = reporter.onAlert(alert => alerts.push(alert));

      reporter.setAlertThreshold('alertGate', 95);

      // Create high severity violation
      for (let i = 0; i < 3; i++) {
        reporter.recordViolation({
          type: 'budget_exceeded',
          severity: 'critical',
          gate: 'alertGate',
          description: 'Critical violation',
        });
      }

      reporter.checkAlerts();

      // Unsubscribe
      unsubscribe();

      // Critical violations trigger immediate alerts
      expect(alerts.length).toBeGreaterThan(0);
    });

    it('should have default alert thresholds', () => {
      // Defaults are set during initialization
      expect(reporter.getAlertThreshold('continueGate')).toBe(70);
      expect(reporter.getAlertThreshold('budgetMeter')).toBe(60);
    });
  });

  describe('Statistics', () => {
    beforeEach(() => {
      // Create diverse violations
      const id1 = reporter.recordViolation({
        type: 'loop_detected',
        severity: 'low',
        gate: 'continueGate',
        agentId: 'agent-1',
        description: 'Loop 1',
      });
      reporter.recordViolation({
        type: 'loop_detected',
        severity: 'medium',
        gate: 'continueGate',
        agentId: 'agent-1',
        description: 'Loop 2',
      });
      reporter.recordViolation({
        type: 'trust_violation',
        severity: 'high',
        gate: 'trustAccumulator',
        agentId: 'agent-2',
        description: 'Trust issue',
      });

      // Resolve one
      reporter.resolveViolation(id1, 'Fixed');
    });

    it('should get comprehensive stats', () => {
      const stats = reporter.getComplianceStats();

      expect(stats.totalViolations).toBe(3);
      expect(stats.resolvedViolations).toBe(1);
      expect(stats.resolutionRate).toBeCloseTo(1 / 3, 2);
    });

    it('should count by type', () => {
      const stats = reporter.getComplianceStats();

      expect(stats.byType.loop_detected).toBe(2);
      expect(stats.byType.trust_violation).toBe(1);
      expect(stats.byType.contradiction).toBe(0);
    });

    it('should count by severity', () => {
      const stats = reporter.getComplianceStats();

      expect(stats.bySeverity.low).toBe(1);
      expect(stats.bySeverity.medium).toBe(1);
      expect(stats.bySeverity.high).toBe(1);
      expect(stats.bySeverity.critical).toBe(0);
    });

    it('should count by gate', () => {
      const stats = reporter.getComplianceStats();

      expect(stats.byGate.continueGate).toBe(2);
      expect(stats.byGate.trustAccumulator).toBe(1);
    });

    it('should count by agent', () => {
      const stats = reporter.getComplianceStats();

      expect(stats.byAgent['agent-1']).toBe(2);
      expect(stats.byAgent['agent-2']).toBe(1);
    });

    it('should track violations with proof', () => {
      const stats = reporter.getComplianceStats();

      // All violations should have proof (auto-created)
      expect(stats.violationsWithProof).toBe(3);
    });

    it('should calculate average resolution time', () => {
      const stats = reporter.getComplianceStats();

      // We resolved one violation
      expect(stats.avgResolutionTime).toBeGreaterThanOrEqual(0);
    });

    it('should include current score', () => {
      const stats = reporter.getComplianceStats();

      expect(stats.currentScore).toBeLessThan(100);
      expect(stats.currentScore).toBeGreaterThan(0);
    });
  });

  describe('Feature Flags', () => {
    it('should check if compliance reporter is enabled', () => {
      const isEnabled = isComplianceReporterEnabled();
      expect(typeof isEnabled).toBe('boolean');
    });

    it('should respect governance flags', () => {
      const flags = governanceFlags.getFlags();
      expect(flags.complianceReporter).toBeDefined();
      expect(flags.complianceReporter.enabled).toBe(true);
      expect(flags.complianceReporter.retentionDays).toBe(90);
    });
  });

  describe('Maintenance', () => {
    it('should clear violations', () => {
      reporter.recordViolation({
        type: 'loop_detected',
        severity: 'low',
        gate: 'testGate',
        description: 'Test',
      });

      expect(reporter.getViolations().length).toBe(1);

      reporter.clearViolations();

      expect(reporter.getViolations().length).toBe(0);
    });

    it('should reset completely', () => {
      reporter.recordViolation({
        type: 'loop_detected',
        severity: 'low',
        gate: 'testGate',
        description: 'Test',
      });
      reporter.setAlertThreshold('testGate', 50);

      reporter.reset();

      expect(reporter.getViolations().length).toBe(0);
      expect(reporter.isInitialized()).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty description', () => {
      const id = reporter.recordViolation({
        type: 'loop_detected',
        severity: 'low',
        gate: 'testGate',
        description: '',
      });

      const violation = reporter.getViolation(id);
      expect(violation?.description).toBe('');
    });

    it('should handle special characters in description', () => {
      const id = reporter.recordViolation({
        type: 'loop_detected',
        severity: 'low',
        gate: 'testGate',
        description: 'Special chars: <>&"\'\\n\\t',
      });

      const violation = reporter.getViolation(id);
      expect(violation?.description).toBe('Special chars: <>&"\'\\n\\t');
    });

    it('should handle violations without agentId', () => {
      const id = reporter.recordViolation({
        type: 'loop_detected',
        severity: 'low',
        gate: 'testGate',
        description: 'No agent',
      });

      const violation = reporter.getViolation(id);
      expect(violation?.agentId).toBeUndefined();
    });

    it('should handle very long gate names', () => {
      const longGate = 'a'.repeat(200);
      const id = reporter.recordViolation({
        type: 'loop_detected',
        severity: 'low',
        gate: longGate,
        description: 'Long gate name',
      });

      const violation = reporter.getViolation(id);
      expect(violation?.gate).toBe(longGate);
    });

    it('should handle complex context objects', () => {
      const id = reporter.recordViolation({
        type: 'loop_detected',
        severity: 'low',
        gate: 'testGate',
        description: 'Complex context',
        context: {
          nested: { deep: { value: 42 } },
          array: [1, 2, 3],
          date: new Date().toISOString(),
        },
      });

      const violation = reporter.getViolation(id);
      expect(violation?.context?.nested).toEqual({ deep: { value: 42 } });
    });

    it('should handle report with no violations', () => {
      const report = reporter.generateReport({
        includeViolations: true,
        includeAgentRankings: true,
        includeRecommendations: true,
        includeTrendAnalysis: true,
      });

      expect(report.summary.totalViolations).toBe(0);
      expect(report.summary.overallScore).toBe(100);
      expect(report.violations).toEqual([]);
    });
  });

  describe('Performance', () => {
    it('should record violations quickly', async () => {
      const iterations = 100;
      const start = performance.now();

      for (let i = 0; i < iterations; i++) {
        reporter.recordViolation({
          type: 'loop_detected',
          severity: 'low',
          gate: 'perfGate',
          description: `Violation ${i}`,
        });
      }

      const elapsed = performance.now() - start;
      const avgTime = elapsed / iterations;

      // Should average less than 10ms per violation (includes proof creation)
      expect(avgTime).toBeLessThan(10);
    });

    it('should filter violations efficiently', async () => {
      // Create many violations
      for (let i = 0; i < 200; i++) {
        reporter.recordViolation({
          type: i % 2 === 0 ? 'loop_detected' : 'contradiction',
          severity: i % 4 === 0 ? 'critical' : 'low',
          gate: `gate-${i % 5}`,
          description: `Violation ${i}`,
        });
      }

      const start = performance.now();
      const filtered = reporter.getViolations({
        type: 'loop_detected',
        severity: 'critical',
      });
      const elapsed = performance.now() - start;

      expect(filtered.length).toBeGreaterThan(0);
      expect(elapsed).toBeLessThan(50);
    });

    it('should generate reports efficiently', async () => {
      // Create violations
      for (let i = 0; i < 100; i++) {
        reporter.recordViolation({
          type: 'loop_detected',
          severity: 'low',
          gate: 'perfGate',
          description: `Violation ${i}`,
        });
      }

      const start = performance.now();
      const report = reporter.generateReport({
        includeViolations: true,
        includeAgentRankings: true,
        includeRecommendations: true,
        includeTrendAnalysis: true,
      });
      const elapsed = performance.now() - start;

      expect(report.summary.totalViolations).toBe(100);
      expect(elapsed).toBeLessThan(100);
    });

    it('should calculate scores efficiently', async () => {
      // Create violations
      for (let i = 0; i < 100; i++) {
        reporter.recordViolation({
          type: 'loop_detected',
          severity: 'low',
          gate: `gate-${i % 10}`,
          agentId: `agent-${i % 5}`,
          description: `Violation ${i}`,
        });
      }

      const start = performance.now();
      const score = reporter.calculateScore();
      const elapsed = performance.now() - start;

      expect(score.overall).toBeLessThan(100);
      expect(Object.keys(score.byGate).length).toBe(10);
      expect(Object.keys(score.byAgent).length).toBe(5);
      expect(elapsed).toBeLessThan(50);
    });
  });
});
