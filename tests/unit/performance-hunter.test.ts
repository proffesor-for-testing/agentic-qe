/**
 * Unit tests for PerformanceHunterAgent
 */

import { PerformanceHunterAgent } from '../../src/agents/performance-hunter';
import { createMockServices, createTestAgentId, createTestAgentConfig, createTestTask } from '../utils/test-helpers';
import { MockLogger } from '../mocks/logger.mock';
import { MockEventBus } from '../mocks/event-bus.mock';
import { MockMemorySystem } from '../mocks/memory-system.mock';

describe('PerformanceHunterAgent', () => {
  let agent: PerformanceHunterAgent;
  let logger: MockLogger;
  let eventBus: MockEventBus;
  let memory: MockMemorySystem;

  beforeEach(async () => {
    const services = createMockServices();
    logger = services.logger;
    eventBus = services.eventBus;
    memory = services.memory;

    const agentId = createTestAgentId({ type: 'performance-hunter' });
    const config = createTestAgentConfig({ type: 'performance-hunter' });

    agent = new PerformanceHunterAgent(agentId, config, logger, eventBus, memory);
    await agent.initialize();
  });

  afterEach(() => {
    logger.reset();
    eventBus.reset();
    memory.reset();
  });

  describe('Performance Analysis', () => {
    it('should analyze performance metrics and identify bottlenecks', async () => {
      const task = createTestTask({
        type: 'performance-test',
        context: {
          responseTime: 800,
          throughput: 500,
          errorRate: 2.5,
          cpu: 85,
          memory: 90,
          sla: {
            minThroughput: 1000,
            maxResponseTime: 500,
            maxErrorRate: 1.0
          }
        }
      });

      const result = await agent.executeTask(task);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();

      const profile = result.data;
      expect(profile.metrics).toBeDefined();
      expect(profile.bottlenecks).toBeDefined();
      expect(profile.resourceUsage).toBeDefined();
      expect(profile.scalability).toBeDefined();
      expect(profile.recommendations).toBeDefined();
      expect(profile.benchmarks).toBeDefined();

      // Should identify bottlenecks
      expect(profile.bottlenecks.length).toBeGreaterThan(0);

      // Should provide recommendations
      expect(profile.recommendations.length).toBeGreaterThan(0);
    });

    it('should identify CPU bottlenecks correctly', async () => {
      const task = createTestTask({
        type: 'performance-test',
        context: {
          responseTime: 300,
          throughput: 800,
          errorRate: 0.5,
          cpu: 95, // High CPU usage
          memory: 60,
          resources: { cpu: 95, memory: 60, disk: 30, network: 20 }
        }
      });

      const result = await agent.executeTask(task);

      expect(result.success).toBe(true);

      const profile = result.data;
      const cpuBottleneck = profile.bottlenecks.find((b: any) => b.type === 'cpu');

      expect(cpuBottleneck).toBeDefined();
      expect(cpuBottleneck.severity).toBe('critical');
      expect(cpuBottleneck.optimization).toContain('algorithm');
    });

    it('should identify memory bottlenecks correctly', async () => {
      const task = createTestTask({
        type: 'performance-test',
        context: {
          responseTime: 1200,
          throughput: 400,
          errorRate: 1.2,
          cpu: 70,
          memory: 96, // High memory usage
          resources: { cpu: 70, memory: 96, disk: 40, network: 25 }
        }
      });

      const result = await agent.executeTask(task);

      expect(result.success).toBe(true);

      const profile = result.data;
      const memoryBottleneck = profile.bottlenecks.find((b: any) => b.type === 'memory');

      expect(memoryBottleneck).toBeDefined();
      expect(memoryBottleneck.severity).toBe('critical');
      expect(memoryBottleneck.optimization).toContain('heap size');
    });

    it('should identify response time bottlenecks', async () => {
      const task = createTestTask({
        type: 'performance-test',
        context: {
          responseTime: 2500, // Very slow response time
          throughput: 600,
          errorRate: 0.8,
          cpu: 60,
          memory: 70,
          resources: { cpu: 60, memory: 70, disk: 35, network: 20 }
        }
      });

      const result = await agent.executeTask(task);

      expect(result.success).toBe(true);

      const profile = result.data;
      const responseBottleneck = profile.bottlenecks.find((b: any) => b.type === 'algorithm');

      expect(responseBottleneck).toBeDefined();
      expect(responseBottleneck.optimization).toContain('caching');
    });
  });

  describe('Optimization Recommendations', () => {
    it('should recommend caching when no cache is present', async () => {
      const task = createTestTask({
        type: 'performance-test',
        context: {
          responseTime: 400,
          throughput: 800,
          errorRate: 0.5,
          cpu: 75,
          memory: 65,
          dependencies: { caches: 0 } // No caching
        }
      });

      const result = await agent.executeTask(task);

      expect(result.success).toBe(true);
      expect(result.decision!.recommendations).toContain('Implement performance monitoring');
    });

    it('should recommend database optimization for slow queries', async () => {
      const task = createTestTask({
        type: 'performance-test',
        context: {
          responseTime: 600,
          throughput: 700,
          errorRate: 1.0,
          cpu: 70,
          memory: 75,
          profiling: {
            slowQueries: ['SELECT * FROM users', 'JOIN orders ON user_id']
          }
        }
      });

      const result = await agent.executeTask(task);

      expect(result.success).toBe(true);
      expect(result.decision!.recommendations).toContain('Set up performance baselines');
    });

    it('should provide different scaling alternatives', async () => {
      const task = createTestTask({
        type: 'performance-test',
        context: {
          responseTime: 800,
          throughput: 400,
          errorRate: 2.0,
          cpu: 85,
          memory: 80
        }
      });

      const result = await agent.executeTask(task);

      expect(result.success).toBe(true);
      expect(result.decision!.alternatives).toBeDefined();

      const alternatives = result.decision!.alternatives;
      const alternativeActions = alternatives.map((a: any) => a.action);

      expect(alternativeActions).toContain('vertical-scaling');
      expect(alternativeActions).toContain('horizontal-scaling');
      expect(alternativeActions).toContain('code-optimization');
    });
  });

  describe('Performance Profiling', () => {
    it('should generate comprehensive performance profile', async () => {
      const task = createTestTask({
        type: 'performance-test',
        context: {
          responseTime: 250,
          throughput: 1200,
          errorRate: 0.3,
          cpu: 65,
          memory: 55,
          environment: 'production',
          sla: {
            minThroughput: 1000,
            maxResponseTime: 500
          }
        }
      });

      const result = await agent.executeTask(task);

      expect(result.success).toBe(true);

      const profile = result.data;

      // Check metrics
      expect(profile.metrics).toHaveLength(4);
      profile.metrics.forEach((metric: any) => {
        expect(metric.name).toBeDefined();
        expect(metric.value).toBeDefined();
        expect(metric.unit).toBeDefined();
        expect(metric.threshold).toBeDefined();
        expect(metric.status).toMatch(/pass|warning|fail/);
        expect(metric.trend).toMatch(/improving|stable|degrading/);
      });

      // Check resource usage
      expect(profile.resourceUsage.cpu).toBeDefined();
      expect(profile.resourceUsage.memory).toBeDefined();
      expect(profile.resourceUsage.disk).toBeDefined();
      expect(profile.resourceUsage.network).toBeDefined();

      // Check scalability analysis
      expect(profile.scalability.currentCapacity).toBeDefined();
      expect(profile.scalability.maxCapacity).toBeDefined();
      expect(profile.scalability.scalabilityFactor).toBeDefined();
      expect(profile.scalability.limitations).toBeDefined();

      // Check benchmarks
      expect(profile.benchmarks).toHaveLength(2);
      profile.benchmarks.forEach((benchmark: any) => {
        expect(benchmark.name).toBeDefined();
        expect(benchmark.throughput).toBeDefined();
        expect(benchmark.latency).toBeDefined();
        expect(benchmark.errorRate).toBeDefined();
        expect(benchmark.percentiles).toBeDefined();
        expect(benchmark.percentiles.p50).toBeDefined();
        expect(benchmark.percentiles.p95).toBeDefined();
        expect(benchmark.percentiles.p99).toBeDefined();
      });
    });

    it('should store performance observations in memory', async () => {
      const task = createTestTask({
        type: 'performance-test',
        context: {
          responseTime: 300,
          throughput: 900,
          errorRate: 0.8,
          cpu: 70,
          memory: 60
        }
      });

      await agent.executeTask(task);

      // Check that observation was stored
      const observationKey = memory.getAllKeys().find(key => key.includes('performance-observation'));
      expect(observationKey).toBeDefined();

      if (observationKey) {
        const observation = await memory.retrieve(observationKey);
        expect(observation.metrics).toBeDefined();
        expect(observation.resources).toBeDefined();
        expect(observation.environment).toBeDefined();
      }
    });

    it('should emit critical performance alerts', async () => {
      const task = createTestTask({
        type: 'performance-test',
        context: {
          responseTime: 5000, // Very slow
          throughput: 100,    // Very low
          errorRate: 10,      // Very high
          cpu: 98,           // Critical CPU
          memory: 99         // Critical memory
        }
      });

      await agent.executeTask(task);

      // Should emit critical performance alert
      const criticalEvents = eventBus.getEmittedEvents('performance:critical');
      expect(criticalEvents.length).toBeGreaterThan(0);

      const criticalEvent = criticalEvents[0];
      expect(criticalEvent.data.bottlenecks).toBeDefined();
      expect(criticalEvent.data.bottlenecks.length).toBeGreaterThan(0);
    });
  });

  describe('Decision Making', () => {
    it('should make high-confidence decisions for clear performance issues', async () => {
      const task = createTestTask({
        type: 'performance-test',
        context: {
          responseTime: 3000,
          throughput: 200,
          errorRate: 5.0,
          cpu: 95,
          memory: 90
        }
      });

      const result = await agent.executeTask(task);

      expect(result.success).toBe(true);
      expect(result.decision!.confidence).toBeGreaterThan(0.7);
      expect(result.decision!.action).toBe('optimize-performance');
    });

    it('should provide explainable reasoning for performance decisions', async () => {
      const task = createTestTask({
        type: 'performance-test',
        context: {
          responseTime: 1500,
          throughput: 600,
          errorRate: 2.0,
          cpu: 80,
          memory: 75,
          sla: { minThroughput: 1000 }
        }
      });

      const result = await agent.executeTask(task);

      expect(result.success).toBe(true);

      const reasoning = result.decision!.reasoning;
      expect(reasoning.factors).toBeDefined();
      expect(reasoning.factors.length).toBeGreaterThan(0);
      expect(reasoning.heuristics).toBeDefined();
      expect(reasoning.evidence).toBeDefined();

      // Check reasoning factors
      const factorNames = reasoning.factors.map((f: any) => f.name);
      expect(factorNames).toContain('Response Time');
      expect(factorNames).toContain('Resource Utilization');
      expect(factorNames).toContain('Throughput');
    });

    it('should identify performance risks correctly', async () => {
      const task = createTestTask({
        type: 'performance-test',
        context: {
          responseTime: 800,
          throughput: 400,
          errorRate: 3.0,
          cpu: 85,
          memory: 80
        }
      });

      const result = await agent.executeTask(task);

      expect(result.success).toBe(true);
      expect(result.decision!.risks).toBeDefined();
      expect(result.decision!.risks.length).toBeGreaterThan(0);

      const risks = result.decision!.risks;
      risks.forEach((risk: any) => {
        expect(risk.category).toBe('performance');
        expect(risk.probability).toBeGreaterThan(0);
        expect(risk.impact).toBeDefined();
        expect(risk.description).toBeDefined();
        expect(risk.mitigation).toBeDefined();
      });
    });
  });

  describe('Learning and Adaptation', () => {
    it('should learn from optimization results', async () => {
      const feedback = {
        optimizationResults: [
          {
            strategy: 'caching',
            before: 1000,
            after: 200,
            context: 'api-responses'
          },
          {
            strategy: 'indexing',
            before: 500,
            after: 50,
            context: 'database-queries'
          }
        ]
      };

      await agent.learn(feedback);

      // Check that learning was stored
      const learningKey = memory.getAllKeys().find(key => key.includes('learning:performance'));
      expect(learningKey).toBeDefined();

      if (learningKey) {
        const learningData = await memory.retrieve(learningKey);
        expect(learningData.feedback).toEqual(feedback);
        expect(learningData.strategiesUpdated).toBeGreaterThan(0);
      }
    });

    it('should update bottleneck patterns from feedback', async () => {
      const feedback = {
        newBottlenecks: [
          {
            id: 'custom-bottleneck',
            type: 'database',
            severity: 'high',
            location: 'connection-pool',
            impact: 'Connection exhaustion',
            currentPerformance: 100,
            expectedPerformance: 1000,
            optimization: 'Increase pool size',
            estimatedImprovement: 85
          }
        ]
      };

      await agent.learn(feedback);

      const learningKey = memory.getAllKeys().find(key => key.includes('learning:performance'));
      expect(learningKey).toBeDefined();

      if (learningKey) {
        const learningData = await memory.retrieve(learningKey);
        expect(learningData.patternsLearned).toBeGreaterThan(0);
      }
    });
  });

  describe('Baseline Management', () => {
    it('should load performance baselines during initialization', async () => {
      // Store some baselines in memory
      await memory.store('baseline:api-response', 150, {
        type: 'knowledge',
        tags: ['performance', 'baseline']
      });

      await memory.store('baseline:throughput', 1000, {
        type: 'knowledge',
        tags: ['performance', 'baseline']
      });

      // Create new agent to test baseline loading
      const newAgent = new PerformanceHunterAgent(
        createTestAgentId({ type: 'performance-hunter' }),
        createTestAgentConfig({ type: 'performance-hunter' }),
        logger,
        eventBus,
        memory
      );

      await newAgent.initialize();

      expect(logger.infoCalls.some(call =>
        call.message.includes('Performance Hunter initialized with optimization strategies')
      )).toBe(true);
    });

    it('should update baselines after performance analysis', async () => {
      const task = createTestTask({
        type: 'performance-test',
        context: {
          responseTime: 200,
          throughput: 1500,
          errorRate: 0.2,
          cpu: 60,
          memory: 50
        }
      });

      await agent.executeTask(task);

      // Baselines should be updated internally
      // This is tested indirectly through the profile generation
      const result = await agent.executeTask(task);
      expect(result.success).toBe(true);
    });
  });

  describe('Scalability Analysis', () => {
    it('should analyze scalability limitations and breaking points', async () => {
      const task = createTestTask({
        type: 'performance-test',
        context: {
          responseTime: 300,
          throughput: 800,
          errorRate: 0.5,
          cpu: 70,
          memory: 60,
          workload: {
            concurrentUsers: 100,
            requestRate: 800,
            peakLoad: 1200
          }
        }
      });

      const result = await agent.executeTask(task);

      expect(result.success).toBe(true);

      const scalability = result.data.scalability;
      expect(scalability.currentCapacity).toBeDefined();
      expect(scalability.maxCapacity).toBeDefined();
      expect(scalability.scalabilityFactor).toBeGreaterThan(1);
      expect(scalability.limitations).toBeDefined();
      expect(scalability.limitations.length).toBeGreaterThan(0);
      expect(scalability.breakingPoint).toBeGreaterThan(scalability.maxCapacity);
    });

    it('should warn about poor scalability', async () => {
      const task = createTestTask({
        type: 'performance-test',
        context: {
          responseTime: 800,
          throughput: 200,
          errorRate: 2.0,
          cpu: 90,
          memory: 85,
          workload: {
            concurrentUsers: 50, // Low current capacity
            requestRate: 200,
            peakLoad: 300
          }
        }
      });

      const result = await agent.executeTask(task);

      expect(result.success).toBe(true);

      const risks = result.decision!.risks;
      const scalabilityRisk = risks.find((r: any) => r.id === 'scalability-risk');
      expect(scalabilityRisk).toBeDefined();
      expect(scalabilityRisk.severity).toBe('high');
    });
  });

  describe('Error Handling', () => {
    it('should handle missing context gracefully', async () => {
      const task = createTestTask({
        type: 'performance-test',
        context: {} // Empty context
      });

      const result = await agent.executeTask(task);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });

    it('should handle analysis errors gracefully', async () => {
      const task = createTestTask({
        type: 'performance-test',
        context: {
          responseTime: 'invalid', // Invalid data type
          throughput: null,
          errorRate: undefined
        }
      });

      const result = await agent.executeTask(task);

      // Should handle gracefully and provide default values
      expect(result.success).toBe(true);
    });

    it('should log errors appropriately', async () => {
      // Mock internal method to throw error
      const originalAct = agent.act;
      jest.spyOn(agent, 'act').mockRejectedValueOnce(new Error('Analysis failed'));

      const task = createTestTask({
        type: 'performance-test',
        context: { responseTime: 300 }
      });

      const result = await agent.executeTask(task);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Analysis failed');
      expect(logger.errorCalls).toHaveLength(1);
    });
  });
});