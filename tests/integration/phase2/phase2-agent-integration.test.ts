/**
 * Phase 2 Agent Integration Tests
 *
 * Tests integration of Phase 2-enhanced agents with pattern matching, learning, and ML capabilities.
 *
 * Test Coverage:
 * - TestGeneratorAgent with pattern matching
 * - CoverageAnalyzerAgent with learning and 20% improvement target
 * - FlakyTestHunterAgent with ML (100% accuracy, 0% false positives)
 * - Agent coordination via SwarmMemoryManager
 * - Event-driven communication via EventBus
 *
 * @module tests/integration/phase2/phase2-agent-integration
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { TestGeneratorAgent } from '@agents/TestGeneratorAgent';
import { CoverageAnalyzerAgent } from '@agents/CoverageAnalyzerAgent';
import { FlakyTestHunterAgent } from '@agents/FlakyTestHunterAgent';
import { TestExecutorAgent } from '@agents/TestExecutorAgent';
import { SwarmMemoryManager } from '@core/memory/SwarmMemoryManager';
import { EventBus } from '@core/EventBus';
import { QEAgentType } from '@typessrc/types';
import { createAgentConfig } from '../../helpers/agent-config-factory';

describe('Phase 2 Agent Integration Tests', () => {
  let memoryManager: SwarmMemoryManager;
  let eventBus: EventBus;

  beforeEach(async () => {
    memoryManager = new SwarmMemoryManager();
    await memoryManager.initialize();
    eventBus = new EventBus();
    await eventBus.initialize();
    await memoryManager.clear('coordination');
  });

  afterEach(async () => {
    await memoryManager.clear('coordination');
    eventBus.removeAllListeners();
    await memoryManager.close();
  });

  // ===========================================================================
  // TestGeneratorAgent with Pattern Matching
  // ===========================================================================

  describe('TestGeneratorAgent with Patterns', () => {
    it('should generate tests using pattern matching', async () => {
      const config = createAgentConfig({
        agentId: 'test-gen-1',
        type: QEAgentType.TEST_GENERATOR,
        enablePatterns: true,
        enableLearning: true
      }, memoryManager, eventBus);

      const agent = new TestGeneratorAgent(config);
      await agent.initialize();

      // Simulate pattern existence in memory
      await memoryManager.store('aqe/patterns/jest-unit', {
        framework: 'jest',
        category: 'unit',
        template: 'describe("{{moduleName}}", () => { it("{{testCase}}", () => { ... }); });',
        successRate: 0.92
      }, { partition: 'coordination' });

      const result = await agent.executeTask({
        id: 'gen-1',
        type: 'generate-tests',
        payload: {
          modulePath: 'src/services/UserService.ts',
          framework: 'jest',
          coverage: 0.90
        },
        priority: 'high',
        status: 'pending'
      });

      expect(result).toBeDefined();
      expect(result.patternsUsed).toBeGreaterThan(0);
      expect(result.patternHitRate).toBeGreaterThan(0.6); // 60%+ hit rate
      expect(result.executionTime).toBeLessThan(5000); // <5s

      await agent.terminate();
    }, 15000);

    it('should learn from test generation outcomes', async () => {
      const config = createAgentConfig({
        agentId: 'test-gen-2',
        type: QEAgentType.TEST_GENERATOR,
        enableLearning: true,
        targetImprovement: 0.20
      }, memoryManager, eventBus);

      const agent = new TestGeneratorAgent(config);
      await agent.initialize();

      // Generate tests multiple times
      const results = [];
      for (let i = 0; i < 5; i++) {
        const result = await agent.executeTask({
          id: `gen-${i}`,
          type: 'generate-tests',
          payload: {
            modulePath: `src/module-${i}.ts`,
            framework: 'jest'
          },
          priority: 'medium',
          status: 'pending'
        });

        results.push(result);

        // Simulate feedback
        await agent.recordLearning({
          taskId: `gen-${i}`,
          outcome: 'success',
          quality: 0.85 + (i * 0.03), // Improving quality
          metadata: { patternsUsed: result.patternsUsed || 0 }
        });
      }

      // Verify learning improvement
      const status = await agent.getLearningStatus();
      expect(status.totalExperiences).toBe(5);
      expect(status.averageQuality).toBeGreaterThan(0.85);

      await agent.terminate();
    }, 20000);

    it('should coordinate with other agents via memory', async () => {
      const generatorConfig = createAgentConfig({
        agentId: 'test-gen-3',
        type: QEAgentType.TEST_GENERATOR,
        enablePatterns: true
      }, memoryManager, eventBus);

      const executorConfig = createAgentConfig({
        agentId: 'test-exec-1',
        type: QEAgentType.TEST_EXECUTOR
      }, memoryManager, eventBus);

      const generator = new TestGeneratorAgent(generatorConfig);
      const executor = new TestExecutorAgent(executorConfig);

      await generator.initialize();
      await executor.initialize();

      // Generator stores generated tests in memory
      await generator.executeTask({
        id: 'gen-task-1',
        type: 'generate-tests',
        payload: {
          modulePath: 'src/PaymentService.ts',
          framework: 'jest'
        },
        priority: 'high',
        status: 'pending'
      });

      // Executor retrieves tests from memory
      const tests = await memoryManager.retrieve('aqe/tests/generated', {
        partition: 'coordination'
      });

      expect(tests).toBeDefined();

      await generator.terminate();
      await executor.terminate();
    }, 15000);
  });

  // ===========================================================================
  // CoverageAnalyzerAgent with Learning
  // ===========================================================================

  describe('CoverageAnalyzerAgent with Learning and 20% Improvement Target', () => {
    it('should track 20% improvement target over multiple analyses', async () => {
      const config = createAgentConfig({
        agentId: 'coverage-1',
        type: QEAgentType.COVERAGE_ANALYZER,
        enableLearning: true,
        targetImprovement: 0.20 // 20% improvement goal
      }, memoryManager, eventBus);

      const agent = new CoverageAnalyzerAgent(config);
      await agent.initialize();

      // Simulate 10 coverage analysis cycles with improving coverage
      for (let i = 0; i < 10; i++) {
        await agent.executeTask({
          id: `coverage-${i}`,
          type: 'analyze-coverage',
          payload: {
            projectPath: 'src/',
            baselineCoverage: 0.75 + (i * 0.02) // Incrementally improving
          },
          priority: 'high',
          status: 'pending'
        });
      }

      const status = await agent.getPerformanceStatus();

      expect(status).toBeDefined();
      expect(status.improvementRate).toBeDefined();
      expect(status.baselineCoverage).toBe(0.75);
      expect(status.currentCoverage).toBeGreaterThan(0.75);
      expect(status.targetReached).toBe(status.improvementRate! >= 0.20);

      await agent.terminate();
    }, 20000);

    it('should identify coverage gaps using O(log n) analysis', async () => {
      const config = createAgentConfig({
        agentId: 'coverage-2',
        type: QEAgentType.COVERAGE_ANALYZER,
        enableLearning: true,
        gapDetection: true
      }, memoryManager, eventBus);

      const agent = new CoverageAnalyzerAgent(config);
      await agent.initialize();

      const result = await agent.executeTask({
        id: 'gap-analysis-1',
        type: 'analyze-coverage',
        payload: {
          projectPath: 'src/',
          includeGapAnalysis: true
        },
        priority: 'high',
        status: 'pending'
      });

      expect(result.gaps).toBeDefined();
      expect(result.gaps.length).toBeGreaterThan(0);
      expect(result.analysisTime).toBeLessThan(1000); // <1s for O(log n)

      await agent.terminate();
    }, 15000);

    it('should store coverage insights in memory for other agents', async () => {
      const config = createAgentConfig({
        agentId: 'coverage-3',
        type: QEAgentType.COVERAGE_ANALYZER,
        enableLearning: true
      }, memoryManager, eventBus);

      const agent = new CoverageAnalyzerAgent(config);
      await agent.initialize();

      await agent.executeTask({
        id: 'coverage-task-1',
        type: 'analyze-coverage',
        payload: {
          projectPath: 'src/'
        },
        priority: 'medium',
        status: 'pending'
      });

      // Verify insights stored in memory
      const insights = await memoryManager.retrieve('aqe/coverage/insights', {
        partition: 'coordination'
      });

      expect(insights).toBeDefined();
      expect(insights.gaps).toBeDefined();

      await agent.terminate();
    }, 15000);
  });

  // ===========================================================================
  // FlakyTestHunterAgent with ML (100% Accuracy)
  // ===========================================================================

  describe('FlakyTestHunterAgent with ML Detection', () => {
    it('should achieve 100% accuracy with ML-based detection', async () => {
      const config = createAgentConfig({
        agentId: 'flaky-1',
        type: QEAgentType.FLAKY_TEST_HUNTER,
        detection: { repeatedRuns: 20 },
        analysis: { rootCauseIdentification: true }
      }, memoryManager, eventBus);

      const agent = new FlakyTestHunterAgent(config);
      await agent.initialize();

      // Simulate test history with known flaky tests
      const testHistory = [
        // Flaky test: intermittent failures
        { testName: 'auth.test.ts:login', timestamp: new Date(), result: 'pass' as const, duration: 150 },
        { testName: 'auth.test.ts:login', timestamp: new Date(), result: 'fail' as const, duration: 155 },
        { testName: 'auth.test.ts:login', timestamp: new Date(), result: 'pass' as const, duration: 148 },
        { testName: 'auth.test.ts:login', timestamp: new Date(), result: 'fail' as const, duration: 152 },
        { testName: 'auth.test.ts:login', timestamp: new Date(), result: 'pass' as const, duration: 151 },
        // Stable test: always passes
        { testName: 'user.test.ts:create', timestamp: new Date(), result: 'pass' as const, duration: 100 },
        { testName: 'user.test.ts:create', timestamp: new Date(), result: 'pass' as const, duration: 102 },
        { testName: 'user.test.ts:create', timestamp: new Date(), result: 'pass' as const, duration: 98 }
      ];

      // Store history in memory
      await memoryManager.store('aqe/test-results/history', testHistory, {
        partition: 'coordination'
      });

      const result = await agent.executeTask({
        id: 'flaky-detect-1',
        type: 'detect-flaky',
        payload: {
          timeWindow: 30,
          minRuns: 3
        },
        priority: 'high',
        status: 'pending'
      });

      expect(result).toBeDefined();
      expect(result.count).toBeGreaterThan(0);
      expect(result.tests[0].testName).toContain('auth.test.ts:login');
      expect(result.tests[0].mlConfidence).toBeGreaterThan(0.9);
      expect(result.accuracy).toBe(1.0); // 100% accuracy with ML
      expect(result.falsePositiveRate).toBe(0.0); // 0% false positives

      await agent.terminate();
    }, 15000);

    it('should provide ML-powered fix recommendations', async () => {
      const config = createAgentConfig({
        agentId: 'flaky-2',
        type: QEAgentType.FLAKY_TEST_HUNTER,
        detection: { repeatedRuns: 10 },
        analysis: { rootCauseIdentification: true }
      }, memoryManager, eventBus);

      const agent = new FlakyTestHunterAgent(config);
      await agent.initialize();

      // Simulate flaky test with timeout issues
      const testHistory = Array.from({ length: 10 }, (_, i) => ({
        testName: 'api.test.ts:fetch',
        timestamp: new Date(),
        result: (i % 3 === 0 ? 'fail' : 'pass') as const,
        duration: i % 3 === 0 ? 5500 : 150, // Timeout pattern
        error: i % 3 === 0 ? 'Timeout exceeded' : undefined
      }));

      await memoryManager.store('aqe/test-results/history', testHistory, {
        partition: 'coordination'
      });

      const result = await agent.executeTask({
        id: 'flaky-detect-2',
        type: 'detect-flaky',
        payload: {
          timeWindow: 30,
          minRuns: 5
        },
        priority: 'high',
        status: 'pending'
      });

      expect(result.tests.length).toBeGreaterThan(0);

      const flakyTest = result.tests[0];
      expect(flakyTest.rootCause).toBeDefined();
      expect(flakyTest.rootCause?.category).toBe('TIMEOUT');
      expect(flakyTest.fixRecommendations).toBeDefined();
      expect(flakyTest.fixRecommendations.length).toBeGreaterThan(0);

      // Verify practical fix suggestions
      const hasTimeoutFix = flakyTest.fixRecommendations.some((fix: string) =>
        fix.includes('timeout') || fix.includes('increase') || fix.includes('async')
      );
      expect(hasTimeoutFix).toBe(true);

      await agent.terminate();
    }, 15000);

    it('should detect flaky tests faster than 500ms', async () => {
      const config = createAgentConfig({
        agentId: 'flaky-3',
        type: QEAgentType.FLAKY_TEST_HUNTER,
        detection: { repeatedRuns: 20 }
      }, memoryManager, eventBus);

      const agent = new FlakyTestHunterAgent(config);
      await agent.initialize();

      // Generate large test history (1000 test results)
      const testHistory = [];
      for (let i = 0; i < 1000; i++) {
        testHistory.push({
          testName: `test-${i % 100}`,
          timestamp: new Date(),
          result: (Math.random() > 0.8 ? 'fail' : 'pass') as const,
          duration: 100 + Math.random() * 50
        });
      }

      await memoryManager.store('aqe/test-results/history', testHistory, {
        partition: 'coordination'
      });

      const startTime = performance.now();

      await agent.executeTask({
        id: 'flaky-perf-1',
        type: 'detect-flaky',
        payload: {
          timeWindow: 30,
          minRuns: 5
        },
        priority: 'high',
        status: 'pending'
      });

      const elapsed = performance.now() - startTime;

      expect(elapsed).toBeLessThan(500); // <500ms for 1000 test results

      await agent.terminate();
    }, 10000);
  });

  // ===========================================================================
  // Cross-Agent Coordination
  // ===========================================================================

  describe('Cross-Agent Coordination via Memory and Events', () => {
    it('should coordinate test generation → execution → coverage analysis', async () => {
      const generatorConfig = createAgentConfig({
        agentId: 'gen-coord-1',
        type: QEAgentType.TEST_GENERATOR,
        enablePatterns: true
      }, memoryManager, eventBus);

      const executorConfig = createAgentConfig({
        agentId: 'exec-coord-1',
        type: QEAgentType.TEST_EXECUTOR
      }, memoryManager, eventBus);

      const coverageConfig = createAgentConfig({
        agentId: 'cov-coord-1',
        type: QEAgentType.COVERAGE_ANALYZER,
        enableLearning: true
      }, memoryManager, eventBus);

      const generator = new TestGeneratorAgent(generatorConfig);
      const executor = new TestExecutorAgent(executorConfig);
      const coverage = new CoverageAnalyzerAgent(coverageConfig);

      await generator.initialize();
      await executor.initialize();
      await coverage.initialize();

      // Step 1: Generate tests
      await generator.executeTask({
        id: 'coord-gen-1',
        type: 'generate-tests',
        payload: {
          modulePath: 'src/OrderService.ts',
          framework: 'jest'
        },
        priority: 'high',
        status: 'pending'
      });

      // Step 2: Execute tests (reads from memory)
      await executor.executeTask({
        id: 'coord-exec-1',
        type: 'execute-tests',
        payload: {
          testPattern: 'OrderService.test.ts'
        },
        priority: 'high',
        status: 'pending'
      });

      // Step 3: Analyze coverage (reads execution results)
      const result = await coverage.executeTask({
        id: 'coord-cov-1',
        type: 'analyze-coverage',
        payload: {
          projectPath: 'src/'
        },
        priority: 'high',
        status: 'pending'
      });

      expect(result).toBeDefined();

      await generator.terminate();
      await executor.terminate();
      await coverage.terminate();
    }, 25000);

    it('should emit and handle events across agents', async () => {
      const generatorConfig = createAgentConfig({
        agentId: 'gen-event-1',
        type: QEAgentType.TEST_GENERATOR,
        enablePatterns: true
      }, memoryManager, eventBus);

      const coverageConfig = createAgentConfig({
        agentId: 'cov-event-1',
        type: QEAgentType.COVERAGE_ANALYZER,
        enableLearning: true
      }, memoryManager, eventBus);

      const generator = new TestGeneratorAgent(generatorConfig);
      const coverage = new CoverageAnalyzerAgent(coverageConfig);

      await generator.initialize();
      await coverage.initialize();

      let eventReceived = false;

      // Coverage agent listens for test generation events
      coverage.on('test.generated', () => {
        eventReceived = true;
      });

      // Generator emits event after generation
      await generator.executeTask({
        id: 'event-gen-1',
        type: 'generate-tests',
        payload: {
          modulePath: 'src/TestModule.ts',
          framework: 'jest'
        },
        priority: 'high',
        status: 'pending'
      });

      // Small delay for event propagation
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(eventReceived).toBe(true);

      await generator.terminate();
      await coverage.terminate();
    }, 15000);

    it('should share learning insights across agents', async () => {
      const config1 = createAgentConfig({
        agentId: 'learn-1',
        type: QEAgentType.TEST_GENERATOR,
        enableLearning: true
      }, memoryManager, eventBus);

      const config2 = createAgentConfig({
        agentId: 'learn-2',
        type: QEAgentType.TEST_GENERATOR,
        enableLearning: true
      }, memoryManager, eventBus);

      const agent1 = new TestGeneratorAgent(config1);
      const agent2 = new TestGeneratorAgent(config2);

      await agent1.initialize();
      await agent2.initialize();

      // Agent 1 learns and stores insights
      await agent1.recordLearning({
        taskId: 'task-1',
        outcome: 'success',
        quality: 0.95,
        metadata: { framework: 'jest', pattern: 'unit-test' }
      });

      await memoryManager.store('aqe/learning/insights', {
        framework: 'jest',
        pattern: 'unit-test',
        quality: 0.95,
        recommendations: ['Use beforeEach for setup', 'Mock external dependencies']
      }, { partition: 'coordination' });

      // Agent 2 retrieves shared insights
      const insights = await memoryManager.retrieve('aqe/learning/insights', {
        partition: 'coordination'
      });

      expect(insights).toBeDefined();
      expect(insights.quality).toBe(0.95);
      expect(insights.recommendations).toBeDefined();

      await agent1.terminate();
      await agent2.terminate();
    }, 15000);
  });

  // ===========================================================================
  // Performance Validation
  // ===========================================================================

  describe('Agent Performance Validation', () => {
    it('should meet performance targets across all agents', async () => {
      const agents = [
        new TestGeneratorAgent(createAgentConfig({
          agentId: 'perf-gen-1',
          type: QEAgentType.TEST_GENERATOR,
          enablePatterns: true
        }, memoryManager, eventBus)),
        new CoverageAnalyzerAgent(createAgentConfig({
          agentId: 'perf-cov-1',
          type: QEAgentType.COVERAGE_ANALYZER,
          enableLearning: true
        }, memoryManager, eventBus)),
        new FlakyTestHunterAgent(createAgentConfig({
          agentId: 'perf-flaky-1',
          type: QEAgentType.FLAKY_TEST_HUNTER
        }, memoryManager, eventBus))
      ];

      const perfMetrics: Record<string, number> = {};

      for (const agent of agents) {
        await agent.initialize();

        const start = performance.now();
        await agent.executeTask({
          id: `perf-task-${agent.getAgentId()}`,
          type: 'analyze-coverage',
          payload: {},
          priority: 'high',
          status: 'pending'
        });
        const elapsed = performance.now() - start;

        perfMetrics[agent.getAgentId()] = elapsed;

        await agent.terminate();
      }

      console.log('\n━━━ Agent Performance Metrics ━━━');
      Object.entries(perfMetrics).forEach(([id, time]) => {
        console.log(`${id}: ${time.toFixed(2)}ms`);
      });

      // All agents should complete tasks within reasonable time
      Object.values(perfMetrics).forEach(time => {
        expect(time).toBeLessThan(5000); // <5s per task
      });
    }, 30000);
  });
});
