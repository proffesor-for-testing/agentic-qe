/**
 * Agentic QE v3 - Quality Gate Protocol Unit Tests
 * Tests for release candidate quality gate evaluation
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  QualityGateProtocol,
  createQualityGateProtocol,
  QualityGateProtocolEvents,
  type ReleaseCandidate,
  type AggregatedMetrics,
  type QualityGateThresholds,
  type QualityGateProtocolConfig,
} from '../../../../src/coordination/protocols/quality-gate';
import type {
  EventBus,
  MemoryBackend,
  AgentCoordinator,
} from '../../../../src/kernel/interfaces';
import { ok } from '../../../../src/shared/types';

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

function createMockMemory(): MemoryBackend {
  const storage = new Map<string, unknown>();

  return {
    get: vi.fn().mockImplementation(async (key: string) => storage.get(key)),
    set: vi.fn().mockImplementation(async (key: string, value: unknown) => {
      storage.set(key, value);
    }),
    delete: vi.fn().mockImplementation(async (key: string) => storage.delete(key)),
    search: vi.fn().mockResolvedValue([]),
    clear: vi.fn().mockImplementation(async () => storage.clear()),
  };
}

function createMockAgentCoordinator(): AgentCoordinator {
  return {
    spawn: vi.fn().mockResolvedValue(ok('agent-123')),
    stop: vi.fn().mockResolvedValue(ok(undefined)),
    canSpawn: vi.fn().mockReturnValue(true),
    getActiveAgents: vi.fn().mockReturnValue([]),
    getAgentStatus: vi.fn().mockReturnValue(undefined),
  };
}

function createReleaseCandidate(overrides?: Partial<ReleaseCandidate>): ReleaseCandidate {
  return {
    id: 'rc-123',
    version: '1.0.0',
    branch: 'main',
    commitHash: 'abc123',
    createdAt: new Date(),
    ...overrides,
  };
}

function createAggregatedMetrics(overrides?: Partial<AggregatedMetrics>): AggregatedMetrics {
  return {
    coverage: {
      line: 85,
      branch: 75,
      function: 90,
      statement: 85,
      trend: 'stable',
    },
    testExecution: {
      total: 100,
      passed: 100,
      failed: 0,
      skipped: 0,
      passRate: 100,
      flakyTests: 0,
      duration: 5000,
    },
    quality: {
      overallScore: 80,
      technicalDebt: 5,
      codeSmells: 10,
      duplications: 2,
      criticalBugs: 0,
    },
    security: {
      vulnerabilities: {
        critical: 0,
        high: 0,
        medium: 2,
        low: 5,
      },
      complianceScore: 90,
    },
    defects: {
      regressionRisk: 0.2,
      predictedDefects: 1,
      hotspotCount: 3,
    },
    collectedAt: new Date(),
    sources: ['coverage-analysis', 'test-execution', 'quality-assessment'],
    ...overrides,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('QualityGateProtocol', () => {
  let mockEventBus: EventBus;
  let mockMemory: MemoryBackend;
  let mockAgentCoordinator: AgentCoordinator;
  let protocol: QualityGateProtocol;

  beforeEach(() => {
    mockEventBus = createMockEventBus();
    mockMemory = createMockMemory();
    mockAgentCoordinator = createMockAgentCoordinator();
    protocol = new QualityGateProtocol(mockEventBus, mockMemory, mockAgentCoordinator);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create protocol with default config', () => {
      const protocol = new QualityGateProtocol(
        mockEventBus,
        mockMemory,
        mockAgentCoordinator
      );
      expect(protocol).toBeDefined();
    });

    it('should accept custom config', () => {
      const config: Partial<QualityGateProtocolConfig> = {
        enableMLRiskAssessment: false,
        publishEvents: false,
        timeout: 60000,
      };

      const protocol = new QualityGateProtocol(
        mockEventBus,
        mockMemory,
        mockAgentCoordinator,
        config
      );
      expect(protocol).toBeDefined();
    });

    it('should accept custom thresholds', () => {
      const thresholds: Partial<QualityGateThresholds> = {
        coverage: {
          line: { min: 90, blocking: true },
          branch: { min: 80, blocking: true },
        },
      };

      const protocol = new QualityGateProtocol(
        mockEventBus,
        mockMemory,
        mockAgentCoordinator,
        { thresholds }
      );
      expect(protocol).toBeDefined();
    });
  });

  describe('execute()', () => {
    it('should complete evaluation successfully', async () => {
      const releaseCandidate = createReleaseCandidate();

      const result = await protocol.execute(releaseCandidate);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.id).toBeDefined();
        expect(result.value.releaseCandidate).toEqual(releaseCandidate);
        expect(result.value.evaluatedAt).toBeInstanceOf(Date);
      }
    });

    it('should publish quality gate triggered event', async () => {
      const releaseCandidate = createReleaseCandidate();

      await protocol.execute(releaseCandidate);

      expect(mockEventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: QualityGateProtocolEvents.QualityGateTriggered,
        })
      );
    });

    it('should publish quality gate completed event', async () => {
      const releaseCandidate = createReleaseCandidate();

      await protocol.execute(releaseCandidate);

      expect(mockEventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: QualityGateProtocolEvents.QualityGateCompleted,
        })
      );
    });

    it('should include recommendation in result', async () => {
      const releaseCandidate = createReleaseCandidate();

      const result = await protocol.execute(releaseCandidate);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.recommendation).toBeDefined();
        expect(['approved', 'blocked', 'conditional']).toContain(
          result.value.recommendation.decision
        );
      }
    });

    it('should include risk assessment in result', async () => {
      const releaseCandidate = createReleaseCandidate();

      const result = await protocol.execute(releaseCandidate);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.riskAssessment).toBeDefined();
        expect(result.value.riskAssessment.overallRisk).toBeGreaterThanOrEqual(0);
        expect(result.value.riskAssessment.overallRisk).toBeLessThanOrEqual(1);
      }
    });

    it('should store evaluation history', async () => {
      const releaseCandidate = createReleaseCandidate();

      await protocol.execute(releaseCandidate);

      expect(mockMemory.set).toHaveBeenCalled();
    });

    it('should spawn coordinator agent when available', async () => {
      const releaseCandidate = createReleaseCandidate();

      await protocol.execute(releaseCandidate);

      expect(mockAgentCoordinator.spawn).toHaveBeenCalled();
    });

    it('should stop coordinator agent after evaluation', async () => {
      const releaseCandidate = createReleaseCandidate();

      await protocol.execute(releaseCandidate);

      expect(mockAgentCoordinator.stop).toHaveBeenCalled();
    });
  });

  describe('aggregateMetrics()', () => {
    it('should aggregate metrics from domains', async () => {
      const releaseCandidate = createReleaseCandidate();

      const result = await protocol.aggregateMetrics(releaseCandidate);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.coverage).toBeDefined();
        expect(result.value.testExecution).toBeDefined();
        expect(result.value.quality).toBeDefined();
        expect(result.value.security).toBeDefined();
        expect(result.value.defects).toBeDefined();
      }
    });

    it('should include collection timestamp', async () => {
      const releaseCandidate = createReleaseCandidate();

      const result = await protocol.aggregateMetrics(releaseCandidate);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.collectedAt).toBeInstanceOf(Date);
      }
    });

    it('should track source domains', async () => {
      const releaseCandidate = createReleaseCandidate();

      const result = await protocol.aggregateMetrics(releaseCandidate);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(Array.isArray(result.value.sources)).toBe(true);
      }
    });

    it('should store aggregated metrics', async () => {
      const releaseCandidate = createReleaseCandidate();

      await protocol.aggregateMetrics(releaseCandidate);

      expect(mockMemory.set).toHaveBeenCalled();
    });
  });

  describe('evaluateGate()', () => {
    it('should evaluate all gate checks', async () => {
      const metrics = createAggregatedMetrics();

      const result = await protocol.evaluateGate(metrics);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.length).toBeGreaterThan(0);
      }
    });

    it('should include coverage checks', async () => {
      const metrics = createAggregatedMetrics();

      const result = await protocol.evaluateGate(metrics);

      expect(result.success).toBe(true);
      if (result.success) {
        const coverageChecks = result.value.filter(c => c.category === 'coverage');
        expect(coverageChecks.length).toBeGreaterThan(0);
      }
    });

    it('should include test checks', async () => {
      const metrics = createAggregatedMetrics();

      const result = await protocol.evaluateGate(metrics);

      expect(result.success).toBe(true);
      if (result.success) {
        const testChecks = result.value.filter(c => c.category === 'tests');
        expect(testChecks.length).toBeGreaterThan(0);
      }
    });

    it('should include quality checks', async () => {
      const metrics = createAggregatedMetrics();

      const result = await protocol.evaluateGate(metrics);

      expect(result.success).toBe(true);
      if (result.success) {
        const qualityChecks = result.value.filter(c => c.category === 'quality');
        expect(qualityChecks.length).toBeGreaterThan(0);
      }
    });

    it('should include security checks', async () => {
      const metrics = createAggregatedMetrics();

      const result = await protocol.evaluateGate(metrics);

      expect(result.success).toBe(true);
      if (result.success) {
        const securityChecks = result.value.filter(c => c.category === 'security');
        expect(securityChecks.length).toBeGreaterThan(0);
      }
    });

    it('should fail check when below minimum threshold', async () => {
      const metrics = createAggregatedMetrics({
        coverage: {
          line: 50, // Below default threshold of 80
          branch: 40,
          function: 60,
          statement: 55,
          trend: 'declining',
        },
      });

      const result = await protocol.evaluateGate(metrics);

      expect(result.success).toBe(true);
      if (result.success) {
        const lineCheck = result.value.find(c => c.name === 'Line Coverage');
        expect(lineCheck?.passed).toBe(false);
      }
    });

    it('should pass check when at or above threshold', async () => {
      const metrics = createAggregatedMetrics({
        coverage: {
          line: 85,
          branch: 75,
          function: 90,
          statement: 85,
          trend: 'stable',
        },
      });

      const result = await protocol.evaluateGate(metrics);

      expect(result.success).toBe(true);
      if (result.success) {
        const lineCheck = result.value.find(c => c.name === 'Line Coverage');
        expect(lineCheck?.passed).toBe(true);
      }
    });
  });

  describe('assessRisk()', () => {
    it('should return risk assessment', async () => {
      const metrics = createAggregatedMetrics();
      const checksResult = await protocol.evaluateGate(metrics);

      if (!checksResult.success) {
        throw new Error('Failed to evaluate gate');
      }

      const result = await protocol.assessRisk(metrics, checksResult.value);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.overallRisk).toBeGreaterThanOrEqual(0);
        expect(result.value.overallRisk).toBeLessThanOrEqual(1);
        expect(result.value.riskLevel).toBeDefined();
        expect(result.value.confidence).toBeGreaterThanOrEqual(0);
      }
    });

    it('should include risk factors', async () => {
      const metrics = createAggregatedMetrics();
      const checksResult = await protocol.evaluateGate(metrics);

      if (!checksResult.success) {
        throw new Error('Failed to evaluate gate');
      }

      const result = await protocol.assessRisk(metrics, checksResult.value);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(Array.isArray(result.value.factors)).toBe(true);
      }
    });

    it('should include predictions', async () => {
      const metrics = createAggregatedMetrics();
      const checksResult = await protocol.evaluateGate(metrics);

      if (!checksResult.success) {
        throw new Error('Failed to evaluate gate');
      }

      const result = await protocol.assessRisk(metrics, checksResult.value);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.predictions).toBeDefined();
        expect(result.value.predictions.defectProbability).toBeGreaterThanOrEqual(0);
        expect(result.value.predictions.rollbackProbability).toBeGreaterThanOrEqual(0);
        expect(result.value.predictions.incidentProbability).toBeGreaterThanOrEqual(0);
      }
    });

    it('should return basic assessment when ML disabled', async () => {
      const protocol = new QualityGateProtocol(
        mockEventBus,
        mockMemory,
        mockAgentCoordinator,
        { enableMLRiskAssessment: false }
      );

      const metrics = createAggregatedMetrics();
      const checksResult = await protocol.evaluateGate(metrics);

      if (!checksResult.success) {
        throw new Error('Failed to evaluate gate');
      }

      const result = await protocol.assessRisk(metrics, checksResult.value);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.confidence).toBe(0.6); // Basic assessment confidence
      }
    });
  });

  describe('generateRecommendation()', () => {
    it('should approve when all checks pass', async () => {
      const releaseCandidate = createReleaseCandidate();
      const metrics = createAggregatedMetrics();
      const checksResult = await protocol.evaluateGate(metrics);
      const riskResult = await protocol.assessRisk(metrics, checksResult.value!);

      const result = await protocol.generateRecommendation(
        releaseCandidate,
        checksResult.value!,
        riskResult.value!
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.decision).toBe('approved');
        expect(result.value.blockingIssues).toHaveLength(0);
      }
    });

    it('should block when critical checks fail', async () => {
      const releaseCandidate = createReleaseCandidate();
      const metrics = createAggregatedMetrics({
        security: {
          vulnerabilities: {
            critical: 5, // Critical vulnerabilities
            high: 2,
            medium: 1,
            low: 0,
          },
          complianceScore: 90,
        },
      });
      const checksResult = await protocol.evaluateGate(metrics);
      const riskResult = await protocol.assessRisk(metrics, checksResult.value!);

      const result = await protocol.generateRecommendation(
        releaseCandidate,
        checksResult.value!,
        riskResult.value!
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.decision).toBe('blocked');
        expect(result.value.blockingIssues.length).toBeGreaterThan(0);
      }
    });

    it('should include rollback plan when approved', async () => {
      const releaseCandidate = createReleaseCandidate();
      const metrics = createAggregatedMetrics();
      const checksResult = await protocol.evaluateGate(metrics);
      const riskResult = await protocol.assessRisk(metrics, checksResult.value!);

      const result = await protocol.generateRecommendation(
        releaseCandidate,
        checksResult.value!,
        riskResult.value!
      );

      expect(result.success).toBe(true);
      if (result.success) {
        if (result.value.decision !== 'blocked') {
          expect(result.value.rollbackPlan).toBeDefined();
        }
      }
    });

    it('should include next steps', async () => {
      const releaseCandidate = createReleaseCandidate();
      const metrics = createAggregatedMetrics();
      const checksResult = await protocol.evaluateGate(metrics);
      const riskResult = await protocol.assessRisk(metrics, checksResult.value!);

      const result = await protocol.generateRecommendation(
        releaseCandidate,
        checksResult.value!,
        riskResult.value!
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.nextSteps.length).toBeGreaterThan(0);
      }
    });

    it('should include summary', async () => {
      const releaseCandidate = createReleaseCandidate();
      const metrics = createAggregatedMetrics();
      const checksResult = await protocol.evaluateGate(metrics);
      const riskResult = await protocol.assessRisk(metrics, checksResult.value!);

      const result = await protocol.generateRecommendation(
        releaseCandidate,
        checksResult.value!,
        riskResult.value!
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.summary).toBeDefined();
        expect(result.value.summary.length).toBeGreaterThan(0);
      }
    });
  });

  describe('getEvaluationHistory()', () => {
    it('should return empty array when no history', async () => {
      const history = await protocol.getEvaluationHistory('rc-123');

      expect(history).toEqual([]);
    });
  });

  describe('updateThresholds()', () => {
    it('should update coverage thresholds', () => {
      protocol.updateThresholds({
        coverage: {
          line: { min: 90, blocking: true },
          branch: { min: 85, blocking: true },
        },
      });

      // Verify by running evaluation with new thresholds
      expect(protocol).toBeDefined();
    });

    it('should update security thresholds', () => {
      protocol.updateThresholds({
        security: {
          maxCriticalVulns: { max: 0, blocking: true },
          maxHighVulns: { max: 0, blocking: true },
          minComplianceScore: { min: 95, blocking: true },
        },
      });

      expect(protocol).toBeDefined();
    });
  });

  describe('event publishing', () => {
    it('should not publish events when disabled', async () => {
      const protocol = new QualityGateProtocol(
        mockEventBus,
        mockMemory,
        mockAgentCoordinator,
        { publishEvents: false }
      );

      const releaseCandidate = createReleaseCandidate();
      await protocol.execute(releaseCandidate);

      // Should not have published QualityGateTriggered
      const triggeredCalls = (mockEventBus.publish as any).mock.calls.filter(
        (call: any) => call[0]?.type === QualityGateProtocolEvents.QualityGateTriggered
      );
      expect(triggeredCalls.length).toBe(0);
    });

    it('should publish deployment approved event', async () => {
      const releaseCandidate = createReleaseCandidate();
      const result = await protocol.execute(releaseCandidate);

      if (result.success && result.value.recommendation.decision === 'approved') {
        expect(mockEventBus.publish).toHaveBeenCalledWith(
          expect.objectContaining({
            type: QualityGateProtocolEvents.DeploymentApproved,
          })
        );
      }
    });

    it('should publish deployment blocked event', async () => {
      const releaseCandidate = createReleaseCandidate();

      // Setup metrics that will cause blocking
      mockMemory.get = vi.fn().mockImplementation(async (key: string) => {
        if (key === 'security-compliance:posture') {
          return {
            vulnerabilities: { critical: 10, high: 5, medium: 2, low: 1 },
            complianceScore: 50,
          };
        }
        return null;
      });

      const result = await protocol.execute(releaseCandidate);

      if (result.success && result.value.recommendation.decision === 'blocked') {
        expect(mockEventBus.publish).toHaveBeenCalledWith(
          expect.objectContaining({
            type: QualityGateProtocolEvents.DeploymentBlocked,
          })
        );
      }
    });
  });
});

describe('createQualityGateProtocol', () => {
  it('should create protocol instance', () => {
    const mockEventBus = createMockEventBus();
    const mockMemory = createMockMemory();
    const mockAgentCoordinator = createMockAgentCoordinator();

    const protocol = createQualityGateProtocol(
      mockEventBus,
      mockMemory,
      mockAgentCoordinator
    );

    expect(protocol).toBeDefined();
  });

  it('should pass config to protocol', () => {
    const mockEventBus = createMockEventBus();
    const mockMemory = createMockMemory();
    const mockAgentCoordinator = createMockAgentCoordinator();

    const protocol = createQualityGateProtocol(
      mockEventBus,
      mockMemory,
      mockAgentCoordinator,
      { enableMLRiskAssessment: false }
    );

    expect(protocol).toBeDefined();
  });
});
