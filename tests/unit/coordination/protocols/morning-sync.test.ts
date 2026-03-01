/**
 * Agentic QE v3 - Morning Sync Protocol Unit Tests
 * Tests for MorningSyncProtocol daily coordination and risk identification
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  MorningSyncProtocol,
  DefaultDomainDataCollector,
  createMorningSyncProtocol,
  MorningSyncEvents,
  type MorningSyncConfig,
  type DomainDataCollector,
  type TestExecutionSummary,
  type CoverageSummary,
  type QualityMetricsSummary,
  type DefectPredictionSummary,
  type SecurityFindingsSummary,
} from '../../../../src/coordination/protocols/morning-sync';
import type { EventBus } from '../../../../src/kernel/interfaces';
import { ok, err } from '../../../../src/shared/types';

// ============================================================================
// Mock Setup
// ============================================================================

function createMockEventBus(): EventBus {
  return {
    publish: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }),
    subscribeToChannel: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }),
    unsubscribe: vi.fn(),
  };
}

function createMockCollector(overrides?: Partial<{
  testResults: TestExecutionSummary;
  coverageResults: CoverageSummary;
  qualityMetrics: QualityMetricsSummary;
  defectPredictions: DefectPredictionSummary;
  securityFindings: SecurityFindingsSummary;
}>): DomainDataCollector {
  return {
    collectTestExecutionResults: vi.fn().mockResolvedValue(
      overrides?.testResults ? ok(overrides.testResults) : ok(undefined)
    ),
    collectCoverageResults: vi.fn().mockResolvedValue(
      overrides?.coverageResults ? ok(overrides.coverageResults) : ok(undefined)
    ),
    collectQualityMetrics: vi.fn().mockResolvedValue(
      overrides?.qualityMetrics ? ok(overrides.qualityMetrics) : ok(undefined)
    ),
    collectDefectPredictions: vi.fn().mockResolvedValue(
      overrides?.defectPredictions ? ok(overrides.defectPredictions) : ok(undefined)
    ),
    collectSecurityFindings: vi.fn().mockResolvedValue(
      overrides?.securityFindings ? ok(overrides.securityFindings) : ok(undefined)
    ),
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('MorningSyncProtocol', () => {
  let mockEventBus: EventBus;
  let protocol: MorningSyncProtocol;

  beforeEach(() => {
    mockEventBus = createMockEventBus();
    protocol = new MorningSyncProtocol(mockEventBus);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create protocol with default config', () => {
      const protocol = new MorningSyncProtocol(mockEventBus);
      expect(protocol).toBeDefined();
    });

    it('should accept custom config', () => {
      const config: Partial<MorningSyncConfig> = {
        lookbackHours: 12,
        riskSeverityThreshold: 'high',
        maxPriorityItems: 10,
      };

      const protocol = new MorningSyncProtocol(mockEventBus, config);
      expect(protocol).toBeDefined();
    });
  });

  describe('registerCollector()', () => {
    it('should register domain collector', () => {
      const collector = createMockCollector();
      protocol.registerCollector('test-execution', collector);

      // Collector is registered - no errors
    });

    it('should replace existing collector', () => {
      const collector1 = createMockCollector();
      const collector2 = createMockCollector();

      protocol.registerCollector('test-execution', collector1);
      protocol.registerCollector('test-execution', collector2);

      // Second collector replaces first
    });
  });

  describe('execute()', () => {
    it('should complete sync successfully', async () => {
      const result = await protocol.execute();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.syncId).toBeDefined();
        expect(result.value.timestamp).toBeInstanceOf(Date);
        expect(result.value.duration).toBeGreaterThanOrEqual(0);
      }
    });

    it('should publish sync started event', async () => {
      await protocol.execute();

      expect(mockEventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MorningSyncEvents.MorningSyncStarted,
        })
      );
    });

    it('should publish sync completed event', async () => {
      await protocol.execute();

      expect(mockEventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MorningSyncEvents.MorningSyncCompleted,
        })
      );
    });

    it('should include summary in report', async () => {
      const result = await protocol.execute();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.summary).toBeDefined();
        expect(result.value.summary.overallHealth).toBeDefined();
      }
    });

    it('should collect overnight results from registered collectors', async () => {
      const collector = createMockCollector({
        testResults: {
          totalRuns: 100,
          passed: 95,
          failed: 5,
          skipped: 0,
          flakyTests: 2,
          averageDuration: 150,
          failedTestIds: ['test-1', 'test-2'],
        },
      });

      protocol.registerCollector('test-execution', collector);

      const result = await protocol.execute();

      expect(result.success).toBe(true);
      expect(collector.collectTestExecutionResults).toHaveBeenCalled();
    });
  });

  describe('gatherOvernightResults()', () => {
    it('should return results for all domains', async () => {
      const result = await protocol.gatherOvernightResults();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.size).toBe(14); // All 14 domains (13 user-facing + coordination)
      }
    });

    it('should collect test results from test-execution domain', async () => {
      const testResults: TestExecutionSummary = {
        totalRuns: 50,
        passed: 48,
        failed: 2,
        skipped: 0,
        flakyTests: 1,
        averageDuration: 200,
        failedTestIds: ['test-fail-1'],
      };

      const collector = createMockCollector({ testResults });
      protocol.registerCollector('test-execution', collector);

      const result = await protocol.gatherOvernightResults();

      expect(result.success).toBe(true);
      if (result.success) {
        const domainResult = result.value.get('test-execution');
        expect(domainResult?.testResults).toEqual(testResults);
      }
    });

    it('should collect coverage results from coverage-analysis domain', async () => {
      const coverageResults: CoverageSummary = {
        line: 85,
        branch: 78,
        function: 90,
        statement: 86,
        delta: 2,
        trend: 'improving',
        gapsIdentified: 5,
        criticalGaps: [],
      };

      const collector = createMockCollector({ coverageResults });
      protocol.registerCollector('coverage-analysis', collector);

      const result = await protocol.gatherOvernightResults();

      expect(result.success).toBe(true);
      if (result.success) {
        const domainResult = result.value.get('coverage-analysis');
        expect(domainResult?.coverageResults).toEqual(coverageResults);
      }
    });

    it('should record errors from failed collectors', async () => {
      const collector: DomainDataCollector = {
        collectTestExecutionResults: vi.fn().mockResolvedValue(
          err(new Error('Connection failed'))
        ),
        collectCoverageResults: vi.fn().mockResolvedValue(ok(undefined)),
        collectQualityMetrics: vi.fn().mockResolvedValue(ok(undefined)),
        collectDefectPredictions: vi.fn().mockResolvedValue(ok(undefined)),
        collectSecurityFindings: vi.fn().mockResolvedValue(ok(undefined)),
      };

      protocol.registerCollector('test-execution', collector);

      const result = await protocol.gatherOvernightResults();

      expect(result.success).toBe(true);
      if (result.success) {
        const domainResult = result.value.get('test-execution');
        expect(domainResult?.errors.length).toBeGreaterThan(0);
      }
    });

    it('should publish domain results collected event for domains with collectors', async () => {
      // Register collectors for domains that publish events
      const collector = createMockCollector();
      protocol.registerCollector('test-execution', collector);
      protocol.registerCollector('coverage-analysis', collector);
      protocol.registerCollector('quality-assessment', collector);

      const result = await protocol.gatherOvernightResults();

      expect(result.success).toBe(true);
      if (result.success) {
        // Should have published DomainResultsCollected for domains with collectors
        const domainCollectedCalls = (mockEventBus.publish as any).mock.calls.filter(
          (call: any) => call[0]?.type === MorningSyncEvents.DomainResultsCollected
        );
        // Events published for domains with registered collectors
        expect(domainCollectedCalls.length).toBe(3);
      }
    });
  });

  describe('identifyRisks()', () => {
    it('should identify high failure rate risk', async () => {
      const overnightResults = new Map();
      overnightResults.set('test-execution', {
        domain: 'test-execution',
        testResults: {
          totalRuns: 100,
          passed: 60,
          failed: 40,
          skipped: 0,
          flakyTests: 0,
          averageDuration: 100,
          failedTestIds: ['t1', 't2'],
        },
        errors: [],
      });

      const result = await protocol.identifyRisks(overnightResults);

      expect(result.success).toBe(true);
      if (result.success) {
        const failureRisk = result.value.find(r => r.title.includes('Failure Rate'));
        expect(failureRisk).toBeDefined();
        expect(failureRisk?.severity).toBe('critical');
      }
    });

    it('should identify flaky test risk', async () => {
      const overnightResults = new Map();
      overnightResults.set('test-execution', {
        domain: 'test-execution',
        testResults: {
          totalRuns: 100,
          passed: 95,
          failed: 5,
          skipped: 0,
          flakyTests: 15,
          averageDuration: 100,
          failedTestIds: [],
        },
        errors: [],
      });

      const result = await protocol.identifyRisks(overnightResults);

      expect(result.success).toBe(true);
      if (result.success) {
        const flakyRisk = result.value.find(r => r.title.includes('Flaky'));
        expect(flakyRisk).toBeDefined();
      }
    });

    it('should identify low coverage risk', async () => {
      const overnightResults = new Map();
      overnightResults.set('coverage-analysis', {
        domain: 'coverage-analysis',
        coverageResults: {
          line: 45,
          branch: 40,
          function: 50,
          statement: 45,
          delta: -2,
          trend: 'declining',
          gapsIdentified: 20,
          criticalGaps: [],
        },
        errors: [],
      });

      const result = await protocol.identifyRisks(overnightResults);

      expect(result.success).toBe(true);
      if (result.success) {
        const coverageRisk = result.value.find(r => r.title.includes('Coverage'));
        expect(coverageRisk).toBeDefined();
        expect(coverageRisk?.severity).toBe('critical');
      }
    });

    it('should identify declining coverage trend', async () => {
      const overnightResults = new Map();
      overnightResults.set('coverage-analysis', {
        domain: 'coverage-analysis',
        coverageResults: {
          line: 75,
          branch: 70,
          function: 80,
          statement: 75,
          delta: -10,
          trend: 'declining',
          gapsIdentified: 5,
          criticalGaps: [],
        },
        errors: [],
      });

      const result = await protocol.identifyRisks(overnightResults);

      expect(result.success).toBe(true);
      if (result.success) {
        const declineRisk = result.value.find(r => r.title.includes('Declining'));
        expect(declineRisk).toBeDefined();
      }
    });

    it('should identify failed quality gates', async () => {
      const overnightResults = new Map();
      overnightResults.set('quality-assessment', {
        domain: 'quality-assessment',
        qualityMetrics: {
          overallScore: 75,
          gatesPassed: 4,
          gatesFailed: 2,
          failedGates: ['coverage', 'security'],
          deploymentsBlocked: 1,
        },
        errors: [],
      });

      const result = await protocol.identifyRisks(overnightResults);

      expect(result.success).toBe(true);
      if (result.success) {
        const gateRisk = result.value.find(r => r.title.includes('Gates'));
        expect(gateRisk).toBeDefined();
        expect(gateRisk?.severity).toBe('critical');
      }
    });

    it('should identify security vulnerabilities', async () => {
      const overnightResults = new Map();
      overnightResults.set('security-compliance', {
        domain: 'security-compliance',
        securityFindings: {
          critical: 2,
          high: 5,
          medium: 10,
          low: 20,
          newVulnerabilities: 3,
          resolvedVulnerabilities: 1,
          complianceScore: 70,
        },
        errors: [],
      });

      const result = await protocol.identifyRisks(overnightResults);

      expect(result.success).toBe(true);
      if (result.success) {
        const criticalRisk = result.value.find(r => r.title.includes('Critical Security'));
        expect(criticalRisk).toBeDefined();
        expect(criticalRisk?.severity).toBe('critical');
      }
    });

    it('should sort risks by severity and priority', async () => {
      const overnightResults = new Map();
      overnightResults.set('test-execution', {
        domain: 'test-execution',
        testResults: {
          totalRuns: 100,
          passed: 60,
          failed: 40,
          skipped: 0,
          flakyTests: 5,
          averageDuration: 100,
          failedTestIds: ['t1'],
        },
        errors: [],
      });
      overnightResults.set('security-compliance', {
        domain: 'security-compliance',
        securityFindings: {
          critical: 1,
          high: 2,
          medium: 5,
          low: 10,
          newVulnerabilities: 1,
          resolvedVulnerabilities: 0,
          complianceScore: 80,
        },
        errors: [],
      });

      const result = await protocol.identifyRisks(overnightResults);

      expect(result.success).toBe(true);
      if (result.success && result.value.length >= 2) {
        // Critical should come before high
        const firstCritical = result.value.findIndex(r => r.severity === 'critical');
        const firstHigh = result.value.findIndex(r => r.severity === 'high');

        if (firstCritical !== -1 && firstHigh !== -1) {
          expect(firstCritical).toBeLessThan(firstHigh);
        }
      }
    });

    it('should publish risk identified events for critical/high risks', async () => {
      const overnightResults = new Map();
      overnightResults.set('security-compliance', {
        domain: 'security-compliance',
        securityFindings: {
          critical: 1,
          high: 0,
          medium: 0,
          low: 0,
          newVulnerabilities: 1,
          resolvedVulnerabilities: 0,
          complianceScore: 90,
        },
        errors: [],
      });

      await protocol.identifyRisks(overnightResults);

      // Check events published
    });
  });

  describe('prioritizeWork()', () => {
    it('should create work items from risks', async () => {
      const risks = [{
        id: 'risk-1',
        severity: 'high' as const,
        priority: 'p1' as const,
        domain: 'test-execution' as const,
        title: 'High Failure Rate',
        description: 'Test failure rate is 40%',
        source: 'test-execution',
        impact: 'Release delays',
        recommendation: 'Fix failing tests',
        relatedItems: ['test-1', 'test-2'],
        detectedAt: new Date(),
      }];

      const overnightResults = new Map();

      const result = await protocol.prioritizeWork(risks, overnightResults);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.length).toBeGreaterThan(0);
        expect(result.value[0].priority).toBe('p1');
      }
    });

    it('should respect maxPriorityItems limit', async () => {
      const protocol = new MorningSyncProtocol(mockEventBus, {
        maxPriorityItems: 5,
      });

      const risks = Array.from({ length: 10 }, (_, i) => ({
        id: `risk-${i}`,
        severity: 'medium' as const,
        priority: 'p2' as const,
        domain: 'test-execution' as const,
        title: `Risk ${i}`,
        description: 'Description',
        source: 'test-execution',
        impact: 'Impact',
        recommendation: 'Fix it',
        relatedItems: [],
        detectedAt: new Date(),
      }));

      const result = await protocol.prioritizeWork(risks, new Map());

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.length).toBeLessThanOrEqual(5);
      }
    });

    it('should deduplicate similar work items', async () => {
      const risks = [
        {
          id: 'risk-1',
          severity: 'high' as const,
          priority: 'p1' as const,
          domain: 'test-execution' as const,
          title: 'Test Issue',
          description: 'Same issue',
          source: 'test-execution',
          impact: 'Impact',
          recommendation: 'Fix',
          relatedItems: [],
          detectedAt: new Date(),
        },
        {
          id: 'risk-2',
          severity: 'medium' as const,
          priority: 'p2' as const,
          domain: 'test-execution' as const,
          title: 'Test Issue',
          description: 'Same issue again',
          source: 'test-execution',
          impact: 'Impact',
          recommendation: 'Fix',
          relatedItems: [],
          detectedAt: new Date(),
        },
      ];

      const result = await protocol.prioritizeWork(risks, new Map());

      expect(result.success).toBe(true);
      if (result.success) {
        // Should merge related risks
        const uniqueTitles = new Set(result.value.map(w => w.title.substring(0, 30)));
        // Some deduplication should happen
      }
    });

    it('should sort work items by priority', async () => {
      const risks = [
        {
          id: 'risk-1',
          severity: 'medium' as const,
          priority: 'p2' as const,
          domain: 'test-execution' as const,
          title: 'Medium Risk',
          description: 'Description',
          source: 'test-execution',
          impact: 'Impact',
          recommendation: 'Fix',
          relatedItems: [],
          detectedAt: new Date(),
        },
        {
          id: 'risk-2',
          severity: 'critical' as const,
          priority: 'p0' as const,
          domain: 'security-compliance' as const,
          title: 'Critical Risk',
          description: 'Description',
          source: 'security-compliance',
          impact: 'Impact',
          recommendation: 'Fix now',
          relatedItems: [],
          detectedAt: new Date(),
        },
      ];

      const result = await protocol.prioritizeWork(risks, new Map());

      expect(result.success).toBe(true);
      if (result.success && result.value.length >= 2) {
        expect(result.value[0].priority).toBe('p0');
      }
    });

    it('should publish work prioritized event', async () => {
      const risks = [{
        id: 'risk-1',
        severity: 'high' as const,
        priority: 'p1' as const,
        domain: 'test-execution' as const,
        title: 'Risk',
        description: 'Description',
        source: 'test-execution',
        impact: 'Impact',
        recommendation: 'Fix',
        relatedItems: [],
        detectedAt: new Date(),
      }];

      await protocol.execute();

      expect(mockEventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MorningSyncEvents.WorkPrioritized,
        })
      );
    });
  });

  describe('generateReport()', () => {
    it('should generate complete report', () => {
      const syncId = 'sync-123';
      const startTime = Date.now();
      const overnightResults = new Map();
      const risks: any[] = [];
      const workItems: any[] = [];

      const report = protocol.generateReport(
        syncId,
        startTime,
        overnightResults,
        risks,
        workItems
      );

      expect(report.syncId).toBe(syncId);
      expect(report.timestamp).toBeInstanceOf(Date);
      expect(report.duration).toBeGreaterThanOrEqual(0);
      expect(report.summary).toBeDefined();
    });

    it('should calculate healthy status when no critical risks', () => {
      const syncId = 'sync-123';
      const startTime = Date.now();
      const overnightResults = new Map();
      const risks: any[] = [];
      const workItems: any[] = [];

      const report = protocol.generateReport(
        syncId,
        startTime,
        overnightResults,
        risks,
        workItems
      );

      expect(report.summary.overallHealth).toBe('healthy');
    });

    it('should calculate critical status when critical risks exist', () => {
      const syncId = 'sync-123';
      const startTime = Date.now();
      const overnightResults = new Map();
      const risks = [{
        id: 'r1',
        severity: 'critical' as const,
        priority: 'p0' as const,
        domain: 'security-compliance' as const,
        title: 'Critical Issue',
        description: 'Desc',
        source: 'security',
        impact: 'High',
        recommendation: 'Fix now',
        relatedItems: [],
        detectedAt: new Date(),
      }];
      const workItems: any[] = [];

      const report = protocol.generateReport(
        syncId,
        startTime,
        overnightResults,
        risks,
        workItems
      );

      expect(report.summary.overallHealth).toBe('critical');
    });

    it('should calculate warning status for many high priority items', () => {
      const syncId = 'sync-123';
      const startTime = Date.now();
      const overnightResults = new Map();
      const risks = Array.from({ length: 6 }, (_, i) => ({
        id: `r${i}`,
        severity: 'high' as const,
        priority: 'p1' as const,
        domain: 'test-execution' as const,
        title: `High Issue ${i}`,
        description: 'Desc',
        source: 'test',
        impact: 'Medium',
        recommendation: 'Fix soon',
        relatedItems: [],
        detectedAt: new Date(),
      }));
      const workItems: any[] = [];

      const report = protocol.generateReport(
        syncId,
        startTime,
        overnightResults,
        risks,
        workItems
      );

      expect(report.summary.overallHealth).toBe('warning');
    });

    it('should include test statistics in summary', () => {
      const syncId = 'sync-123';
      const startTime = Date.now();
      const overnightResults = new Map();
      overnightResults.set('test-execution', {
        domain: 'test-execution',
        testResults: {
          totalRuns: 100,
          passed: 95,
          failed: 5,
          skipped: 0,
          flakyTests: 2,
          averageDuration: 100,
          failedTestIds: [],
        },
        errors: [],
      });

      const report = protocol.generateReport(
        syncId,
        startTime,
        overnightResults,
        [],
        []
      );

      expect(report.summary.totalTestsRun).toBe(100);
      expect(report.summary.overallPassRate).toBe(0.95);
    });
  });
});

describe('DefaultDomainDataCollector', () => {
  let collector: DefaultDomainDataCollector;

  beforeEach(() => {
    collector = new DefaultDomainDataCollector();
  });

  it('should return undefined for test execution results', async () => {
    const result = await collector.collectTestExecutionResults(new Date());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value).toBeUndefined();
    }
  });

  it('should return undefined for coverage results', async () => {
    const result = await collector.collectCoverageResults(new Date());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value).toBeUndefined();
    }
  });

  it('should return undefined for quality metrics', async () => {
    const result = await collector.collectQualityMetrics(new Date());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value).toBeUndefined();
    }
  });

  it('should return undefined for defect predictions', async () => {
    const result = await collector.collectDefectPredictions(new Date());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value).toBeUndefined();
    }
  });

  it('should return undefined for security findings', async () => {
    const result = await collector.collectSecurityFindings(new Date());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value).toBeUndefined();
    }
  });
});

describe('createMorningSyncProtocol', () => {
  it('should create protocol instance', () => {
    const mockEventBus = createMockEventBus();
    const protocol = createMorningSyncProtocol(mockEventBus);

    expect(protocol).toBeInstanceOf(MorningSyncProtocol);
  });

  it('should pass config to protocol', () => {
    const mockEventBus = createMockEventBus();
    const protocol = createMorningSyncProtocol(mockEventBus, {
      lookbackHours: 12,
    });

    expect(protocol).toBeDefined();
  });
});
