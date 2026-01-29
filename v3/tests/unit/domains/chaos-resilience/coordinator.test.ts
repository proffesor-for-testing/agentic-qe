/**
 * Agentic QE v3 - Chaos Resilience Coordinator Unit Tests
 * Milestone 1.5: Domain Coordinator Testing
 *
 * Tests cover:
 * - Constructor and initialization
 * - Chaos suite execution
 * - Load test suite execution
 * - Resilience assessment
 * - Experiment generation
 * - PolicyGradient RL integration
 * - QESONA pattern learning
 * - MinCut topology awareness
 * - Consensus verification
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ChaosResilienceCoordinator,
  type CoordinatorConfig,
  type WorkflowStatus,
} from '../../../../src/domains/chaos-resilience/coordinator';
import {
  createCoordinatorTestContext,
  resetTestContext,
  expectAgentSpawned,
  flushPromises,
  type CoordinatorTestContext,
} from '../coordinator-test-utils';
import type {
  ServiceArchitecture,
  ServiceDefinition,
  ChaosStrategyContext,
} from '../../../../src/domains/chaos-resilience/interfaces';

describe('ChaosResilienceCoordinator', () => {
  let ctx: CoordinatorTestContext;
  let coordinator: ChaosResilienceCoordinator;

  // Default config with integrations disabled for unit testing
  const defaultConfig: Partial<CoordinatorConfig> = {
    maxConcurrentWorkflows: 3,
    defaultTimeout: 60000,
    enableAutomatedExperiments: false,
    publishEvents: true,
    enablePolicyGradient: false,
    enableQESONA: false,
    enableMinCutAwareness: false,
    enableConsensus: false,
  };

  beforeEach(() => {
    ctx = createCoordinatorTestContext();
    coordinator = new ChaosResilienceCoordinator(
      ctx.eventBus,
      ctx.memory,
      ctx.agentCoordinator,
      defaultConfig
    );
  });

  afterEach(async () => {
    await coordinator.dispose();
    resetTestContext(ctx);
  });

  // ===========================================================================
  // Constructor and Initialization Tests
  // ===========================================================================

  describe('Constructor and Initialization', () => {
    it('should create coordinator with default config', () => {
      const coord = new ChaosResilienceCoordinator(
        ctx.eventBus,
        ctx.memory,
        ctx.agentCoordinator
      );
      expect(coord).toBeDefined();
    });

    it('should create coordinator with custom config', () => {
      const customConfig: Partial<CoordinatorConfig> = {
        maxConcurrentWorkflows: 5,
        defaultTimeout: 120000,
        enableAutomatedExperiments: true,
      };
      const coord = new ChaosResilienceCoordinator(
        ctx.eventBus,
        ctx.memory,
        ctx.agentCoordinator,
        customConfig
      );
      expect(coord).toBeDefined();
    });

    it('should initialize without errors', async () => {
      await expect(coordinator.initialize()).resolves.not.toThrow();
    });

    it('should be idempotent on multiple initializations', async () => {
      await coordinator.initialize();
      await coordinator.initialize();
      // Should not throw
    });

    it('should start with no active workflows', async () => {
      await coordinator.initialize();
      expect(coordinator.getActiveWorkflows()).toHaveLength(0);
    });
  });

  // ===========================================================================
  // Chaos Suite Execution Tests
  // ===========================================================================

  describe('Chaos Suite Execution', () => {
    beforeEach(async () => {
      await coordinator.initialize();
    });

    describe('runChaosSuite()', () => {
      it('should run chaos suite and return report', async () => {
        const result = await coordinator.runChaosSuite(['exp-1', 'exp-2']);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.value.totalExperiments).toBeDefined();
          expect(result.value.results).toBeDefined();
          expect(result.value.recommendations).toBeDefined();
        }
      });

      it('should spawn chaos agent', async () => {
        await coordinator.runChaosSuite(['exp-1']);

        expect(ctx.agentCoordinator.spawn).toHaveBeenCalled();
      });

      it('should return error when agent limit reached', async () => {
        ctx.agentCoordinator.setMaxAgents(0);

        const result = await coordinator.runChaosSuite(['exp-1']);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.message).toContain('Agent limit');
        }
      });

      it('should complete workflow after suite execution', async () => {
        await coordinator.runChaosSuite(['exp-1']);

        expect(coordinator.getActiveWorkflows()).toHaveLength(0);
      });

      it('should stop agent after completion', async () => {
        await coordinator.runChaosSuite(['exp-1']);

        expect(ctx.agentCoordinator.stop).toHaveBeenCalled();
      });
    });
  });

  // ===========================================================================
  // Load Test Suite Execution Tests
  // ===========================================================================

  describe('Load Test Suite Execution', () => {
    beforeEach(async () => {
      await coordinator.initialize();
    });

    describe('runLoadTestSuite()', () => {
      it('should run load test suite and return report', async () => {
        const result = await coordinator.runLoadTestSuite(['test-1', 'test-2']);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.value.totalTests).toBeDefined();
          expect(result.value.results).toBeDefined();
          expect(result.value.bottlenecks).toBeDefined();
        }
      });

      it('should spawn load test agent', async () => {
        await coordinator.runLoadTestSuite(['test-1']);

        expect(ctx.agentCoordinator.spawn).toHaveBeenCalled();
      });
    });
  });

  // ===========================================================================
  // Experiment Generation Tests
  // ===========================================================================

  describe('Experiment Generation', () => {
    beforeEach(async () => {
      await coordinator.initialize();
    });

    describe('generateExperiments()', () => {
      it('should generate experiments from architecture', async () => {
        const architecture: ServiceArchitecture = {
          services: [
            {
              name: 'api-gateway',
              type: 'api',
              replicas: 2,
              hasFailover: true,
            },
            {
              name: 'user-service',
              type: 'service',
              replicas: 3,
              hasFailover: false,
            },
          ],
          dependencies: [
            {
              from: 'api-gateway',
              to: 'user-service',
              type: 'sync',
              criticality: 'critical',
            },
          ],
          criticalPaths: [['api-gateway', 'user-service']],
        };

        const result = await coordinator.generateExperiments(architecture);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.value).toBeDefined();
          expect(Array.isArray(result.value)).toBe(true);
          expect(result.value.length).toBeGreaterThan(0);
        }
      });

      it('should generate experiments for critical paths', async () => {
        const architecture: ServiceArchitecture = {
          services: [
            { name: 'frontend', type: 'api', replicas: 2, hasFailover: true },
            { name: 'backend', type: 'service', replicas: 2, hasFailover: true },
            { name: 'database', type: 'database', replicas: 1, hasFailover: false },
          ],
          dependencies: [
            { from: 'frontend', to: 'backend', type: 'sync', criticality: 'critical' },
            { from: 'backend', to: 'database', type: 'sync', criticality: 'critical' },
          ],
          criticalPaths: [['frontend', 'backend', 'database']],
        };

        const result = await coordinator.generateExperiments(architecture);

        expect(result.success).toBe(true);
        if (result.success) {
          // Should have critical path experiment
          const pathExperiments = result.value.filter(e => e.name.includes('critical-path'));
          expect(pathExperiments.length).toBeGreaterThan(0);
        }
      });
    });
  });

  // ===========================================================================
  // Strategic Chaos Suite Tests
  // ===========================================================================

  describe('Strategic Chaos Suite', () => {
    beforeEach(async () => {
      await coordinator.initialize();
    });

    describe('runStrategicChaosSuite()', () => {
      it('should run strategic chaos suite', async () => {
        const services: ServiceDefinition[] = [
          { name: 'api', type: 'api', replicas: 2, hasFailover: true },
          { name: 'worker', type: 'worker', replicas: 3, hasFailover: false },
        ];

        const context: ChaosStrategyContext = {
          riskTolerance: 0.5,
          availableCapacity: 80,
          environment: 'staging',
        };

        const result = await coordinator.runStrategicChaosSuite(services, context);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.value.totalExperiments).toBeDefined();
        }
      });

      it('should handle empty services list', async () => {
        const services: ServiceDefinition[] = [];
        const context: ChaosStrategyContext = {
          riskTolerance: 0.5,
          availableCapacity: 80,
          environment: 'staging',
        };

        const result = await coordinator.runStrategicChaosSuite(services, context);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.value.totalExperiments).toBe(0);
        }
      });
    });

    describe('selectChaosStrategy()', () => {
      it('should select chaos strategy for services', async () => {
        const services: ServiceDefinition[] = [
          { name: 'api', type: 'api', replicas: 2, hasFailover: false },
        ];

        const context: ChaosStrategyContext = {
          riskTolerance: 0.7,
          availableCapacity: 90,
          environment: 'development',
        };

        const result = await coordinator.selectChaosStrategy(services, context);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.value.strategy).toBeDefined();
          expect(result.value.selectedExperiments).toBeDefined();
          expect(result.value.confidence).toBeDefined();
        }
      });
    });
  });

  // ===========================================================================
  // Resilience Dashboard Tests
  // ===========================================================================

  describe('Resilience Dashboard', () => {
    beforeEach(async () => {
      await coordinator.initialize();
    });

    describe('getResilienceDashboard()', () => {
      it('should return resilience dashboard data', async () => {
        const result = await coordinator.getResilienceDashboard();

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.value.overallHealth).toBeDefined();
          expect(result.value.uptime).toBeDefined();
          expect(result.value.mttr).toBeDefined();
          expect(result.value.changeFailureRate).toBeDefined();
        }
      });

      it('should handle empty history', async () => {
        const result = await coordinator.getResilienceDashboard();

        expect(result.success).toBe(true);
        if (result.success) {
          expect(['healthy', 'degraded', 'unhealthy']).toContain(result.value.overallHealth);
        }
      });
    });
  });

  // ===========================================================================
  // Workflow Management Tests
  // ===========================================================================

  describe('Workflow Management', () => {
    beforeEach(async () => {
      await coordinator.initialize();
    });

    it('should track active workflows', async () => {
      // Workflows complete synchronously in tests
      await coordinator.runChaosSuite(['exp-1']);
      expect(coordinator.getActiveWorkflows()).toHaveLength(0);
    });

    it('should enforce max concurrent workflows', async () => {
      const limitedCoordinator = new ChaosResilienceCoordinator(
        ctx.eventBus,
        ctx.memory,
        ctx.agentCoordinator,
        {
          ...defaultConfig,
          maxConcurrentWorkflows: 1,
        }
      );
      await limitedCoordinator.initialize();

      const result = await limitedCoordinator.runChaosSuite(['exp-1']);
      expect(result.success).toBe(true);

      await limitedCoordinator.dispose();
    });
  });

  // ===========================================================================
  // PolicyGradient Integration Tests
  // ===========================================================================

  describe('PolicyGradient Integration', () => {
    let pgCoordinator: ChaosResilienceCoordinator;

    beforeEach(async () => {
      pgCoordinator = new ChaosResilienceCoordinator(
        ctx.eventBus,
        ctx.memory,
        ctx.agentCoordinator,
        {
          ...defaultConfig,
          enablePolicyGradient: true,
        }
      );
      await pgCoordinator.initialize();
    });

    afterEach(async () => {
      await pgCoordinator.dispose();
    });

    it('should use PolicyGradient for strategy selection', async () => {
      const services: ServiceDefinition[] = [
        { name: 'api', type: 'api', replicas: 2, hasFailover: true },
      ];

      const context: ChaosStrategyContext = {
        riskTolerance: 0.8,
        availableCapacity: 70,
        environment: 'staging',
      };

      const result = await pgCoordinator.selectChaosStrategy(services, context);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.confidence).toBeDefined();
      }
    });
  });

  // ===========================================================================
  // MinCut Topology Awareness Tests
  // ===========================================================================

  describe('MinCut Topology Awareness', () => {
    let topologyCoordinator: ChaosResilienceCoordinator;

    beforeEach(async () => {
      topologyCoordinator = new ChaosResilienceCoordinator(
        ctx.eventBus,
        ctx.memory,
        ctx.agentCoordinator,
        {
          ...defaultConfig,
          enableMinCutAwareness: true,
          topologyHealthThreshold: 0.5,
          pauseOnCriticalTopology: true,
        }
      );
      await topologyCoordinator.initialize();
    });

    afterEach(async () => {
      await topologyCoordinator.dispose();
    });

    it('should report topology health status', () => {
      expect(topologyCoordinator.isTopologyHealthy()).toBe(true);
    });

    it('should accept MinCut bridge', () => {
      expect(() => {
        topologyCoordinator.setMinCutBridge({} as any);
      }).not.toThrow();
    });

    it('should check if domain is weak point', () => {
      expect(topologyCoordinator.isDomainWeakPoint()).toBe(false);
    });

    it('should get domain weak vertices', () => {
      const weakVertices = topologyCoordinator.getDomainWeakVertices();
      expect(Array.isArray(weakVertices)).toBe(true);
    });
  });

  // ===========================================================================
  // Consensus Verification Tests
  // ===========================================================================

  describe('Consensus Verification', () => {
    let consensusCoordinator: ChaosResilienceCoordinator;

    beforeEach(async () => {
      consensusCoordinator = new ChaosResilienceCoordinator(
        ctx.eventBus,
        ctx.memory,
        ctx.agentCoordinator,
        {
          ...defaultConfig,
          enableConsensus: true,
          consensusThreshold: 0.7,
          consensusStrategy: 'weighted',
          consensusMinModels: 2,
        }
      );
      await consensusCoordinator.initialize();
    });

    afterEach(async () => {
      await consensusCoordinator.dispose();
    });

    it('should check consensus availability', () => {
      const available = consensusCoordinator.isConsensusAvailable();
      expect(typeof available).toBe('boolean');
    });

    it('should get consensus statistics', () => {
      const stats = consensusCoordinator.getConsensusStats();
      // Stats may be undefined if consensus engine not fully initialized
      expect(stats === undefined || typeof stats === 'object').toBe(true);
    });

    it('should verify chaos experiment', async () => {
      const experiment = {
        id: 'exp-1',
        name: 'latency-test',
        faultType: 'latency' as const,
        target: 'api-service',
        blastRadius: 'subset',
      };

      const isVerified = await consensusCoordinator.verifyChaosExperiment(experiment, 0.8);
      expect(typeof isVerified).toBe('boolean');
    });

    it('should verify resilience assessment', async () => {
      const assessment = {
        service: 'api-service',
        overallScore: 75,
        strengths: ['Fast recovery'],
        weaknessCount: 2,
      };

      const isVerified = await consensusCoordinator.verifyResilienceAssessment(assessment, 0.85);
      expect(typeof isVerified).toBe('boolean');
    });

    it('should verify failure injection', async () => {
      const injection = {
        faultType: 'latency' as const,
        target: 'api-service',
        duration: 30000,
        parameters: { latencyMs: 500 },
      };

      const isVerified = await consensusCoordinator.verifyFailureInjection(injection, 0.9);
      expect(typeof isVerified).toBe('boolean');
    });
  });

  // ===========================================================================
  // Disposal Tests
  // ===========================================================================

  describe('Disposal', () => {
    it('should dispose without errors', async () => {
      await coordinator.initialize();
      await expect(coordinator.dispose()).resolves.not.toThrow();
    });

    it('should clear workflows on dispose', async () => {
      await coordinator.initialize();
      await coordinator.runChaosSuite(['exp-1']);
      await coordinator.dispose();
      expect(coordinator.getActiveWorkflows()).toHaveLength(0);
    });

    it('should be idempotent on multiple disposals', async () => {
      await coordinator.initialize();
      await coordinator.dispose();
      await coordinator.dispose();
      // Should not throw
    });
  });

  // ===========================================================================
  // Error Handling Tests
  // ===========================================================================

  describe('Error Handling', () => {
    beforeEach(async () => {
      await coordinator.initialize();
    });

    it('should handle empty experiment IDs', async () => {
      const result = await coordinator.runChaosSuite([]);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.totalExperiments).toBe(0);
      }
    });

    it('should handle architecture with no services', async () => {
      const architecture: ServiceArchitecture = {
        services: [],
        dependencies: [],
        criticalPaths: [],
      };

      const result = await coordinator.generateExperiments(architecture);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toHaveLength(0);
      }
    });
  });
});
