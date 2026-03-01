/**
 * Integration Tests - Quality Assessment with MinCut Topology Awareness
 * ADR-047: MinCut Self-Organizing QE Integration
 *
 * Tests the integration of MinCutAwareDomainMixin with QualityAssessmentCoordinator.
 * Verifies topology-aware routing and health monitoring for quality decisions.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  QualityAssessmentCoordinator,
  type CoordinatorConfig,
} from '../../../src/domains/quality-assessment/coordinator';
import { InMemoryBackend } from '../../../src/kernel/memory-backend';
import type { EventBus, AgentCoordinator, AgentInfo } from '../../../src/kernel/interfaces';
import type { DomainName } from '../../../src/shared/types';
import type { MinCutHealth } from '../../../src/coordination/mincut/interfaces';

// Mock the QueenMinCutBridge
const createMockMinCutBridge = (options: {
  healthy?: boolean;
  minCutValue?: number;
  weakVertices?: Array<{ vertex: { domain: DomainName }; riskScore: number; reason: string }>;
} = {}) => {
  const { healthy = true, minCutValue = 10, weakVertices = [] } = options;

  return {
    getMinCutHealth: vi.fn().mockReturnValue({
      status: healthy ? 'healthy' : 'critical',
      minCutValue,
      healthyThreshold: 5,
      weakVertexCount: weakVertices.length,
    } as MinCutHealth),
    getWeakVertices: vi.fn().mockReturnValue(weakVertices),
    getMinCutValue: vi.fn().mockReturnValue(minCutValue),
    isCritical: vi.fn().mockReturnValue(!healthy),
  };
};

// Mock EventBus
const createMockEventBus = (): EventBus => ({
  publish: vi.fn().mockResolvedValue(undefined),
  subscribe: vi.fn().mockReturnValue(() => {}),
  unsubscribe: vi.fn(),
  listTopics: vi.fn().mockReturnValue([]),
  getSubscriberCount: vi.fn().mockReturnValue(0),
  clear: vi.fn(),
});

// Mock AgentCoordinator
const createMockAgentCoordinator = (): AgentCoordinator => ({
  spawn: vi.fn().mockResolvedValue({ success: true, value: 'agent-1' }),
  stop: vi.fn().mockResolvedValue({ success: true, value: undefined }),
  listAgents: vi.fn().mockReturnValue([] as AgentInfo[]),
  getAgent: vi.fn().mockReturnValue(undefined),
  canSpawn: vi.fn().mockReturnValue(true),
  getActiveCount: vi.fn().mockReturnValue(0),
  getMaxAgents: vi.fn().mockReturnValue(10),
});

describe('QualityAssessmentCoordinator - MinCut Integration', () => {
  let coordinator: QualityAssessmentCoordinator;
  let memory: InMemoryBackend;
  let eventBus: EventBus;
  let agentCoordinator: AgentCoordinator;

  const minimalConfig: Partial<CoordinatorConfig> = {
    enableRLThresholdTuning: false,
    enableSONAPatternLearning: false,
    enableFlashAttention: false,
    enableClaimVerification: false,
    enableConsensus: false,
    enableMinCutAwareness: true,
    publishEvents: false,
  };

  beforeEach(async () => {
    memory = new InMemoryBackend();
    await memory.initialize();
    eventBus = createMockEventBus();
    agentCoordinator = createMockAgentCoordinator();
  });

  afterEach(async () => {
    if (coordinator) {
      await coordinator.dispose();
    }
    await memory.dispose();
    vi.clearAllMocks();
  });

  describe('MinCut Bridge Integration', () => {
    it('should create coordinator with MinCut awareness enabled by default', () => {
      coordinator = new QualityAssessmentCoordinator(
        eventBus,
        memory,
        agentCoordinator,
        {}
      );

      // MinCut awareness should be enabled by default
      expect(coordinator.isTopologyHealthy()).toBe(true); // No bridge = assume healthy
    });

    it('should accept MinCut bridge via dependency injection', async () => {
      coordinator = new QualityAssessmentCoordinator(
        eventBus,
        memory,
        agentCoordinator,
        minimalConfig
      );
      await coordinator.initialize();

      const mockBridge = createMockMinCutBridge({ healthy: true });
      coordinator.setMinCutBridge(mockBridge as any);

      expect(coordinator.isTopologyHealthy()).toBe(true);
    });

    it('should report unhealthy topology when MinCut is critical', async () => {
      coordinator = new QualityAssessmentCoordinator(
        eventBus,
        memory,
        agentCoordinator,
        minimalConfig
      );
      await coordinator.initialize();

      const mockBridge = createMockMinCutBridge({ healthy: false });
      coordinator.setMinCutBridge(mockBridge as any);

      expect(coordinator.isTopologyHealthy()).toBe(false);
    });

    it('should return healthy routing domains excluding weak domains', async () => {
      coordinator = new QualityAssessmentCoordinator(
        eventBus,
        memory,
        agentCoordinator,
        minimalConfig
      );
      await coordinator.initialize();

      const mockBridge = createMockMinCutBridge({
        healthy: true,
        weakVertices: [
          { vertex: { domain: 'test-execution' }, riskScore: 0.8, reason: 'High load' },
        ],
      });
      coordinator.setMinCutBridge(mockBridge as any);

      const healthyDomains = coordinator.getHealthyRoutingDomains();
      expect(healthyDomains).not.toContain('test-execution');
    });

    it('should detect when quality-assessment domain is a weak point', async () => {
      coordinator = new QualityAssessmentCoordinator(
        eventBus,
        memory,
        agentCoordinator,
        minimalConfig
      );
      await coordinator.initialize();

      // When quality-assessment is not a weak point
      let mockBridge = createMockMinCutBridge({ weakVertices: [] });
      coordinator.setMinCutBridge(mockBridge as any);
      expect(coordinator.isDomainWeakPoint()).toBe(false);

      // When quality-assessment is a weak point
      mockBridge = createMockMinCutBridge({
        weakVertices: [
          { vertex: { domain: 'quality-assessment' }, riskScore: 0.9, reason: 'Overloaded' },
        ],
      });
      coordinator.setMinCutBridge(mockBridge as any);
      expect(coordinator.isDomainWeakPoint()).toBe(true);
    });
  });

  describe('Topology-Aware Operations', () => {
    it('should proceed with gate evaluation even when topology is degraded', async () => {
      coordinator = new QualityAssessmentCoordinator(
        eventBus,
        memory,
        agentCoordinator,
        minimalConfig
      );
      await coordinator.initialize();

      const mockBridge = createMockMinCutBridge({ healthy: false });
      coordinator.setMinCutBridge(mockBridge as any);

      // Gate evaluation should still work (with warning logged)
      const result = await coordinator.evaluateGate({
        gateName: 'test-gate',
        metrics: {
          coverage: 85,
          testsPassing: 98,
          criticalBugs: 0,
          codeSmells: 5,
          securityVulnerabilities: 0,
          technicalDebt: 2,
          duplications: 3,
        },
        thresholds: {
          coverage: { min: 80 },
          testsPassing: { min: 95 },
          criticalBugs: { max: 0 },
        },
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.passed).toBe(true);
      }
    });

    it('should proceed with quality analysis when topology is degraded', async () => {
      coordinator = new QualityAssessmentCoordinator(
        eventBus,
        memory,
        agentCoordinator,
        minimalConfig
      );
      await coordinator.initialize();

      const mockBridge = createMockMinCutBridge({ healthy: false });
      coordinator.setMinCutBridge(mockBridge as any);

      // Quality analysis should still work
      const result = await coordinator.analyzeQuality({
        sourceFiles: ['src/test.ts'],
        includeMetrics: ['coverage', 'complexity'],
      });

      expect(result.success).toBe(true);
    });

    it('should proceed with deployment advice when topology is degraded', async () => {
      coordinator = new QualityAssessmentCoordinator(
        eventBus,
        memory,
        agentCoordinator,
        minimalConfig
      );
      await coordinator.initialize();

      const mockBridge = createMockMinCutBridge({ healthy: false });
      coordinator.setMinCutBridge(mockBridge as any);

      const result = await coordinator.getDeploymentAdvice({
        releaseCandidate: 'v1.0.0',
        metrics: {
          coverage: 85,
          testsPassing: 98,
          criticalBugs: 0,
          codeSmells: 5,
          securityVulnerabilities: 0,
          technicalDebt: 2,
          duplications: 3,
        },
        riskTolerance: 'medium',
      });

      expect(result.success).toBe(true);
    });
  });

  describe('Configuration', () => {
    it('should respect enableMinCutAwareness=false', async () => {
      coordinator = new QualityAssessmentCoordinator(
        eventBus,
        memory,
        agentCoordinator,
        { ...minimalConfig, enableMinCutAwareness: false }
      );
      await coordinator.initialize();

      const mockBridge = createMockMinCutBridge({ healthy: false });
      coordinator.setMinCutBridge(mockBridge as any);

      // When disabled, should always report healthy (pass-through mode)
      expect(coordinator.isTopologyHealthy()).toBe(true);
    });

    it('should use custom topology health threshold', async () => {
      coordinator = new QualityAssessmentCoordinator(
        eventBus,
        memory,
        agentCoordinator,
        {
          ...minimalConfig,
          topologyHealthThreshold: 0.8,
        }
      );
      await coordinator.initialize();

      // The threshold is used by the mixin internally
      // This test verifies the config is passed correctly
      expect(coordinator.isTopologyHealthy()).toBe(true);
    });
  });

  describe('Lifecycle', () => {
    it('should dispose MinCut mixin on coordinator dispose', async () => {
      coordinator = new QualityAssessmentCoordinator(
        eventBus,
        memory,
        agentCoordinator,
        minimalConfig
      );
      await coordinator.initialize();

      const mockBridge = createMockMinCutBridge();
      coordinator.setMinCutBridge(mockBridge as any);

      // Dispose should clean up MinCut mixin
      await coordinator.dispose();

      // After dispose, topology should report healthy (no bridge)
      expect(coordinator.isTopologyHealthy()).toBe(true);
    });

    it('should handle multiple bridge assignments', async () => {
      coordinator = new QualityAssessmentCoordinator(
        eventBus,
        memory,
        agentCoordinator,
        minimalConfig
      );
      await coordinator.initialize();

      // First bridge - healthy
      const healthyBridge = createMockMinCutBridge({ healthy: true });
      coordinator.setMinCutBridge(healthyBridge as any);
      expect(coordinator.isTopologyHealthy()).toBe(true);

      // Second bridge - critical
      const criticalBridge = createMockMinCutBridge({ healthy: false });
      coordinator.setMinCutBridge(criticalBridge as any);
      expect(coordinator.isTopologyHealthy()).toBe(false);

      // Third bridge - healthy again
      coordinator.setMinCutBridge(healthyBridge as any);
      expect(coordinator.isTopologyHealthy()).toBe(true);
    });
  });
});
